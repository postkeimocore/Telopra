'use strict';
// TS.scene — Scene JSON v1 スキーマ・既定値・ヘルパ（契約書 §2 / §6.3）
(function () {
  window.TS = window.TS || {};

  // 深いクローン
  function clone(obj) {
    if (typeof structuredClone === 'function') return structuredClone(obj);
    return JSON.parse(JSON.stringify(obj));
  }

  // ID 生成: 'st_a1b2' 形式
  function newId(prefix) {
    return (prefix || 'id') + '_' + Math.random().toString(36).slice(2, 6);
  }

  // 既定シーン（契約書 §2 の JSON そのもの。presets.js には依存しない）
  function create() {
    return {
      version: 1,
      canvas: { w: 1920, h: 1080, fps: 30, background: 'transparent' },
      text: {
        content: 'テキストを入力する',
        font: 'Noto Sans JP',
        weight: 900,
        size: 160,
        letterSpacing: 0.03,
        lineHeight: 1.0,
        italicSkew: 0,
        align: 'center',
        runs: []
      },
      layers: [
        { id: 'ex1', type: 'extrude', visible: true,
          steps: 6, dist: 0.014, angle: 90, color: '#3d2703',
          contact: { enabled: true, opacity: 0.4, dist: 0.1 } },
        { id: 'st1', type: 'stroke', visible: true, width: 0.14, align: 'center',
          color: { type: 'solid', value: '#3d2703' }, opacity: 1 },
        { id: 'st2', type: 'stroke', visible: true, width: 0.03, align: 'center',
          color: { type: 'solid', value: '#ffffff' }, opacity: 1 },
        { id: 'fl1', type: 'fill', visible: true,
          color: { type: 'linear', angle: 180,
            stops: [['#e8a410', 0], ['#ffd24a', 0.14], ['#fffbe8', 0.26], ['#ffdb54', 0.40],
                    ['#ffe884', 0.50], ['#fff2c0', 0.60], ['#e8a814', 0.74], ['#b8820c', 0.88], ['#855f08', 1]] },
          opacity: 1 },
        { id: 'sh1', type: 'shine', visible: true, angle: 105, band: 0.16, span: 2.5, opacity: 0.98 }
      ],
      shadows: [],
      motion: {
        in: { preset: 'fadeScale', duration: 0.45, easing: 'easeOut', intensity: 1 },
        loop: [{ preset: 'shine', period: 3 }],
        out: null,
        stagger: { enabled: false, per: 'char', amount: 0.04 },
        hold: 2.55   // 旧appear+shineの周期3.0秒を保存（0.45+2.55）
      }
    };
  }

  function num(v, fb) { return (typeof v === 'number' && isFinite(v)) ? v : fb; }

  // 色オブジェクトの補完（文字列は solid 扱い）
  function normColor(c, fb) {
    if (typeof c === 'string') return { type: 'solid', value: c };
    if (c && typeof c === 'object' && c.type) {
      if (c.type === 'solid') return { type: 'solid', value: c.value || '#000000' };
      var o = {
        type: c.type,
        stops: Array.isArray(c.stops)
          ? c.stops.map(function (s) { return [String(s[0]), num(+s[1], 0)]; })
          : []
      };
      if (c.type === 'linear') o.angle = num(c.angle, 180);
      if (c.type === 'conic') o.from = num(c.from, 0);
      return o;
    }
    return clone(fb);
  }

  // レイヤーの欠損補完（type 毎の既定値）。未知 type はそのまま保持
  function normLayer(L) {
    if (!L || typeof L !== 'object' || !L.type) return null;
    var base = { id: L.id || newId(L.type.slice(0, 2)), type: L.type, visible: L.visible !== false };
    if (L.type === 'extrude') {
      var edge = (typeof L.color === 'string') ? L.color : (L.color && L.color.value) || '#000000';
      var ct = L.contact || {};
      return Object.assign(base, {
        steps: Math.max(1, Math.round(num(L.steps, 6))),
        dist: num(L.dist, 0.014),
        angle: num(L.angle, 90),
        color: edge,   // 側面色は単色のみ
        contact: { enabled: ct.enabled !== false, opacity: num(ct.opacity, 0.4), dist: num(ct.dist, 0.1) }
      });
    }
    if (L.type === 'stroke') {
      return Object.assign(base, {
        width: num(L.width, 0.14),
        align: (L.align === 'outside' || L.align === 'inside') ? L.align : 'center',
        color: normColor(L.color, { type: 'solid', value: '#000000' }),
        opacity: num(L.opacity, 1)
      });
    }
    if (L.type === 'fill') {
      return Object.assign(base, {
        color: normColor(L.color, { type: 'solid', value: '#ffffff' }),
        opacity: num(L.opacity, 1)
      });
    }
    if (L.type === 'shine') {
      return Object.assign(base, {
        angle: num(L.angle, 105),
        band: num(L.band, 0.16),
        span: num(L.span, 2.5),
        opacity: num(L.opacity, 0.98)
      });
    }
    return clone(L); // 未知 type は破壊せず保持（レンダラは無視する）
  }

  // 欠損補完・版移行
  function normalize(scene) {
    var d = create();
    var s = (scene && typeof scene === 'object') ? scene : {};
    var out = { version: 1 };
    out.canvas = Object.assign({}, d.canvas, s.canvas || {});
    out.text = Object.assign({}, d.text, s.text || {});
    out.text.runs = Array.isArray(out.text.runs)
      ? clone(out.text.runs).filter(function (r) {
          return r && Array.isArray(r.range) && r.range.length === 2 && typeof r.scale === 'number';
        })
      : [];
    out.layers = Array.isArray(s.layers)
      ? s.layers.map(normLayer).filter(Boolean)
      : clone(d.layers);
    out.shadows = Array.isArray(s.shadows)
      ? s.shadows.map(function (sh) {
          return {
            color: (sh && sh.color) || '#000000',
            x: num(sh && sh.x, 0), y: num(sh && sh.y, 0),
            blur: num(sh && sh.blur, 0), spread: num(sh && sh.spread, 0),
            opacity: num(sh && sh.opacity, 1)
          };
        })
      : [];
    out.motion = {
      in: (s.motion && s.motion.in !== undefined) ? clone(s.motion.in) : clone(d.motion.in),
      loop: (s.motion && Array.isArray(s.motion.loop)) ? clone(s.motion.loop) : clone(d.motion.loop),
      out: (s.motion && s.motion.out !== undefined) ? clone(s.motion.out) : null,
      stagger: Object.assign({}, d.motion.stagger, (s.motion && s.motion.stagger) || {}),
      // P2: in完了→out開始までの表示秒。旧シーン（未定義）は既定2.55（旧D=3.0を保存）
      hold: num(s.motion && s.motion.hold, d.motion.hold)
    };
    // in/out 設定の欠損補完（プリセットid以外はエバリュエータ既定に任せ、型だけ整える）
    ['in', 'out'].forEach(function (k) {
      var c = out.motion[k];
      if (!c) return;
      c.preset = c.preset || (k === 'in' ? 'fade' : 'fadeOut');
      c.duration = num(c.duration, k === 'in' ? 0.4 : 0.3);
      c.delay = num(c.delay, 0);
      if (c.intensity != null) c.intensity = num(c.intensity, 1);
    });
    out.motion.stagger.per = /^(char|word|line)$/.test(out.motion.stagger.per) ? out.motion.stagger.per : 'char';
    out.motion.stagger.amount = num(out.motion.stagger.amount, 0.04);
    return out;
  }

  // 最外縁ストローク幅（§3.1）。可視 stroke の実効外側幅の最大（em）。
  // align: outside=2*width / center=width / inside=0（内側縁はグリフ外へ出ないため）
  function outerW(scene) {
    var m = 0;
    (scene.layers || []).forEach(function (L) {
      if (L.type === 'stroke' && L.visible !== false) {
        var w = (L.align === 'outside') ? 2 * num(L.width, 0)
              : (L.align === 'inside') ? 0
              : num(L.width, 0);
        if (w > m) m = w;
      }
    });
    return m;
  }

  // UI スライダー範囲の一元定義（[min,max]）
  var LIMITS = {
    size: [24, 400],
    letterSpacing: [-0.05, 0.3],
    lineHeight: [0.8, 2.0],
    italicSkew: [-20, 20],
    runScale: [0.4, 1.5],
    strokeW: [0, 0.5],
    extrudeSteps: [1, 16],
    extrudeDist: [0, 0.05],
    contactOpacity: [0, 1],
    contactDist: [0, 0.3],
    angle: [0, 360],
    opacity: [0, 1],
    shineBand: [0.02, 0.6],
    shineSpan: [1, 4],
    shadowOffset: [-200, 200],
    shadowBlur: [0, 120],
    shadowSpread: [0, 60]
  };

  TS.scene = {
    create: create,
    normalize: normalize,
    outerW: outerW,
    clone: clone,
    newId: newId,
    LIMITS: LIMITS
  };
})();
