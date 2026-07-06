'use strict';
// TS.anim — イージング / P0 既定アニメの純粋計算（契約書 §3.5 / §6.2）
(function () {
  window.TS = window.TS || {};

  // cubic-bezier(x1,y1,x2,y2) → p(0..1) を渡すと eased 値を返す関数
  // ニュートン法で x(t)=p を解き、失敗時は二分法にフォールバック
  function cubicBezier(x1, y1, x2, y2) {
    var cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
    var cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
    function sampleX(t) { return ((ax * t + bx) * t + cx) * t; }
    function sampleY(t) { return ((ay * t + by) * t + cy) * t; }
    function sampleDX(t) { return (3 * ax * t + 2 * bx) * t + cx; }
    function solveT(x) {
      var t = x, i, err, d;
      for (i = 0; i < 8; i++) {
        err = sampleX(t) - x;
        if (Math.abs(err) < 1e-6) return t;
        d = sampleDX(t);
        if (Math.abs(d) < 1e-6) break;
        t -= err / d;
      }
      var lo = 0, hi = 1;
      t = x;
      while (hi - lo > 1e-6) {
        if (sampleX(t) < x) lo = t; else hi = t;
        t = (lo + hi) / 2;
      }
      return t;
    }
    return function (p) {
      if (p <= 0) return 0;
      if (p >= 1) return 1;
      return sampleY(solveT(p));
    };
  }

  // CSS 名前付きイージングの係数
  var EASE = {
    easeOut: [0, 0, 0.58, 1],
    easeInOut: [0.42, 0, 0.58, 1],
    linear: [0, 0, 1, 1]
  };

  var easeOutFn = cubicBezier(0, 0, 0.58, 1);
  var easeInOutFn = cubicBezier(0.42, 0, 0.58, 1);

  // t 秒 → ループ内位相 0..1（infinite アニメ準拠）
  function phase(t, period) {
    var per = (period > 0) ? period : 3;
    return (((t / per) % 1) + 1) % 1;
  }

  // appear: 0%{opacity:0,scale:.92} 15%{1,1} 100%{1,1}、セグメント毎 ease-out
  function appearAt(t, period) {
    if (t == null || !isFinite(t)) return { opacity: 1, scale: 1 };
    var p = phase(t, period);
    if (p >= 0.15) return { opacity: 1, scale: 1 };
    var e = easeOutFn(p / 0.15);
    return { opacity: e, scale: 0.92 + 0.08 * e };
  }

  // shine: background-position X% を 0%,18%→175 / 42%→-75 / 以降ホールド。18→42% は ease-in-out
  function shineAt(t, period) {
    if (t == null || !isFinite(t)) return { posPercent: 175 };
    var p = phase(t, period);
    if (p <= 0.18) return { posPercent: 175 };
    if (p >= 0.42) return { posPercent: -75 };
    var e = easeInOutFn((p - 0.18) / (0.42 - 0.18));
    return { posPercent: 175 - 250 * e };
  }

  // ---- P2: イージング関数カタログ（契約書§3.5。全てJS関数＝両レンダラ共通・CSSへは書き出さない） ----
  var easeInFn = cubicBezier(0.42, 0, 1, 1);
  var C1 = 1.70158, C3 = C1 + 1;
  var EASE_FN = {
    linear: function (p) { return p; },
    easeIn: easeInFn,
    easeOut: easeOutFn,
    easeInOut: easeInOutFn,
    backIn: function (p) { return C3 * p * p * p - C1 * p * p; },
    backOut: function (p) { var q = p - 1; return 1 + C3 * q * q * q + C1 * q * q; },
    elasticOut: function (p) {
      if (p <= 0) return 0;
      if (p >= 1) return 1;
      return Math.pow(2, -10 * p) * Math.sin((p * 10 - 0.75) * (2 * Math.PI / 3)) + 1;
    },
    bounceOut: function (p) {
      var n1 = 7.5625, d1 = 2.75;
      if (p < 1 / d1) return n1 * p * p;
      if (p < 2 / d1) { p -= 1.5 / d1; return n1 * p * p + 0.75; }
      if (p < 2.5 / d1) { p -= 2.25 / d1; return n1 * p * p + 0.9375; }
      p -= 2.625 / d1; return n1 * p * p + 0.984375;
    }
  };
  function ease(id, p) {
    var f = EASE_FN[id] || EASE_FN.easeOut;
    return f(Math.max(0, Math.min(1, p)));
  }

  TS.anim = {
    cubicBezier: cubicBezier,
    EASE: EASE,
    EASE_FN: EASE_FN,
    ease: ease,
    appearAt: appearAt,
    shineAt: shineAt
  };
})();
