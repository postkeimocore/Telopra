'use strict';
/* TS.exportCSS — Scene → CSS / 自己完結HTML 書き出し（仕様書7章 Tier2）
   マークアップは TS.renderDOM をそのまま再利用（detached DOMに静止状態で描いて直列化）するため、
   プレビューと出力が構造ごと一致する。
   P2でCSSアニメ駆動を廃止したため、モーションは TS.motion（単一エバリュエータ）を
   30fps でサンプリングして @keyframes を自前生成する（見た目は正確・容量はやや大）。
   TS.motion 不在時は静止テロップとして書き出す（フォールバック）。 */
(function () {
  window.TS = window.TS || {};

  var FPS = 30;      // サンプリングレート（契約書§3.5: 1/30s刻み）
  var EPS = 1e-9;

  // 数値整形（px/deg/倍率。小数4桁丸め）
  function fmt(n) {
    if (!isFinite(n)) return '0';
    var r = Math.round(n * 1e4) / 1e4;
    if (Math.abs(r) < 1e-9) r = 0;
    return String(r);
  }

  // 宣言の連結（前段が空でも安全に）
  function joinDecl(a, b) { return a ? a + ';' + b : b; }

  // インラインブロックの行ボックス模型（render-dom.js の halfOf と同式）
  function halfOf(lh, fontPx, A, D) { return (lh * fontPx - (A + D)) / 2; }

  // ユニットspanの箱位置メタ（render-dom.js の unitBoxMeta と同じ純計算。
  // charModeの shine 背景 background-position(px) の位置合わせに使う）
  function unitMetas(layout, unitsInfo) {
    var acc = [];
    var strutAbove = layout.strut.A + halfOf(layout.lineHeight, layout.basePx, layout.strut.A, layout.strut.D);
    layout.lines.forEach(function (ln, li) {
      ln.segments.forEach(function (seg, si) {
        (seg.chars || []).forEach(function (cell, ci) {
          var uid = unitsInfo.idOf(li, si, ci);
          if (uid < 0) return;
          var mt = acc[uid];
          if (!mt) mt = acc[uid] = { minX: Infinity, above: strutAbove, ln: ln };
          var x0 = seg.x + cell.x;
          if (x0 < mt.minX) mt.minX = x0;
          var a = seg.A + halfOf(layout.lineHeight, seg.fontPx, seg.A, seg.D);
          if (a > mt.above) mt.above = a;
        });
      });
    });
    var metas = [];
    for (var i = 0; i < acc.length; i++) {
      metas.push(acc[i] ? { spanX: acc[i].minX, spanTop: acc[i].ln.baselineY - acc[i].above }
                        : { spanX: 0, spanTop: 0 });
    }
    return metas;
  }

  /* ==== sampleKeyframes: TS.motion のサンプリングで @keyframes 群＋対応セレクタCSSを生成 ====
     - blockモード: .tl-metal に opacity/transform/filter（＋clipInがあれば clip-path polygon）
     - clipOut    : .tl-wrap に clip-path（dir反転・p=1-進行。render-dom と同規則）
     - charMode   : ユニットごとに [data-tlu="i"]。shineレイヤー内は background-position を
                    追加した別名keyframes（.tl-shine [data-tlu="i"]。詳細度で通常版を上書き）
     - blockモードの shine: .tl-shine.tl-layer に background-position(%表記)
     モーション実質無し（全サンプル同値）の keyframes は生成しない。 */
  function sampleKeyframes(scene) {
    if (!TS.motion || !TS.layout) return '';   // エンジン不在 → 静止書き出し
    var m = scene.motion || {};
    if (!m['in'] && !m.out && !(m.loop && m.loop.length)) return '';  // モーション無し

    var layout = TS.layout.measure(scene);
    var tl = TS.motion.timeline(scene);
    var D = tl.D;
    if (!(D > 0)) return '';
    var basePx = layout.basePx;
    var outerWem = TS.scene.outerW(scene);

    // ---- サンプル時刻列 t=0..D（最初と最後は必ず打つ） ----
    var times = [];
    for (var k = 0; k / FPS < D - EPS; k++) times.push(k / FPS);
    times.push(D);
    var NS = times.length;

    // keyframeセレクタ%（小数4桁丸め。最終サンプルは必ず100%、途中は100%に丸め上げない）
    function pctOf(i) {
      if (i === NS - 1) return '100';
      var p = Math.round(times[i] / D * 1e6) / 1e4;
      return String(p >= 100 ? 99.9999 : p);
    }

    // クリップ矩形 → polygon（render-dom.js の polyOf と同形式。pxはブロックローカル）
    function polyOf(clip) {
      var r = TS.motion.clipRect(clip, layout, basePx, outerWem);
      return 'polygon(' + fmt(r.x) + 'px ' + fmt(r.y) + 'px,' + fmt(r.x + r.w) + 'px ' + fmt(r.y) + 'px,' +
        fmt(r.x + r.w) + 'px ' + fmt(r.y + r.h) + 'px,' + fmt(r.x) + 'px ' + fmt(r.y + r.h) + 'px)';
    }
    var FULL_POLY = polyOf({ dir: 'right', p: 1 });   // クリップ無し＝全面矩形（p=1はどの方向でも同一）

    // ---- ブロックレベル（clipIn/clipOut/shine位置）を全サンプル分先に評価 ----
    var blocks = [];
    var hasClipIn = false, hasClipOut = false, hasShinePos = false;
    for (var b = 0; b < NS; b++) {
      var fx = TS.motion.evalBlock(scene, times[b]);
      blocks.push(fx);
      if (fx.clipIn) hasClipIn = true;
      if (fx.clipOut) hasClipOut = true;
      if (fx.shine) hasShinePos = true;
    }

    // ---- ユニットprops列のユーティリティ ----
    var IDENT = { opacity: 1, dx: 0, dy: 0, s: 1, sx: 1, sy: 1, rot: 0, blur: 0, hue: 0, glow: 0 };
    function hiddenOf(ref) {
      return { opacity: 0, dx: ref.dx, dy: ref.dy, s: ref.s, sx: ref.sx, sy: ref.sy,
               rot: ref.rot, blur: ref.blur, hue: ref.hue, glow: ref.glow };
    }
    // 非表示(null)サンプルは「opacity:0＋最寄り可視サンプルの変形値」に置換
    //（visibilityは使わない。登場直前/退場直後に変形がidentityへ補間される見た目の乱れも防ぐ）
    function fillNulls(raw) {
      var out = new Array(raw.length);
      var i, next = null, prev = null;
      for (i = raw.length - 1; i >= 0; i--) {
        if (raw[i]) { next = raw[i]; out[i] = raw[i]; }
        else out[i] = next ? hiddenOf(next) : null;   // 先頭側のnull → 直後の可視値
      }
      for (i = 0; i < raw.length; i++) {
        if (raw[i]) prev = raw[i];
        else if (!out[i]) out[i] = hiddenOf(prev || IDENT);  // 末尾側のnull → 直前の可視値
      }
      return out;
    }
    // 使用チャンネル判定（動かない性質はkeyframesに書かない＝容量削減）
    function channelsOf(raw) {
      var ch = { op: false, tf: false, flt: false };
      for (var i = 0; i < raw.length; i++) {
        var p = raw[i];
        if (!p) { ch.op = true; continue; }
        if (p.opacity !== 1) ch.op = true;
        if (p.dx || p.dy || p.rot || p.s !== 1 || (p.sx != null && p.sx !== 1) || (p.sy != null && p.sy !== 1)) ch.tf = true;
        if (p.blur > 0 || p.hue || p.glow > 0) ch.flt = true;
      }
      return ch;
    }
    // props → 宣言文字列（transformは関数リストを常に固定＝関数単位で補間される。
    // filterは TS.motion.filterCSS（両レンダラと同一文字列。空はnoneで補間の連続性を保つ））
    function declOf(p, ch) {
      var d = [];
      if (ch.op) d.push('opacity:' + fmt(p.opacity));
      if (ch.tf) {
        var sx = p.s * (p.sx == null ? 1 : p.sx);
        var sy = p.s * (p.sy == null ? 1 : p.sy);
        d.push('transform:translate(' + fmt(p.dx * basePx) + 'px,' + fmt(p.dy * basePx) + 'px)' +
          ' rotate(' + fmt(p.rot) + 'deg) scale(' + fmt(sx) + ',' + fmt(sy) + ')');
      }
      if (ch.flt) d.push('filter:' + (TS.motion.filterCSS(p, basePx) || 'none'));
      return d.join(';');
    }

    // ---- @keyframes 1本の組み立て ----
    // 連続する同値サンプルはまとめる（値が変わる点＝定常区間の両端だけ打つ。最初と最後は必ず打つ）。
    // 全サンプル同値ならアニメ不要として null。
    function kfRule(name, decls) {
      var i, same = true;
      for (i = 1; i < decls.length; i++) if (decls[i] !== decls[0]) { same = false; break; }
      if (same) return null;
      var out = '@keyframes ' + name + '{\n';
      var last = decls.length - 1;
      for (i = 0; i <= last; i++) {
        if (i > 0 && i < last && decls[i] === decls[i - 1] && decls[i] === decls[i + 1]) continue;
        out += pctOf(i) + '%{' + decls[i] + '}\n';
      }
      return out + '}\n';
    }

    var rules = [];   // @keyframes 群
    var binds = [];   // セレクタ → animation の対応
    function bind(sel, name) {
      binds.push(sel + '{animation:' + name + ' ' + fmt(D) + 's linear infinite}');
    }

    // 可視な shine レイヤー（motion.loop の 'shine' と対で使う。無ければ生成しない）
    var shineLy = null;
    var lys = scene.layers || [];
    for (var si = 0; si < lys.length; si++) {
      if (lys[si] && lys[si].type === 'shine' && lys[si].visible !== false) { shineLy = lys[si]; break; }
    }
    var doShine = hasShinePos && !!shineLy;

    // clipIn / clipOut の宣言列（無サンプルは全面矩形＝クリップ無し相当）
    function clipInDecl(i) { return 'clip-path:' + (blocks[i].clipIn ? polyOf(blocks[i].clipIn) : FULL_POLY); }
    function clipOutDecl(i) {
      var c = blocks[i].clipOut;
      // out側の可視領域は TS.motion.outClipSpec（端=反転補集合 / 中央系=同方向で閉じる）
      return 'clip-path:' + (c ? polyOf(TS.motion.outClipSpec(c)) : FULL_POLY);
    }

    var i, d, r;

    if (!layout.charMode) {
      // ==== blockモード: .tl-metal（opacity/transform/filter＋clipIn） ====
      var raw = [];
      for (i = 0; i < NS; i++) raw.push(TS.motion.evalUnit(scene, times[i], 0, 1));
      var ch = channelsOf(raw);
      var filled = fillNulls(raw);
      var decls = [];
      for (i = 0; i < NS; i++) {
        d = declOf(filled[i], ch);
        if (hasClipIn) d = joinDecl(d, clipInDecl(i));
        decls.push(d);
      }
      r = kfRule('tsMetal', decls);
      if (r) { rules.push(r); bind('.tl-metal', 'tsMetal'); }

      // shine: background-position(%表記。render-dom の blockShine と同式)
      if (doShine) {
        var sd = [];
        for (i = 0; i < NS; i++) sd.push('background-position:' + fmt(blocks[i].shine.posPercent) + '% 0');
        r = kfRule('tsShine', sd);
        if (r) { rules.push(r); bind('.tl-shine.tl-layer', 'tsShine'); }
      }
    } else {
      // ==== charMode: .tl-metal は clipIn のみ（変形はユニット側） ====
      if (hasClipIn) {
        var cds = [];
        for (i = 0; i < NS; i++) cds.push(clipInDecl(i));
        r = kfRule('tsMetal', cds);
        if (r) { rules.push(r); bind('.tl-metal', 'tsMetal'); }
      }

      var unitsInfo = TS.motion.units(scene, layout);
      var n = unitsInfo.units.length;
      var metas = doShine ? unitMetas(layout, unitsInfo) : null;
      var spanW = doShine ? (shineLy.span == null ? 2.5 : shineLy.span) * layout.block.w : 0;

      for (var u = 0; u < n; u++) {
        var rawU = [];
        for (i = 0; i < NS; i++) rawU.push(TS.motion.evalUnit(scene, times[i], u, n));
        var chU = channelsOf(rawU);
        var fu = fillNulls(rawU);
        var du = [];
        for (i = 0; i < NS; i++) du.push(declOf(fu[i], chU));
        r = kfRule('tsU' + u, du);
        if (r) { rules.push(r); bind('[data-tlu="' + u + '"]', 'tsU' + u); }

        // shineレイヤー内のユニット: 同じ宣言に background-position(px) を追加した別名
        //（.tl-shine [data-tlu] の方が詳細度が高く、通常版のanimationを上書きする）
        if (doShine) {
          var meta = metas[u] || { spanX: 0, spanTop: 0 };
          var ds = [];
          for (i = 0; i < NS; i++) {
            var offsetX = (layout.block.w - spanW) * blocks[i].shine.posPercent / 100;
            ds.push(joinDecl(du[i], 'background-position:' +
              fmt(offsetX - meta.spanX) + 'px ' + fmt(-meta.spanTop) + 'px'));
          }
          r = kfRule('tsU' + u + 's', ds);
          if (r) { rules.push(r); bind('.tl-shine [data-tlu="' + u + '"]', 'tsU' + u + 's'); }
        }
      }
    }

    // ==== clipOut: .tl-wrap（両モード共通） ====
    if (hasClipOut) {
      var ods = [];
      for (i = 0; i < NS; i++) ods.push(clipOutDecl(i));
      r = kfRule('tsWrap', ods);
      if (r) { rules.push(r); bind('.tl-wrap', 'tsWrap'); }
    }

    if (!rules.length) return '';   // 実質静止（全サンプル同値）
    return '/* サンプリング書き出し（' + FPS + 'fps・全長' + fmt(D) + 's）: TS.motion の値を\n' +
      '   @keyframes 化しているためキーフレーム数が多く、容量やや大。見た目はプレビューと一致 */\n' +
      rules.join('') + binds.join('\n') + '\n';
  }

  // シーンをdetached DOMに描いて outerHTML を得る（静止状態。モーションは上記keyframesが担う）
  function markupHTML(scene) {
    var host = document.createElement('div');
    var h = TS.renderDOM.mount(host);
    h.update(scene);
    return h.el.outerHTML;
  }

  // 使用フォントの Google Fonts css2 URL（単一ファミリ+ウェイト）
  function fontHref(scene) {
    var fam = scene.text.font || 'Noto Sans JP';
    var cat = (TS.FONTS || []).filter(function (f) { return f.family === fam; })[0];
    var famq = fam.replace(/ /g, '+');
    if (!cat) return null; // カタログ外（システムフォント等）はlink不要
    var w = TS.fonts.nearestWeight(fam, scene.text.weight || 900);
    return 'https://fonts.googleapis.com/css2?family=' + famq +
      (cat.weights.length > 1 ? ':wght@' + w : '') + '&display=swap';
  }

  var STRUCT_NOTE =
    '/* 構造メモ:\n' +
    '   .tl-wrap(斜体skew・outクリップ) > .tl-metal(フォント/blockモーション・inクリップ) >\n' +
    '     .tl-sizer(サイズ確定用・不可視) + シャドウ/押し出し/縁/塗り/照り の各span(absolute)\n' +
    '   charMode時は各レイヤー内に [data-tlu="i"] のユニットspan。\n' +
    '   位置・色などは全てインラインstyleで自己完結。モーションは以下の@keyframesが担う */\n';

  // CSSテキスト（コピペ用: @import + 構造メモ + サンプリング生成の@keyframes群）
  function cssText(scene) {
    var href = fontHref(scene);
    return (href ? "@import url('" + href + "');\n\n" : '') +
      STRUCT_NOTE + sampleKeyframes(scene) + '\n';
  }

  // 自己完結HTML（単体で開けばモーションが再生される一枚ファイル）
  function htmlDocument(scene) {
    var href = fontHref(scene);
    var name = (scene.text.content || 'telop').split('\n')[0].slice(0, 12);
    return '<!DOCTYPE html>\n<html lang="ja">\n<head>\n<meta charset="utf-8">\n' +
      '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
      '<title>' + esc(name) + ' — Telopra 書き出し</title>\n' +
      (href ? '<link rel="preconnect" href="https://fonts.googleapis.com">\n' +
              '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n' +
              '<link href="' + href + '" rel="stylesheet">\n' : '') +
      '<style>\n' +
      '/* 背景確認用: ?bg=light / dark / (無指定で透過) */\n' +
      'html,body{height:100%;margin:0}\n' +
      'body{display:flex;align-items:center;justify-content:center;-webkit-font-smoothing:antialiased}\n' +
      sampleKeyframes(scene) + '\n' +
      '</style>\n</head>\n<body>\n' +
      markupHTML(scene) + '\n' +
      '<script>\n' +
      "var bg=new URLSearchParams(location.search).get('bg');\n" +
      "if(bg!==null)document.body.style.background=bg==='light'?'#e9ebee':bg==='dark'?'#15181d':'#5f656d';\n" +
      '</scr' + 'ipt>\n</body>\n</html>\n';
  }

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  TS.exportCSS = {
    sampleKeyframes: sampleKeyframes,
    cssText: cssText,
    htmlDocument: htmlDocument,
    markupHTML: markupHTML
  };
})();
