'use strict';
/* TS.exportLottie — Lottie (bodymovin JSON) 書き出し（仕様書7章 Tier3 =「近似」を正直に扱う）

   v1 の対応範囲（UIにも明示すること）:
   - テキスト: Lottie の**テキストレイヤー**（グリフのパス化はしない）。フォントは名前参照のため
     再生側の環境（lottie-web ならページ、AE ならOS）に同フォントが必要。AEでは編集可能なテキストとして読める。
   - 塗り: グラデーションは**単色近似**（中間ストップの色）。縁: 最外の1本のみ（中央揃え・単色）。
   - モーション: **ブロック単位**の in/loop/out（位置・スケール・回転・不透明度）を 30fps サンプリングで
     キーフレーム化。文字ごと（stagger/wave等）・ワイプ・blur/hue/glow・押し出し・シャイン・影は含まれない。
   - リッチな金属質感やパチンコ演出をそのまま運びたい場合は Tier1（透過mov / PNG連番）を使う。 */
(function () {
  window.TS = window.TS || {};

  var FR = 30;   // サンプリング＝コンポFPS

  function hexToRgb01(css) {
    // #rrggbb / rgba() どちらも受け、0..1 の [r,g,b] に
    if (/^#/.test(css)) {
      var h = css.replace('#', '');
      if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
      return [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255];
    }
    var m = /rgba?\(([^)]+)\)/.exec(css);
    if (m) {
      var p = m[1].split(',').map(parseFloat);
      return [p[0] / 255, p[1] / 255, p[2] / 255];
    }
    return [1, 1, 1];
  }

  // 塗りの単色近似: solid はそのまま、グラデは位置0.5に最も近いストップ
  function approxFill(colorObj) {
    if (!colorObj) return '#ffffff';
    if (colorObj.type === 'solid') return colorObj.value;
    var stops = colorObj.stops || [];
    if (!stops.length) return '#ffffff';
    var best = stops[0];
    stops.forEach(function (s) {
      if (Math.abs(s[1] - 0.5) < Math.abs(best[1] - 0.5)) best = s;
    });
    return best[0];
  }
  function strokeColorOf(c) {
    if (!c) return null;
    if (typeof c === 'string') return c;
    if (c.type === 'solid') return c.value;
    if (c.stops && c.stops[0]) return c.stops[0][0];
    return null;
  }

  function weightStyle(w) {
    if (w >= 800) return 'Black';
    if (w >= 700) return 'Bold';
    if (w >= 500) return 'Medium';
    if (w >= 400) return 'Regular';
    return 'Light';
  }

  // 値列 → Lottieキーフレーム（値が変わるフレームのみ hold で打つ。全て同値なら static）
  function toKeyframes(frames, mapFn) {
    var k = [];
    var lastStr = null;
    for (var i = 0; i < frames.length; i++) {
      var v = mapFn(frames[i]);
      var str = JSON.stringify(v);
      if (str !== lastStr) {
        k.push({ t: i, s: v, h: 1 });   // 30fpsサンプルのholdは実質フレーム精度のリニア
        lastStr = str;
      }
    }
    if (k.length === 1) return { a: 0, k: k[0].s };
    return { a: 1, k: k };
  }

  /* build(scene) -> { json, notes[] }  */
  function build(scene) {
    var notes = [];
    var layout = TS.layout.measure(scene);
    var W = scene.canvas.w, H = scene.canvas.h;
    var basePx = layout.basePx;
    var tl = TS.motion.timeline(scene);
    var totalF = Math.max(1, Math.round(tl.D * FR));

    // ---- 近似の告知を収集（正直に列挙） ----
    if (TS.motion.unitMode(scene) !== 'block') {
      notes.push('文字ごとモーション（stagger/ウェーブ等）はLottie出力ではブロック一括の動きに簡略化されます');
    }
    var lys = scene.layers || [];
    var fill = null, strokes = [], hasExtrude = false, hasShine = false;
    lys.forEach(function (l) {
      if (!l || l.visible === false) return;
      if (l.type === 'fill' && !fill) fill = l;
      if (l.type === 'stroke') strokes.push(l);
      if (l.type === 'extrude') hasExtrude = true;
      if (l.type === 'shine') hasShine = true;
    });
    if (fill && fill.color && fill.color.type !== 'solid') notes.push('グラデ塗りは単色（中間色）に近似されます');
    if (strokes.length > 1) notes.push('縁取りは最外の1本のみ書き出されます');
    if (hasExtrude) notes.push('3D押し出しは含まれません');
    if (hasShine) notes.push('照り（シャイン）は含まれません');
    if ((scene.shadows || []).length) notes.push('ドロップシャドウは含まれません');

    // ---- モーションのサンプリング（ブロック=ユニット0） ----
    var frames = [];
    for (var i = 0; i < totalF; i++) {
      var t = i / FR;
      var pr = TS.motion.evalUnit(scene, t, 0, 1) ||
        { opacity: 0, dx: 0, dy: 0, s: 1, sx: 1, sy: 1, rot: 0 };
      frames.push(pr);
      if (pr.blur > 0 || pr.hue || pr.glow > 0) {
        if (notes.indexOf('blur/色相/発光のエフェクトは含まれません') < 0) {
          notes.push('blur/色相/発光のエフェクトは含まれません');
        }
      }
    }
    var fx0 = TS.motion.evalBlock(scene, 0.0001);
    if (fx0.clipIn || fx0.clipOut) notes.push('ワイプ/パカッのクリップ演出は含まれません（フェードで代替してください）');

    // ---- テキストレイヤー座標系: 原点=1行目ベースライン（中央揃え） ----
    var baseline0 = layout.lines.length ? layout.lines[0].baselineY : basePx;
    var anchorY = layout.block.h / 2 - baseline0;   // ブロック中心（レイヤーローカル=1行目ベースライン原点）
    var round2 = function (v) { return Math.round(v * 100) / 100; };

    var ks = {
      o: toKeyframes(frames, function (p) { return [Math.round(Math.max(0, Math.min(1, p.opacity)) * 100)]; }),
      r: toKeyframes(frames, function (p) { return [round2(p.rot)]; }),
      p: toKeyframes(frames, function (p) {
        return [round2(W / 2 + p.dx * basePx), round2(H / 2 + p.dy * basePx), 0];
      }),
      a: { a: 0, k: [0, round2(anchorY), 0] },
      s: toKeyframes(frames, function (p) {
        var sx = p.s * (p.sx == null ? 1 : p.sx) * 100;
        var sy = p.s * (p.sy == null ? 1 : p.sy) * 100;
        return [round2(sx), round2(sy), 100];
      })
    };
    // Lottieのopacity/rotationは静的時スカラー（アニメ時は s:[v] のままでよい）
    if (ks.o.a === 0) ks.o.k = ks.o.k[0];
    if (ks.r.a === 0) ks.r.k = ks.r.k[0];

    var family = scene.text.font;
    var fName = family + ' ' + weightStyle(scene.text.weight);
    var textDoc = {
      s: basePx,
      f: fName,
      t: (scene.text.content || '').replace(/\n/g, '\r'),
      j: 2,                                             // 中央揃え
      tr: Math.round((scene.text.letterSpacing || 0) * 1000),   // 1/1000em
      lh: round2((scene.text.lineHeight == null ? 1 : scene.text.lineHeight) * basePx),
      ls: 0,
      fc: hexToRgb01(approxFill(fill && fill.color))
    };
    var outer = null;
    strokes.forEach(function (s) {
      var w = (s.align === 'outside' ? 2 : 1) * (s.width || 0);
      if (!outer || w > outer.w) outer = { w: w, color: strokeColorOf(s.color) };
    });
    if (outer && outer.w > 0 && outer.color) {
      textDoc.sc = hexToRgb01(outer.color);
      textDoc.sw = round2(outer.w * basePx);
      textDoc.of = false;   // 塗りが縁の上（本ツールのスタック順と同じ）
    }

    var json = {
      v: '5.7.4', fr: FR, ip: 0, op: totalF, w: W, h: H,
      nm: 'Telopra - ' + (scene.text.content || '').split('\n')[0].slice(0, 12),
      ddd: 0, assets: [],
      fonts: { list: [{ fName: fName, fFamily: family, fStyle: weightStyle(scene.text.weight), ascent: 74 }] },
      layers: [{
        ddd: 0, ind: 1, ty: 5, nm: 'telop', sr: 1,
        ks: ks, ao: 0,
        t: {
          d: { k: [{ s: textDoc, t: 0 }] },
          p: {}, m: { g: 1, a: { a: 0, k: [0, 0] } }, a: []
        },
        ip: 0, op: totalF, st: 0, bm: 0
      }],
      markers: []
    };
    notes.push('フォント「' + family + '」は再生環境側に必要です（Webは同フォントの読み込み、AEはOSにインストール）');
    return { json: json, notes: notes };
  }

  TS.exportLottie = { build: build, FR: FR };
})();
