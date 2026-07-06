'use strict';
/* TS.renderDOM — DOMプレビューレンダラ（契約書§3・§6.5。P2でモーションエンジン対応）
   構造: .tl-wrap(skew・outクリップ) > .tl-metal(blockモーション・inクリップ) >
         .tl-sizer + 各レイヤーspan(absolute)
   P2: CSSアニメを廃止し、applyMotion(scene,t) が TS.motion の数値をインラインstyleへ書く
   （Canvasと同一エバリュエータ＝パリティの構造的保証。契約書§3.5）。
   charMode: 行の中を ユニットspan（文字/単語。inline-block）に分解。fill/shine はユニットspanに
   「ブロック箱サイズの背景を静止位置で位置合わせ」して持たせる（グラデは文字と一緒に動く）。 */
(function () {
  window.TS = window.TS || {};

  var ZWSP = '​';
  var NBSP = ' ';
  var FALLBACK = "'Hiragino Sans','Noto Sans CJK JP','Yu Gothic',sans-serif";

  function fmt(n) {
    if (!isFinite(n)) return '0';
    var r = Math.round(n * 1e5) / 1e5;
    if (Math.abs(r) < 1e-9) r = 0;
    return String(r);
  }

  function outerW(scene) { return TS.scene.outerW(scene); }

  function strokeColorCSS(c) {
    if (!c) return '#000000';
    if (typeof c === 'string') return c;
    if (c.type === 'solid' && c.value) return c.value;
    if (c.value) return c.value;
    if (c.stops && c.stops[0]) return c.stops[0][0];
    return '#000000';
  }
  function paintCSS(c) { return TS.color.toCSS(c); }

  /* ==== ユニットspanの箱・アンカー計算（純計算。DOM計測なし＝detachedでも正しい） ====
     箱top = baselineY - max(strut/メンバーの A_s + halfLeading_s)（インラインブロックの行ボックス模型）
     アンカー(変形基準) cx,cy は TS.motion.units の値。transform-origin = アンカー - 箱原点 */
  function halfOf(lh, fontPx, A, D) { return (lh * fontPx - (A + D)) / 2; }

  /* ==== マークアップ構築 ====
     blockモード: 行 > (テキスト | 倍率span)。
     charMode  : 行 > ユニットspan(inline-block, data-tlu) > 文字（scale≠1はspanのfont-size em）。
     ユニットが単語のときは複数文字を内包。空白はNBSPでユニット外の素テキスト。 */
  function buildMarkup(scene, layout, unitsInfo, reg) {
    var frag = document.createDocumentFragment();
    var lines = layout.lines;
    for (var li = 0; li < lines.length; li++) {
      var ln = lines[li];
      var lineEl = document.createElement('span');
      lineEl.className = 'tl-line';
      lineEl.style.display = 'block';
      var has = false;

      if (!layout.charMode) {
        for (var si = 0; si < ln.segments.length; si++) {
          var seg = ln.segments[si];
          if (!seg.text) continue;
          has = true;
          if (seg.scale === 1) lineEl.appendChild(document.createTextNode(seg.text));
          else {
            var sp = document.createElement('span');
            sp.style.fontSize = fmt(seg.scale) + 'em';
            sp.style.verticalAlign = 'baseline';
            sp.textContent = seg.text;
            lineEl.appendChild(sp);
          }
        }
      } else {
        // ユニットspan列を構築（単語ユニットは複数文字・複数セグメントを跨ぎ得る）
        var currentUnit = null, currentEl = null;
        for (var si2 = 0; si2 < ln.segments.length; si2++) {
          var seg2 = ln.segments[si2];
          var chars = seg2.chars || [];
          for (var ci = 0; ci < chars.length; ci++) {
            var cell = chars[ci];
            var uid = unitsInfo.idOf(li, si2, ci);
            has = true;
            if (uid < 0) {   // 単語モードの空白: ユニット外の素テキスト
              currentUnit = null; currentEl = null;
              lineEl.appendChild(document.createTextNode(cell.ch === ' ' ? NBSP : cell.ch));
              continue;
            }
            if (uid !== currentUnit) {
              currentUnit = uid;
              currentEl = document.createElement('span');
              currentEl.className = 'tl-ch';
              currentEl.setAttribute('data-tlu', String(uid));
              currentEl.style.display = 'inline-block';
              currentEl.style.verticalAlign = 'baseline';
              lineEl.appendChild(currentEl);
              if (reg) reg(uid, currentEl, li, si2, ci, ln, seg2);
            }
            if (seg2.scale === 1) currentEl.appendChild(document.createTextNode(cell.ch === ' ' ? NBSP : cell.ch));
            else {
              var cs = document.createElement('span');
              cs.style.fontSize = fmt(seg2.scale) + 'em';
              cs.style.verticalAlign = 'baseline';
              cs.textContent = cell.ch === ' ' ? NBSP : cell.ch;
              currentEl.appendChild(cs);
            }
          }
        }
      }
      if (!has) lineEl.textContent = ZWSP;
      frag.appendChild(lineEl);
    }
    return frag;
  }

  function layerSpan(cls) {
    var s = document.createElement('span');
    s.className = 'tl-layer ' + cls;
    s.style.position = 'absolute';
    s.style.top = '0';
    s.style.left = '0';
    s.style.right = '0';
    return s;
  }

  TS.renderDOM = {
    mount: function (container) {
      var el = document.createElement('div');
      el.className = 'tl-wrap';
      el.style.display = 'inline-block';
      container.appendChild(el);

      // 再構築ごとに確定する参照
      var S = null;
      /* S = { scene, layout, unitsInfo, metal,
               unitEls: [ [span,...] ],          // unitId -> 全レイヤー分のspan
               unitMeta: [ {spanX, spanTop, originX, originY} ],
               shineTargets: [ {el, spanX, spanTop, isUnit, ly} ],
               blockShine: [ {el, ly} ] } */
      var lastT = null;

      // ---- ユニットspanの静的スタイル（箱位置=純計算） ----
      function unitBoxMeta(layout, uid, unitsInfo, members) {
        // members: [{ln,seg,cell}]（同一ユニット）
        var minX = Infinity, maxX = -Infinity, above = 0;
        var ln = members[0].ln;
        // strut（ユニットspanの継承フォント=基準サイズ）
        above = layout.strut.A + halfOf(layout.lineHeight, layout.basePx, layout.strut.A, layout.strut.D);
        members.forEach(function (m) {
          var x0 = m.seg.x + m.cell.x;
          if (x0 < minX) minX = x0;
          if (x0 + m.cell.w > maxX) maxX = x0 + m.cell.w;
          var a = m.seg.A + halfOf(layout.lineHeight, m.seg.fontPx, m.seg.A, m.seg.D);
          if (a > above) above = a;
        });
        var u = unitsInfo.units[uid];
        var spanTop = ln.baselineY - above;
        return {
          spanX: minX, spanTop: spanTop,
          originX: u.cx - minX, originY: u.cy - spanTop
        };
      }

      function update(scene) {
        var layout = TS.layout.measure(scene);
        var unitsInfo = (TS.motion && layout.charMode) ? TS.motion.units(scene, layout) : null;

        S = { scene: scene, layout: layout, unitsInfo: unitsInfo,
              metal: null, unitEls: [], unitMeta: [], shineTargets: [], blockShine: [] };

        var text = scene.text || {};
        var basePx = text.size || 130;
        var ow = outerW(scene);

        // ユニットメンバー収集（メタ計算用）
        var memberMap = {};
        var reg = unitsInfo ? function (uid, elx, li, si, ci, ln, seg) { /* 生成順のフックのみ */ } : null;
        if (unitsInfo) {
          layout.lines.forEach(function (ln, li) {
            ln.segments.forEach(function (seg, si) {
              (seg.chars || []).forEach(function (cell, ci) {
                var uid = unitsInfo.idOf(li, si, ci);
                if (uid < 0) return;
                (memberMap[uid] = memberMap[uid] || []).push({ ln: ln, seg: seg, cell: cell });
              });
            });
          });
          Object.keys(memberMap).forEach(function (k) {
            S.unitMeta[+k] = unitBoxMeta(layout, +k, unitsInfo, memberMap[k]);
          });
        }

        // 斜体（skewはwrap。outクリップもwrapに載る）
        var skew = text.italicSkew || 0;
        el.style.transform = skew ? 'skewX(' + fmt(skew) + 'deg)' : '';
        el.style.clipPath = '';

        var metal = document.createElement('div');
        metal.className = 'tl-metal';
        var ms = metal.style;
        ms.position = 'relative';
        ms.display = 'inline-block';
        ms.fontFamily = '"' + (text.font || 'Noto Sans JP') + '",' + FALLBACK;
        ms.fontWeight = String(text.weight || 900);
        ms.fontSize = basePx + 'px';
        ms.letterSpacing = fmt(text.letterSpacing || 0) + 'em';
        ms.lineHeight = String(text.lineHeight == null ? 1 : text.lineHeight);
        ms.textAlign = text.align || 'center';
        ms.whiteSpace = 'nowrap';
        ms.color = 'transparent';
        S.metal = metal;

        // 1レイヤー分のマークアップを作り、ユニットspanを登録しながらcloneで使い回す
        function makeMarkup(register) {
          return buildMarkup(scene, layout, unitsInfo, register);
        }
        // clone後にユニットspanを拾って unitEls へ
        function collectUnits(root, forShine, ly) {
          if (!unitsInfo) return;
          var spans = root.querySelectorAll('[data-tlu]');
          for (var i = 0; i < spans.length; i++) {
            var sp = spans[i];
            var uid = +sp.getAttribute('data-tlu');
            var meta = S.unitMeta[uid];
            if (meta) sp.style.transformOrigin = fmt(meta.originX) + 'px ' + fmt(meta.originY) + 'px';
            (S.unitEls[uid] = S.unitEls[uid] || []).push(sp);
            if (forShine) S.shineTargets.push({ el: sp, spanX: meta ? meta.spanX : 0, spanTop: meta ? meta.spanTop : 0, ly: ly });
          }
        }

        var proto = makeMarkup(null);

        // sizer（in-flow・静止レイアウト＝ブロック箱の確定。アニメしない）
        var sizer = document.createElement('span');
        sizer.className = 'tl-sizer';
        sizer.style.display = 'block';
        sizer.style.color = 'transparent';
        sizer.appendChild(proto.cloneNode(true));
        metal.appendChild(sizer);

        // shadows[]
        var shadows = scene.shadows || [];
        for (var i = 0; i < shadows.length; i++) {
          var sh = shadows[i];
          var s = layerSpan('tl-shadow');
          var col = sh.color || '#000000';
          var w = ow + 2 * (sh.spread || 0) / basePx;
          if (w > 0) s.style.setProperty('-webkit-text-stroke', fmt(w) + 'em ' + col);
          s.style.color = col;
          s.style.transform = 'translate(' + fmt(sh.x || 0) + 'px,' + fmt(sh.y || 0) + 'px)';
          if (sh.blur) s.style.filter = 'blur(' + fmt(sh.blur / 2) + 'px)';
          if (sh.opacity != null && sh.opacity !== 1) s.style.opacity = String(sh.opacity);
          s.appendChild(proto.cloneNode(true));
          collectUnits(s, false, null);
          metal.appendChild(s);
        }

        // layers[]
        var layers = scene.layers || [];
        var period = 3;
        for (var j = 0; j < layers.length; j++) {
          var ly = layers[j];
          if (!ly || ly.visible === false) continue;
          var span = null;
          if (ly.type === 'extrude') {
            span = layerSpan('tl-extrude');
            var edge = ly.color || '#000000';
            if (ow > 0) span.style.setProperty('-webkit-text-stroke', fmt(ow) + 'em ' + edge);
            span.style.color = edge;
            var angle = ly.angle == null ? 90 : ly.angle;
            var rad = angle * Math.PI / 180;
            var ux = Math.cos(rad), uy = Math.sin(rad);
            var steps = ly.steps || 0, dist = ly.dist || 0;
            var parts = [];
            for (var k = 1; k <= steps; k++) {
              parts.push(fmt(ux * dist * k) + 'em ' + fmt(uy * dist * k) + 'em ' + edge);
            }
            var ct = ly.contact;
            if (ct && ct.enabled) {
              var cd = ct.dist == null ? 0.1 : ct.dist;
              var co = ct.opacity == null ? 0.4 : ct.opacity;
              parts.push(fmt(ux * cd) + 'em ' + fmt(uy * cd) + 'em rgba(0,0,0,' + fmt(co) + ')');
            }
            if (parts.length) span.style.textShadow = parts.join(', ');
            span.appendChild(proto.cloneNode(true));
            collectUnits(span, false, null);
          } else if (ly.type === 'stroke') {
            span = layerSpan('tl-stroke');
            // inside はCSSで正確に表現できないため中央幅wで近似表示
            //（書き出し=Canvas はマスク合成で正確にグリフ内側へ乗る。パネルに注記あり）
            var w2 = (ly.align === 'outside' ? 2 : 1) * (ly.width || 0);
            if (w2 > 0) span.style.setProperty('-webkit-text-stroke', fmt(w2) + 'em ' + strokeColorCSS(ly.color));
            span.style.color = 'transparent';
            if (ly.opacity != null && ly.opacity !== 1) span.style.opacity = String(ly.opacity);
            span.appendChild(proto.cloneNode(true));
            collectUnits(span, false, null);
          } else if (ly.type === 'fill') {
            span = layerSpan('tl-fill');
            span.style.setProperty('-webkit-text-fill-color', 'transparent');
            span.style.color = 'transparent';
            if (ly.opacity != null && ly.opacity !== 1) span.style.opacity = String(ly.opacity);
            span.appendChild(proto.cloneNode(true));
            if (!layout.charMode) {
              span.style.background = paintCSS(ly.color);
              span.style.setProperty('-webkit-background-clip', 'text');
              span.style.backgroundClip = 'text';
            } else {
              collectUnits(span, false, null);
              // ユニットspanに「ブロック箱サイズの背景」を静止位置で位置合わせ（契約§3.5）
              var spans = span.querySelectorAll('[data-tlu]');
              for (var q = 0; q < spans.length; q++) {
                var sp2 = spans[q];
                var meta2 = S.unitMeta[+sp2.getAttribute('data-tlu')];
                sp2.style.background = paintCSS(ly.color);
                sp2.style.backgroundSize = fmt(layout.block.w) + 'px ' + fmt(layout.block.h) + 'px';
                sp2.style.backgroundPosition = fmt(-(meta2 ? meta2.spanX : 0)) + 'px ' + fmt(-(meta2 ? meta2.spanTop : 0)) + 'px';
                sp2.style.setProperty('-webkit-background-clip', 'text');
                sp2.style.backgroundClip = 'text';
                sp2.style.setProperty('-webkit-text-fill-color', 'transparent');
              }
            }
          } else if (ly.type === 'shine') {
            span = layerSpan('tl-shine');
            span.style.setProperty('-webkit-text-fill-color', 'transparent');
            span.style.color = 'transparent';
            var bandCss = 'linear-gradient(' + fmt(ly.angle == null ? 105 : ly.angle) + 'deg,' +
              'rgba(255,255,255,0) ' + fmt(50 - (ly.band == null ? 0.16 : ly.band) * 50) + '%,' +
              'rgba(255,255,255,' + fmt(ly.opacity == null ? 0.98 : ly.opacity) + ') 50%,' +
              'rgba(255,255,255,0) ' + fmt(50 + (ly.band == null ? 0.16 : ly.band) * 50) + '%)';
            span.appendChild(proto.cloneNode(true));
            if (!layout.charMode) {
              span.style.backgroundImage = bandCss;
              span.style.backgroundSize = fmt((ly.span == null ? 2.5 : ly.span) * 100) + '% 100%';
              span.style.backgroundRepeat = 'no-repeat';
              span.style.setProperty('-webkit-background-clip', 'text');
              span.style.backgroundClip = 'text';
              span.style.backgroundPosition = '-9999px 0'; // 静止時は非表示。driverが動かす
              S.blockShine.push({ el: span, ly: ly });
            } else {
              collectUnits(span, true, ly);
              var spans2 = span.querySelectorAll('[data-tlu]');
              for (var q2 = 0; q2 < spans2.length; q2++) {
                var sp3 = spans2[q2];
                sp3.style.backgroundImage = bandCss;
                sp3.style.backgroundRepeat = 'no-repeat';
                sp3.style.backgroundSize = fmt((ly.span == null ? 2.5 : ly.span) * layout.block.w) + 'px ' + fmt(layout.block.h) + 'px';
                sp3.style.backgroundPosition = '-99999px 0';
                sp3.style.setProperty('-webkit-background-clip', 'text');
                sp3.style.backgroundClip = 'text';
                sp3.style.setProperty('-webkit-text-fill-color', 'transparent');
              }
            }
          }
          if (span) metal.appendChild(span);
        }

        while (el.firstChild) el.removeChild(el.firstChild);
        el.appendChild(metal);

        // seek状態の再適用（なければ静止フレーム）
        applyMotion(lastT);
      }

      // props → transform 文字列（sx/sy対応。順序: translate→rotate→scale = Canvasと同一合成）
      function transformOf(p, basePx) {
        var tf = '';
        if (p.dx || p.dy) tf += 'translate(' + fmt(p.dx * basePx) + 'px,' + fmt(p.dy * basePx) + 'px)';
        if (p.rot) tf += ' rotate(' + fmt(p.rot) + 'deg)';
        var sx = p.s * (p.sx == null ? 1 : p.sx);
        var sy = p.s * (p.sy == null ? 1 : p.sy);
        if (sx !== 1 || sy !== 1) tf += ' scale(' + fmt(sx) + ',' + fmt(sy) + ')';
        return tf;
      }

      // ---- モーション適用（インラインstyleへ書く。Canvasと同一エバリュエータ） ----
      function applyMotion(t) {
        if (!S) return;
        lastT = t == null ? null : t;
        var scene = S.scene, layout = S.layout, metal = S.metal;
        var basePx = layout.basePx;

        function setShinePos(posPercent) {
          // blockモード: %指定（backgroundSize 250%と組で従来式）
          for (var i = 0; i < S.blockShine.length; i++) {
            var bs = S.blockShine[i];
            bs.el.style.backgroundPosition = (posPercent == null) ? '-9999px 0' : fmt(posPercent) + '% 0';
          }
          // charMode: ブロック座標 offsetX をユニットローカルへ
          for (var k = 0; k < S.shineTargets.length; k++) {
            var st = S.shineTargets[k];
            if (posPercent == null) { st.el.style.backgroundPosition = '-99999px 0'; continue; }
            var spanW = (st.ly.span == null ? 2.5 : st.ly.span) * layout.block.w;
            var offsetX = (layout.block.w - spanW) * posPercent / 100;
            st.el.style.backgroundPosition = fmt(offsetX - st.spanX) + 'px ' + fmt(-st.spanTop) + 'px';
          }
        }

        if (t == null || !TS.motion) {
          // 静止: 変形/クリップ/シャインなし
          metal.style.opacity = '';
          metal.style.transform = '';
          metal.style.filter = '';
          metal.style.clipPath = '';
          el.style.clipPath = '';
          metal.style.visibility = '';
          for (var u = 0; u < S.unitEls.length; u++) {
            var els0 = S.unitEls[u] || [];
            for (var e0 = 0; e0 < els0.length; e0++) {
              els0[e0].style.transform = '';
              els0[e0].style.opacity = '';
              els0[e0].style.filter = '';
              els0[e0].style.visibility = '';
            }
          }
          setShinePos(null);
          return;
        }

        var blockFx = TS.motion.evalBlock(scene, t);
        var mode = layout.charMode ? TS.motion.unitMode(scene) : 'block';

        // クリップ（in=metal / out=wrap。矩形→polygon。座標はブロックローカルpx）
        function polyOf(clip) {
          var r = TS.motion.clipRect(clip, layout, basePx, TS.scene.outerW(scene));
          return 'polygon(' + fmt(r.x) + 'px ' + fmt(r.y) + 'px,' + fmt(r.x + r.w) + 'px ' + fmt(r.y) + 'px,' +
            fmt(r.x + r.w) + 'px ' + fmt(r.y + r.h) + 'px,' + fmt(r.x) + 'px ' + fmt(r.y + r.h) + 'px)';
        }
        metal.style.clipPath = blockFx.clipIn ? polyOf(blockFx.clipIn) : '';
        el.style.clipPath = blockFx.clipOut ? polyOf(TS.motion.outClipSpec(blockFx.clipOut)) : '';

        setShinePos(blockFx.shine ? blockFx.shine.posPercent : null);

        if (mode === 'block') {
          var pr = TS.motion.evalUnit(scene, t, 0, 1);
          if (!pr) {
            metal.style.visibility = 'hidden';
            return;
          }
          metal.style.visibility = '';
          metal.style.opacity = pr.opacity === 1 ? '' : String(pr.opacity);
          metal.style.transform = transformOf(pr, basePx);
          metal.style.filter = TS.motion.filterCSS(pr, basePx);
          return;
        }

        // charMode: ユニットごと
        metal.style.visibility = '';
        metal.style.opacity = '';
        metal.style.transform = '';
        metal.style.filter = '';
        var n = S.unitsInfo.units.length;
        for (var i2 = 0; i2 < n; i2++) {
          var props = TS.motion.evalUnit(scene, t, i2, n);
          var els = S.unitEls[i2] || [];
          for (var e2 = 0; e2 < els.length; e2++) {
            var st2 = els[e2].style;
            if (!props) { st2.visibility = 'hidden'; continue; }
            st2.visibility = '';
            st2.opacity = props.opacity === 1 ? '' : String(props.opacity);
            st2.transform = transformOf(props, basePx);
            st2.filter = TS.motion.filterCSS(props, basePx);
          }
        }
      }

      function setTime(t) { applyMotion(t); }

      return { el: el, update: update, setTime: setTime };
    }
  };
})();
