'use strict';
// TS.color — 色・グラデーション共通表現（契約書 §2 色オブジェクト / §3.4 写像 / §6.1）
(function () {
  window.TS = window.TS || {};

  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

  // '#rgb' / '#rrggbb' → {r,g,b}（0..255）
  function hexToRgb(hex) {
    var h = String(hex).trim().replace(/^#/, '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h.slice(0, 6), 16);
    if (isNaN(n)) n = 0;
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  // hex → {h:0..360, s:0..1, l:0..1}
  function hexToHsl(hex) {
    var c = hexToRgb(hex);
    var r = c.r / 255, g = c.g / 255, b = c.b / 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b);
    var l = (max + min) / 2, h = 0, s = 0;
    if (max !== min) {
      var d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
    }
    return { h: h, s: s, l: l };
  }

  // {h,s,l} → '#rrggbb'
  function hslToHex(hsl) {
    var h = ((hsl.h % 360) + 360) % 360 / 360;
    var s = clamp(hsl.s, 0, 1), l = clamp(hsl.l, 0, 1);
    function hue2rgb(p, q, t) {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    }
    var r, g, b;
    if (s === 0) { r = g = b = l; }
    else {
      var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      var p = 2 * l - q;
      r = hue2rgb(p, q, h + 1 / 3);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 1 / 3);
    }
    function to2(v) { return ('0' + Math.round(clamp(v, 0, 1) * 255).toString(16)).slice(-2); }
    return '#' + to2(r) + to2(g) + to2(b);
  }

  // hex + アルファ → 'rgba(r,g,b,a)'
  function withAlpha(hex, a) {
    var c = hexToRgb(hex);
    return 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',' + clamp(+a, 0, 1) + ')';
  }

  // 位置(0..1) → '%' 文字列（浮動小数のノイズを除去）
  function pct(p) { return (Math.round(clamp(p, 0, 1) * 10000) / 100) + '%'; }

  function stopsToCSS(stops) {
    return (stops || []).map(function (s) { return s[0] + ' ' + pct(s[1]); }).join(',');
  }

  // 色オブジェクト → CSS 文字列（§2 の規約通り）
  function toCSS(c) {
    if (typeof c === 'string') return c;
    if (!c || !c.type) return '#000000';
    if (c.type === 'solid') return c.value;
    if (c.type === 'linear') return 'linear-gradient(' + (c.angle || 0) + 'deg,' + stopsToCSS(c.stops) + ')';
    if (c.type === 'radial') return 'radial-gradient(circle farthest-corner at 50% 50%,' + stopsToCSS(c.stops) + ')';
    if (c.type === 'conic') return 'conic-gradient(from ' + (c.from || 0) + 'deg at 50% 50%,' + stopsToCSS(c.stops) + ')';
    return '#000000';
  }

  // CanvasGradient に停止を追加（位置は 0..1 にクランプ、CSS 同様に単調非減少へ補正）
  function addStops(grad, stops) {
    var last = 0;
    (stops || []).forEach(function (s) {
      var p = clamp(+s[1], 0, 1);
      if (p < last) p = last;
      last = p;
      grad.addColorStop(p, s[0]);
    });
    return grad;
  }

  // 色オブジェクト → Canvas の fillStyle（§3.4 グラデ写像。box={x,y,w,h} はテキストブロック箱）
  function toCanvasPaint(ctx, c, box) {
    if (typeof c === 'string') return c;
    if (!c || !c.type) return '#000000';
    if (c.type === 'solid') return c.value;
    var W = box.w, H = box.h;
    var cx = box.x + W / 2, cy = box.y + H / 2;
    if (c.type === 'linear') {
      // CSS のグラデ線: 角度θ→方向(sinθ,-cosθ)、半長=(|W·sinθ|+|H·cosθ|)/2、中心=箱中心
      var th = (c.angle || 0) * Math.PI / 180;
      var dx = Math.sin(th), dy = -Math.cos(th);
      var half = (Math.abs(W * Math.sin(th)) + Math.abs(H * Math.cos(th))) / 2;
      return addStops(ctx.createLinearGradient(cx - dx * half, cy - dy * half, cx + dx * half, cy + dy * half), c.stops);
    }
    if (c.type === 'radial') {
      // circle farthest-corner at 50% 50% 固定 → 半径 = 中心から最遠コーナー
      var r = Math.sqrt(W * W + H * H) / 2;
      return addStops(ctx.createRadialGradient(cx, cy, 0, cx, cy, r), c.stops);
    }
    if (c.type === 'conic') {
      // CSS from Xdeg ↔ createConicGradient(rad(X)-π/2, cx, cy)
      if (typeof ctx.createConicGradient === 'function') {
        return addStops(ctx.createConicGradient(((c.from || 0) * Math.PI / 180) - Math.PI / 2, cx, cy), c.stops);
      }
      // 非対応環境は先頭停止色で代替（P0 対象ブラウザでは到達しない想定）
      return (c.stops && c.stops[0]) ? c.stops[0][0] : '#000000';
    }
    return '#000000';
  }

  // 金属化ビルダー（§6.1）。基準色の HSL からテンプレ数値でグラデ・縁色・白線幅を生成
  function metalStops(baseHex) {
    var hsl = hexToHsl(baseHex);
    var h = hsl.h, s = hsl.s, l = hsl.l;
    var stops;
    if (s <= 0.55) {
      // メタル型: 9停止。+.46 のハイライト停止は s を 0.15 まで落とし白寄りに
      var posM = [0, 0.14, 0.26, 0.40, 0.50, 0.60, 0.74, 0.88, 1];
      var dLM = [0, 0.16, 0.46, 0.17, 0.27, 0.39, 0, -0.11, -0.21];
      stops = posM.map(function (p, i) {
        var sat = (i === 2) ? Math.min(s, 0.15) : s;
        return [hslToHex({ h: h, s: sat, l: clamp(l + dLM[i], 0.04, 0.96) }), p];
      });
    } else {
      // ビビッド型: 8停止。ハイライトは色相維持・L上限0.85（純白にしない）
      var posV = [0, 0.18, 0.34, 0.40, 0.60, 0.72, 0.86, 1];
      var dLV = [0, 0.11, 0.35, 0.40, 0.40, 0.27, -0.04, -0.13];
      stops = posV.map(function (p, i) {
        return [hslToHex({ h: h, s: s, l: clamp(l + dLV[i], 0.04, 0.85) }), p];
      });
    }
    return {
      fill: { type: 'linear', angle: 180, stops: stops },
      stroke: hslToHex({ h: h, s: s, l: 0.13 }),   // 同色相 L0.13
      whiteline: s > 0.55 ? 0.03 : 0
    };
  }

  TS.color = {
    toCSS: toCSS,
    toCanvasPaint: toCanvasPaint,
    hexToHsl: hexToHsl,
    hslToHex: hslToHex,
    withAlpha: withAlpha,
    metalStops: metalStops
  };
})();
