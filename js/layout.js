'use strict';
// TS.layout — 共有テキストレイアウト（契約書 §4）。DOM / Canvas 両レンダラが同じ数値を使う
(function () {
  window.TS = window.TS || {};

  // 既存資産と同一のフォールバック列
  var FALLBACK = "'Hiragino Sans','Noto Sans CJK JP','Yu Gothic',sans-serif";

  var _ctx = null;
  // 計測用の共有 hidden canvas
  function sharedCtx() {
    if (!_ctx) {
      var cv = document.createElement('canvas');
      cv.width = 32;
      cv.height = 32;
      _ctx = cv.getContext('2d');
    }
    return _ctx;
  }

  // ctx.font 文字列の組み立て（両レンダラ共通規約）
  function fontString(weight, fontPx, family) {
    return weight + ' ' + fontPx + 'px "' + family + '", ' + FALLBACK;
  }

  // 指定フォントで text を計測。letterSpacing は scale に関わらず固定px（CSS継承の計算値と一致させる）
  function measureSeg(c, weight, fontPx, family, lsPx, text) {
    c.font = fontString(weight, fontPx, family);
    if ('letterSpacing' in c) c.letterSpacing = lsPx + 'px';
    var m = c.measureText(text);
    // fontBoundingBox* 不在環境は 0.88 / 0.12 * fontPx にフォールバック
    var A = (m.fontBoundingBoxAscent !== undefined) ? m.fontBoundingBoxAscent : 0.88 * fontPx;
    var D = (m.fontBoundingBoxDescent !== undefined) ? m.fontBoundingBoxDescent : 0.12 * fontPx;
    return { width: m.width, A: A, D: D };
  }

  // charMode: 空白は NBSP に置換して幅を確保（DOMの文字spanと同一規則。契約書§3.5）
  function charForMeasure(ch) { return ch === ' ' ? ' ' : ch; }

  // セグメントを文字セルへ分解（サロゲートペアは1セル）。幅=Σ文字advance（カーニング無効化＝DOMと同条件）
  function measureChars(c, weight, fontPx, family, lsPx, text) {
    c.font = fontString(weight, fontPx, family);
    if ('letterSpacing' in c) c.letterSpacing = lsPx + 'px';
    var cells = [], x = 0;
    var arr = Array.from(text);
    for (var i = 0; i < arr.length; i++) {
      var ch = arr[i];
      var w = c.measureText(charForMeasure(ch)).width;
      cells.push({ ch: ch, x: x, w: w });
      x += w;
    }
    return { cells: cells, width: x };
  }

  // scene → Layout（§4 の構造）
  // charMode（stagger有効 or 文字単位ループ使用時）は文字advanceの合計で行幅を出し、
  // 各セグメントに chars[{ch,x,w}]（セグメントローカルx）を付与する（契約書§3.5）
  function measure(scene) {
    var t = scene.text;
    var basePx = t.size;
    var lsPx = (t.letterSpacing || 0) * basePx;
    var lh = t.lineHeight;
    var c = sharedCtx();
    var content = t.content || '';
    var charMode = !!(TS.motion && typeof TS.motion.needsCharMode === 'function'
      ? TS.motion.needsCharMode(scene)
      : (scene.motion && scene.motion.stagger && scene.motion.stagger.enabled));

    // content 全文字列インデックス → scale（runs。改行も1文字として数える）
    var scaleAt = new Array(content.length).fill(1);
    (t.runs || []).forEach(function (r) {
      if (!r || !Array.isArray(r.range)) return;
      var s = Math.max(0, r.range[0] | 0);
      var e = Math.min(content.length, r.range[1] | 0);
      for (var i = s; i < e; i++) scaleAt[i] = r.scale;
    });

    // ストラット（基準フォント scale=1）。全行の寄与に必ず含め、空行はこれだけで行ボックスを立てる
    var strut = measureSeg(c, t.weight, basePx, t.font, lsPx, 'M');
    var strutHalf = (lh * basePx - (strut.A + strut.D)) / 2;
    var strutAbove = strut.A + strutHalf;
    var strutBelow = strut.D + strutHalf;

    var rawLines = content.split('\n');
    var lines = [];
    var idx = 0;      // content 全体での行頭インデックス
    var top = 0;
    var blockW = 0;

    rawLines.forEach(function (lineText) {
      // 連続する同 scale の文字をひとつのセグメントに
      var parts = [];
      var cur = null;
      for (var i = 0; i < lineText.length; i++) {
        var sc = scaleAt[idx + i];
        if (cur && cur.scale === sc) cur.text += lineText[i];
        else { cur = { text: lineText[i], scale: sc }; parts.push(cur); }
      }

      // 行ボックス計算（CSS line-height:数値 モデル。halfLeading は負もあり得る）
      var above = strutAbove;
      var below = strutBelow;
      var width = 0;
      var segments = parts.map(function (p) {
        var fontPx = basePx * p.scale;
        var m = measureSeg(c, t.weight, fontPx, t.font, lsPx, p.text);
        var segW = m.width;
        var chars = null;
        if (charMode) {
          var mc = measureChars(c, t.weight, fontPx, t.font, lsPx, p.text);
          chars = mc.cells;
          segW = mc.width;  // charModeの行幅は文字advance合計（DOMの文字span列と一致）
        }
        var half = (lh * fontPx - (m.A + m.D)) / 2;
        if (m.A + half > above) above = m.A + half;
        if (m.D + half > below) below = m.D + half;
        var seg = { text: p.text, scale: p.scale, fontPx: fontPx, x: width, w: segW,
                    A: m.A, D: m.D, chars: chars };
        width += segW;   // measureText は末尾 letter-spacing を含む（Chrome）
        return seg;
      });

      var height = above + below;
      lines.push({ top: top, height: height, baselineY: top + above, width: width, x: 0, segments: segments });
      if (width > blockW) blockW = width;
      top += height;
      idx += lineText.length + 1; // 改行の1文字分を進める
    });

    // align 適用 → 行左端 x を確定し、セグメント x をブロックローカルへ
    lines.forEach(function (ln) {
      ln.x = (t.align === 'left') ? 0
        : (t.align === 'right') ? (blockW - ln.width)
        : (blockW - ln.width) / 2;
      ln.segments.forEach(function (s) { s.x += ln.x; });
    });

    return {
      basePx: basePx,
      lsPx: lsPx,
      charMode: charMode,
      lineHeight: lh,
      strut: { A: strut.A, D: strut.D },   // 基準フォントの計測（ユニットspanの箱計算用）
      lines: lines,
      block: { w: blockW, h: top }
    };
  }

  TS.layout = {
    measure: measure,
    fontString: fontString,   // レンダラが ctx.font を同一規約で組むための補助
    FALLBACK: FALLBACK
  };
})();
