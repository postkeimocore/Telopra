'use strict';
/* TS.renderCanvas — Canvas2D レンダラ（ARCHITECTURE.md §3 / §6.6。P2でモーションエンジン対応）
   TS.layout.measure と TS.motion の数値のみで描く純関数。DOMレンダラと同一の見た目が目標。
   モーション: t=null は静止（in完了相当・ループ/クリップなし）。
   charMode ではレイヤー順を保ったまま「レイヤー → ユニット → 文字」の順に描く（DOMのspan構造と同順）。 */
(function () {
  window.TS = window.TS || {};

  var FALLBACK = "'Hiragino Sans','Noto Sans CJK JP','Yu Gothic',sans-serif";

  // ---- 一時キャンバス（シャドウ/グループ合成用。毎フレームの生成を避けて再利用） ----
  var tmpCv = null, tmpCtx = null;
  function getTempCtx(w, h) {
    if (!tmpCv) {
      tmpCv = document.createElement('canvas');
      tmpCtx = tmpCv.getContext('2d');
    }
    if (tmpCv.width < w) tmpCv.width = w;
    if (tmpCv.height < h) tmpCv.height = h;
    tmpCtx.setTransform(1, 0, 0, 1, 0, 0);
    tmpCtx.clearRect(0, 0, tmpCv.width, tmpCv.height);
    return tmpCtx;
  }
  // グループ合成用の2枚目（tmpCvはシャドウ用に併用されるため分離）
  var grpCv = null, grpCtx = null;
  function getGroupCtx(w, h) {
    if (!grpCv) {
      grpCv = document.createElement('canvas');
      grpCtx = grpCv.getContext('2d');
    }
    if (grpCv.width < w) grpCv.width = w;
    if (grpCv.height < h) grpCv.height = h;
    grpCtx.setTransform(1, 0, 0, 1, 0, 0);
    grpCtx.clearRect(0, 0, grpCv.width, grpCv.height);
    return grpCtx;
  }

  function fontStr(weight, fontPx, family) {
    return weight + ' ' + fontPx + 'px "' + family + '",' + FALLBACK;
  }
  function nbsp(ch) { return ch === ' ' ? ' ' : ch; } // charModeの空白はNBSP（§3.5）

  /* ==== フレーム状態（render() 冒頭で確定し、描画関数群が共有する） ==== */
  var F = null;
  /* F = { ctx, scene, layout, basePx, outerWem, blockBox, t,
           mode, unitsInfo, unitProps[], blockProps } */

  // ---- グリフ走査 -------------------------------------------------------------
  // unitId=null: 全体（blockモード=セグメント一括 / charModeでも全ユニット走査に使う）
  // unitId>=0 : そのユニットに属する文字のみ
  function eachGlyph(ctx, ox, oy, unitId, fn) {
    var layout = F.layout, scene = F.scene;
    var lines = layout.lines;
    for (var li = 0; li < lines.length; li++) {
      var line = lines[li];
      for (var si = 0; si < line.segments.length; si++) {
        var seg = line.segments[si];
        if (!seg.text) continue;
        ctx.font = fontStr(scene.text.weight, seg.fontPx, scene.text.font);
        ctx.letterSpacing = layout.lsPx + 'px';  // 固定px（§4）。font設定後に毎回
        if (!layout.charMode) {
          if (unitId == null || unitId === 0) fn(seg.text, seg.x + ox, line.baselineY + oy);
          continue;
        }
        var chars = seg.chars || [];
        for (var ci = 0; ci < chars.length; ci++) {
          if (unitId != null && F.unitsInfo.idOf(li, si, ci) !== unitId) continue;
          var c = chars[ci];
          fn(nbsp(c.ch), seg.x + c.x + ox, line.baselineY + oy);
        }
      }
    }
  }

  // シルエット＝グリフ ∪ 最外縁リング（§3.1）
  function drawSilhouette(ctx, strokeWem, paint, ox, oy, unitId) {
    var lw = strokeWem > 0 ? strokeWem * F.layout.basePx : 0;
    ctx.lineJoin = 'round';
    ctx.miterLimit = 2;
    ctx.fillStyle = paint;
    if (lw > 0) { ctx.strokeStyle = paint; ctx.lineWidth = lw; }
    eachGlyph(ctx, ox, oy, unitId, function (text, x, y) {
      if (lw > 0) ctx.strokeText(text, x, y);
      ctx.fillText(text, x, y);
    });
  }

  // ---- ユニット変形（契約§3.5: translate→rotate→scale をアンカー中心で。DOMのorigin指定と同一） ----
  function unitTransform(ctx, u, props) {
    var b = F.basePx;
    ctx.translate(u.cx + props.dx * b, u.cy + props.dy * b);
    if (props.rot) ctx.rotate(props.rot * Math.PI / 180);
    var sx = props.s * (props.sx == null ? 1 : props.sx);
    var sy = props.s * (props.sy == null ? 1 : props.sy);
    if (sx !== 1 || sy !== 1) ctx.scale(sx, sy);
    ctx.translate(-u.cx, -u.cy);
  }

  // ユニットごとに fn(unitId) を「変形・アルファ・filter適用済み」の ctx で呼ぶ。
  // blockモードは unitId=null 一発（変形は render() が適用済み）
  function forEachUnit(ctx, extraAlpha, fn) {
    if (F.mode === 'block' || !F.layout.charMode) { fn(null, 1); return; }
    for (var i = 0; i < F.unitsInfo.units.length; i++) {
      var props = F.unitProps[i];
      if (!props) continue;   // 非表示ユニット
      ctx.save();
      unitTransform(ctx, F.unitsInfo.units[i], props);
      ctx.globalAlpha = ctx.globalAlpha * props.opacity * (extraAlpha == null ? 1 : extraAlpha);
      var flt = TS.motion ? TS.motion.filterCSS(props, F.basePx) : '';
      if (flt) ctx.filter = flt;
      fn(i, props.opacity);
      ctx.restore();
    }
  }

  // シルエットを一時キャンバスに不透明で描き、blur＋均一アルファで合成（§3.3。ユニット変形も温存）
  // unitId 指定時: ctx の現在変換（ユニット変形適用済み）でそのユニットの文字だけを温める
  function compositeSilhouette(ctx, strokeWem, color, ox, oy, blurPx, alpha, unitId) {
    if (alpha <= 0) return;
    var tc = getTempCtx(ctx.canvas.width, ctx.canvas.height);
    tc.textBaseline = 'alphabetic';
    tc.textAlign = 'left';
    if (unitId != null) {
      tc.setTransform(ctx.getTransform());
      drawSilhouette(tc, strokeWem, color, ox, oy, unitId);
    } else if (F.mode === 'block' || !F.layout.charMode) {
      tc.setTransform(ctx.getTransform());
      drawSilhouette(tc, strokeWem, color, ox, oy, null);
    } else {
      // 全ユニット（ドロップシャドウ用）: DOMのシャドウ層spanの内部合成（各unit spanが
      // 自身のopacityで順に描かれる）と等価になるよう、tmpへ unit opacity 込みで重ねる
      for (var i = 0; i < F.unitsInfo.units.length; i++) {
        var props = F.unitProps[i];
        if (!props) continue;
        tc.save();
        tc.setTransform(ctx.getTransform());
        unitTransform(tc, F.unitsInfo.units[i], props);
        tc.globalAlpha = props.opacity;
        if (props.blur > 0) tc.filter = 'blur(' + (props.blur * F.basePx) + 'px)';
        drawSilhouette(tc, strokeWem, color, ox, oy, i);
        tc.restore();
        tc.filter = 'none';
      }
    }
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (blurPx > 0) ctx.filter = 'blur(' + blurPx + 'px)';
    ctx.globalAlpha = alpha;
    ctx.drawImage(tmpCv, 0, 0);
    ctx.restore();
  }

  // extrude（§3.2）: 接地影 → 深い段 → 浅い段 → オフセット0
  // charModeではDOMの構造（1ユニットspan=1要素として接地影+段+本体を描き、そのspanのopacityで
  // グループ減光）に合わせ、ユニットごとに処理する。opacity<1のユニットはグループ合成
  // （段の重なりがアルファ加算で濃くならないように＝CSSのopacityと同義）。
  function drawExtrude(ctx, ly) {
    var basePx = F.basePx;
    var rad = (ly.angle == null ? 90 : ly.angle) * Math.PI / 180;
    var ux = Math.cos(rad), uy = Math.sin(rad);
    var c = ly.contact;
    var cOn = c && c.enabled;
    var cOp = cOn ? (c.opacity == null ? 0.4 : c.opacity) : 0;
    var cd = cOn ? (c.dist || 0) * basePx : 0;
    var steps = ly.steps || 0, dist = ly.dist || 0;

    function drawSteps(target, unitId) {
      for (var k = steps; k >= 1; k--) {
        var d = k * dist * basePx;
        drawSilhouette(target, F.outerWem, ly.color, ux * d, uy * d, unitId);
      }
      drawSilhouette(target, F.outerWem, ly.color, 0, 0, unitId);
    }

    if (F.mode === 'block' || !F.layout.charMode) {
      if (cOn) compositeSilhouette(ctx, F.outerWem, '#000000', ux * cd, uy * cd, 0, cOp);
      drawSteps(ctx, null);
      return;
    }
    for (var i = 0; i < F.unitsInfo.units.length; i++) {
      var props = F.unitProps[i];
      if (!props) continue;
      var u = F.unitsInfo.units[i];
      if (props.opacity >= 1 && props.blur <= 0 && !props.glow) {
        // 不透明ユニット: 直接描画（接地影のみユニット単位で均一アルファ合成）。hueのみは線形操作なので直接filterで可
        ctx.save();
        unitTransform(ctx, u, props);
        if (props.hue) ctx.filter = 'hue-rotate(' + (Math.round(props.hue * 1e2) / 1e2) + 'deg)';
        if (cOn) compositeSilhouette(ctx, F.outerWem, '#000000', ux * cd, uy * cd, 0, cOp, i);
        drawSteps(ctx, i);
        ctx.restore();
      } else {
        // フェード/グロー中ユニット: [接地影+段+本体] を不透明で組んでから filter+opacity を一括適用
        var gc = getGroupCtx(ctx.canvas.width, ctx.canvas.height);
        gc.textBaseline = 'alphabetic';
        gc.textAlign = 'left';
        gc.setTransform(ctx.getTransform());
        unitTransform(gc, u, props);
        if (cOn) compositeSilhouette(gc, F.outerWem, '#000000', ux * cd, uy * cd, 0, cOp, i);
        drawSteps(gc, i);
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = props.opacity;
        var flt = TS.motion ? TS.motion.filterCSS(props, F.basePx * F.deviceScale) : '';
        if (flt) ctx.filter = flt;   // デバイス空間合成なのでpx系はdeviceScale換算
        ctx.drawImage(grpCv, 0, 0);
        ctx.restore();
      }
    }
  }

  // stroke（リングのみ）。align: center=そのまま / outside=幅2倍 / inside=マスク合成（下記）
  function drawStrokeLayer(ctx, ly) {
    var w = ly.width || 0;
    if (w <= 0) return;
    var inside = (ly.align === 'inside');
    forEachUnit(ctx, (ly.opacity == null ? 1 : ly.opacity), function (unitId) {
      if (!inside) {
        ctx.lineJoin = 'round';
        ctx.miterLimit = 2;
        ctx.strokeStyle = TS.color.toCanvasPaint(ctx, ly.color, F.blockBox);
        ctx.lineWidth = (ly.align === 'outside' ? 2 * w : w) * F.basePx;
        eachGlyph(ctx, 0, 0, unitId, function (text, x, y) { ctx.strokeText(text, x, y); });
        return;
      }
      // 内側縁: [幅2wの中央ストローク] ∩ [グリフ形状] を一時キャンバスで作って合成
      // → 幅wぶんがグリフ内側にだけ乗る（塗りの上に置くレイヤー順で使う）
      var tc = getTempCtx(ctx.canvas.width, ctx.canvas.height);
      tc.textBaseline = 'alphabetic';
      tc.textAlign = 'left';
      tc.setTransform(ctx.getTransform());
      tc.lineJoin = 'round';
      tc.miterLimit = 2;
      tc.strokeStyle = TS.color.toCanvasPaint(tc, ly.color, F.blockBox);
      tc.lineWidth = 2 * w * F.basePx;
      eachGlyph(tc, 0, 0, unitId, function (text, x, y) { tc.strokeText(text, x, y); });
      tc.globalCompositeOperation = 'destination-in';
      tc.fillStyle = '#ffffff';
      eachGlyph(tc, 0, 0, unitId, function (text, x, y) { tc.fillText(text, x, y); });
      tc.globalCompositeOperation = 'source-over';
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(tmpCv, 0, 0);
      ctx.restore();
    });
  }

  // fill（グリフ面のみ）: グラデはブロック箱に写像（§3.4）。
  // charModeではユニット変形の内側で描くため「静止位置で写像したグラデが文字と一緒に動く」＝契約§3.5と一致
  function drawFillLayer(ctx, ly) {
    forEachUnit(ctx, (ly.opacity == null ? 1 : ly.opacity), function (unitId) {
      ctx.fillStyle = TS.color.toCanvasPaint(ctx, ly.color, F.blockBox);
      eachGlyph(ctx, 0, 0, unitId, function (text, x, y) { ctx.fillText(text, x, y); });
    });
  }

  // shine（§3.5）: shineループの位置。ループ未使用/静止時は描かない
  function drawShineLayer(ctx, ly) {
    var shine = F.blockFx && F.blockFx.shine;
    if (!shine) return;
    var W = F.layout.block.w, H = F.layout.block.h;
    var span = ly.span == null ? 2.5 : ly.span;
    var band = ly.band == null ? 0.16 : ly.band;
    var op = ly.opacity == null ? 0.98 : ly.opacity;
    var offsetX = (W - span * W) * shine.posPercent / 100;
    var colorObj = {
      type: 'linear',
      angle: ly.angle == null ? 105 : ly.angle,
      stops: [
        ['rgba(255,255,255,0)', Math.max(0, 0.5 - band / 2)],
        ['rgba(255,255,255,' + op + ')', 0.5],
        ['rgba(255,255,255,0)', Math.min(1, 0.5 + band / 2)]
      ]
    };
    forEachUnit(ctx, null, function (unitId) {
      ctx.fillStyle = TS.color.toCanvasPaint(ctx, colorObj, { x: offsetX, y: 0, w: span * W, h: H });
      eachGlyph(ctx, 0, 0, unitId, function (text, x, y) { ctx.fillText(text, x, y); });
    });
  }

  // クリップ矩形の適用（in=そのまま / out=方向反転・可視率1-p。契約§3.5）
  function applyClips(ctx, blockFx) {
    if (!blockFx) return;
    var L = F.layout;
    function rectOf(clip) { return TS.motion.clipRect(clip, L, F.basePx, F.outerWem); }
    if (blockFx.clipIn) {
      var r1 = rectOf(blockFx.clipIn);
      ctx.beginPath(); ctx.rect(r1.x, r1.y, r1.w, r1.h); ctx.clip();
    }
    if (blockFx.clipOut) {
      var r2 = rectOf(TS.motion.outClipSpec(blockFx.clipOut));
      ctx.beginPath(); ctx.rect(r2.x, r2.y, r2.w, r2.h); ctx.clip();
    }
  }

  // ---- 公開API（§6.6） ----
  function render(ctx, scene, opts) {
    opts = opts || {};
    var t = opts.t === undefined ? null : opts.t;
    var scale = opts.scale == null ? 1 : opts.scale;
    var dx = opts.dx || 0, dy = opts.dy || 0;

    var layout = TS.layout.measure(scene);
    var W = layout.block.w, H = layout.block.h;

    // フレーム状態の確定
    F = {
      ctx: ctx, scene: scene, layout: layout,
      basePx: layout.basePx,
      outerWem: TS.scene.outerW(scene),
      blockBox: { x: 0, y: 0, w: W, h: H },
      mode: 'block', unitsInfo: null, unitProps: null,
      blockFx: null, baseAlpha: 1
    };

    var blockProps = null;
    if (t !== null && TS.motion) {
      var tl = TS.motion.timeline(scene);
      F.blockFx = TS.motion.evalBlock(scene, t);
      F.mode = layout.charMode ? TS.motion.unitMode(scene) : 'block';
      if (F.mode === 'block') {
        blockProps = TS.motion.evalUnit(scene, t, 0, 1);
        if (!blockProps) return;   // 完全非表示
      } else {
        F.unitsInfo = TS.motion.units(scene, layout);
        F.unitProps = [];
        var n = F.unitsInfo.units.length;
        var anyVisible = false;
        for (var ui = 0; ui < n; ui++) {
          var pr = TS.motion.evalUnit(scene, t, ui, n);
          F.unitProps.push(pr);
          if (pr) anyVisible = true;
        }
        if (!anyVisible && !(F.blockFx.clipIn || F.blockFx.clipOut)) return;
      }
    }

    ctx.save();
    // 変換合成: デバイス → キャンバス中心へ → §1配置transform → skewX → （blockモーション変形）→ ブロックローカル
    ctx.setTransform(scale, 0, 0, scale, dx, dy);
    ctx.translate(scene.canvas.w / 2, scene.canvas.h / 2);
    // §1 配置transform（キャンバス中心基準。順序 translate→rotate→scale。DOMの .tl-wrap と一致）
    var utf = scene.transform;
    if (utf) {
      if (utf.x || utf.y) ctx.translate(utf.x || 0, utf.y || 0);
      if (utf.rotate) ctx.rotate(utf.rotate * Math.PI / 180);
      if (utf.scale != null && utf.scale !== 1) ctx.scale(utf.scale, utf.scale);
    }
    var skewDeg = (scene.text && scene.text.italicSkew) || 0;
    if (skewDeg) ctx.transform(1, 0, Math.tan(skewDeg * Math.PI / 180), 1, 0, 0);
    ctx.translate(-W / 2, -H / 2);

    // クリップ（ブロックローカル座標。skewの内側=DOMの.tl-metal/.tl-wrapのclip-pathと同じ空間）
    applyClips(ctx, F.blockFx);

    // blockモードのユニット変形（DOM: .tl-metal の transform に相当。中心=ブロック中心）
    if (blockProps) {
      var b = F.basePx, cx = W / 2, cy = H / 2;
      ctx.translate(cx + blockProps.dx * b, cy + blockProps.dy * b);
      if (blockProps.rot) ctx.rotate(blockProps.rot * Math.PI / 180);
      // 軸別スケール(sx/sy)も適用（flip/flipOut/jelly等。DOMのtransformOf・charモードのunitTransformと一致）
      var bsx = blockProps.s * (blockProps.sx == null ? 1 : blockProps.sx);
      var bsy = blockProps.s * (blockProps.sy == null ? 1 : blockProps.sy);
      if (bsx !== 1 || bsy !== 1) ctx.scale(bsx, bsy);
      ctx.translate(-cx, -cy);
    }
    F.deviceScale = scale;

    // フェード/filter中は「不透明で組んでから一括適用」（CSSのグループopacity/filterと同義。
    // per-drawのglobalAlphaだと押し出しの重なり等でアルファが加算されDOMとズレる）
    var fade = !!(blockProps && (blockProps.opacity < 1 || blockProps.blur > 0 ||
                                 blockProps.hue || blockProps.glow > 0));
    var target = ctx;
    if (fade) {
      target = getGroupCtx(ctx.canvas.width, ctx.canvas.height);
      target.setTransform(ctx.getTransform());
    }
    target.textBaseline = 'alphabetic';
    target.textAlign = 'left';
    target.direction = 'ltr';
    target.globalAlpha = 1;

    // 1. ドロップシャドウ（配列順＝奥→手前）
    var shadows = scene.shadows || [];
    for (var i = 0; i < shadows.length; i++) {
      var sh = shadows[i];
      if (!sh) continue;
      var effW = F.outerWem + 2 * (sh.spread || 0) / layout.basePx;
      compositeSilhouette(target, effW, sh.color, sh.x || 0, sh.y || 0,
        ((sh.blur || 0) / 2) * scale,
        (sh.opacity == null ? 1 : sh.opacity));
    }

    // 2. レイヤー（配列順）
    var layers = scene.layers || [];
    for (var j = 0; j < layers.length; j++) {
      var ly = layers[j];
      if (!ly || ly.visible === false) continue;
      var keep = target.globalAlpha;
      if (ly.type === 'extrude') drawExtrude(target, ly);
      else if (ly.type === 'stroke') drawStrokeLayer(target, ly);
      else if (ly.type === 'fill') drawFillLayer(target, ly);
      else if (ly.type === 'shine') drawShineLayer(target, ly);
      target.globalAlpha = keep;
    }

    if (fade) {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = blockProps.opacity;
      var bflt = TS.motion ? TS.motion.filterCSS(blockProps, F.basePx * scale) : '';
      if (bflt) ctx.filter = bflt;   // デバイス空間合成なのでpx系はscale換算
      ctx.drawImage(grpCv, 0, 0);
      ctx.restore();
    }

    ctx.restore();
    F = null;
  }

  function renderToCanvas(canvas, scene, opts) {
    opts = opts || {};
    var scale = opts.scale == null ? 1 : opts.scale;
    var w = Math.max(1, Math.round(scene.canvas.w * scale));
    var h = Math.max(1, Math.round(scene.canvas.h * scale));
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    var ctx = canvas.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);
    render(ctx, scene, opts);
    return ctx;
  }

  TS.renderCanvas = {
    render: render,
    renderToCanvas: renderToCanvas
  };
})();
