'use strict';
/* TS.motion — モーションエンジン（契約書§3.5 v2。単一エバリュエータ方式）
   DOM/Canvas 両レンダラがここの数値だけでフレームを合成する（パリティの構造的保証）。
   時間軸: [0, D] を1本のタイムラインとし、in → hold(+loop) → out。プレビュー/書き出しはDをループ。 */
(function () {
  window.TS = window.TS || {};

  var clamp01 = function (v) { return v < 0 ? 0 : v > 1 ? 1 : v; };
  var TAU = Math.PI * 2;

  // 方向 → 単位ベクトル（+Y=下。CSS/Canvas共通）
  var DIR = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  function dirVec(d) { return DIR[d] || DIR.up; }

  // 基準プロパティ（合成の単位元）。dx/dy=em(basePx基準)、s=等倍・sx/sy=軸別スケール、rot=deg、
  // blur=em、hue=deg(hue-rotate)、glow=em(白ドロップシャドウ半径。P3拡張)
  function ident() {
    return { opacity: 1, dx: 0, dy: 0, s: 1, sx: 1, sy: 1, rot: 0, blur: 0, hue: 0, glow: 0 };
  }

  // filter文字列の単一定義（DOM/Canvas/CSS書き出しの3者が同じ文字列を使う＝パリティ保証）
  // 順序固定: blur → hue-rotate → drop-shadow
  function filterCSS(props, basePx) {
    var f = [];
    if (props.blur > 0) f.push('blur(' + (Math.round(props.blur * basePx * 1e3) / 1e3) + 'px)');
    if (props.hue) f.push('hue-rotate(' + (Math.round(props.hue * 1e2) / 1e2) + 'deg)');
    if (props.glow > 0) {
      var r = Math.round(props.glow * basePx * 1e3) / 1e3;
      f.push('drop-shadow(0px 0px ' + r + 'px rgba(255,255,255,0.85))');
    }
    return f.length ? f.join(' ') : '';
  }

  /* ==============================================================
     プリセット定義（data駆動。ev の引数:
       e   … イージング適用後の進行 0..1（in: 0=非表示側 / out: 0=表示状態）
       p   … 生の進行 0..1（叩きつけ等、区間分けに使う）
       P   … { vec:[x,y], I:intensity }
       ctx … { i:unitIndex, n:unitCount }
     戻り値: props の部分オブジェクト（identに上書き/加算する値）
     ============================================================== */

  var IN = [
    { id: 'fade', name: 'フェード', desc: 'じわっと現れる', ev: function (e) { return { opacity: e }; } },
    { id: 'fadeScale', name: 'ふわっと', desc: '軽い拡大＋フェード', intensity: true,
      ev: function (e, p, P) { return { opacity: e, s: 1 - 0.08 * P.I * (1 - e) }; } },
    { id: 'slide', name: 'スライド', desc: '指定方向から入る', direction: true, intensity: true,
      ev: function (e, p, P) {
        return { opacity: clamp01(e * 2.2), dx: P.vec[0] * 1.2 * P.I * (1 - e), dy: P.vec[1] * 1.2 * P.I * (1 - e) };
      } },
    { id: 'zoomIn', name: 'ズームイン', desc: '小→等倍へ拡大', intensity: true,
      ev: function (e, p, P) {
        var from = Math.max(0.02, 1 - 0.85 * P.I);
        return { opacity: clamp01(e * 2.2), s: from + (1 - from) * e };
      } },
    { id: 'punchIn', name: 'パンチイン', desc: '大→勢いよく決まる', intensity: true,
      ev: function (e, p, P) {
        var from = 1 + 1.3 * P.I;
        return { opacity: clamp01(e * 3), s: from + (1 - from) * e };
      } },
    { id: 'pop', name: 'ポップ', desc: '弾んで登場', intensity: true, defaultEasing: 'backOut',
      ev: function (e, p, P) { return { opacity: clamp01(p * 3), s: Math.max(0, e) }; } },
    { id: 'rotateIn', name: '回転イン', desc: '回転しながら登場', intensity: true,
      ev: function (e, p, P) {
        return { opacity: clamp01(e * 2), rot: -32 * P.I * (1 - e), s: 0.6 + 0.4 * e };
      } },
    { id: 'blurIn', name: 'ブラーイン', desc: 'ボケから鮮明に', intensity: true,
      ev: function (e, p, P) { return { opacity: e, blur: 0.28 * P.I * (1 - e) }; } },
    { id: 'wipe', name: 'ワイプ', desc: '端から拭き出し', direction: true, blockOnly: true,
      ev: function (e) { return {}; } },                     // クリップは evalBlock 側で処理
    { id: 'stamp', name: 'スタンプ', desc: '叩きつけ＋揺れ', intensity: true,
      ev: function (e, p, P) {
        // 前半55%で急速に叩きつけ、着地後は減衰する縦揺れ
        if (p < 0.55) {
          var q = TS.anim.ease('easeIn', p / 0.55);
          var from = 2.4 * P.I >= 1 ? 1 + 1.4 * P.I : 2.4;
          return { opacity: clamp01(q * 4), s: from + (1 - from) * q };
        }
        var r = (p - 0.55) / 0.45;
        return { opacity: 1, s: 1, dy: 0.05 * P.I * Math.sin(r * TAU * 2.2) * (1 - r) };
      } },
    { id: 'bound', name: 'バウンド', desc: '落ちて弾む', intensity: true, defaultEasing: 'bounceOut',
      ev: function (e, p, P) {
        return { opacity: clamp01(p * 4), dy: -1.4 * P.I * (1 - e) };
      } },
    { id: 'elastic', name: 'エラスティック', desc: 'ゴムのように伸縮', intensity: true, defaultEasing: 'elasticOut',
      ev: function (e, p, P) { return { opacity: clamp01(p * 4), s: Math.max(0, e) }; } },
    // ---- P3 追加 ----
    { id: 'shake', name: 'シェイク', desc: '振動しながら出現', intensity: true,
      ev: function (e, p, P) {
        var decay = (1 - p) * (1 - p);
        return { opacity: clamp01(p * 5),
          dx: 0.09 * P.I * Math.sin(p * 47) * decay,
          dy: 0.05 * P.I * Math.sin(p * 61 + 1.7) * decay };
      } },
    { id: 'flip', name: 'フリップ', desc: '横回転でめくれる', intensity: true, defaultEasing: 'backOut',
      ev: function (e, p, P) { return { opacity: clamp01(p * 3), sx: Math.max(0.02, e) }; } },
    { id: 'persp', name: '飛び込み', desc: '巨大→飛び込む', intensity: true,
      ev: function (e, p, P) {
        var from = 1 + 2.4 * P.I;
        return { opacity: clamp01(e * 2.5), s: from + (1 - from) * e,
          rot: -6 * P.I * (1 - e), blur: 0.06 * P.I * (1 - e) };
      } },
    { id: 'dodon', name: 'ドドン！', desc: '極大→着地＋発光', intensity: true,
      ev: function (e, p, P) {
        // 極大→一気に決めサイズ→着地の強シェイク＋発光フラッシュ（パチンコ演出）
        if (p < 0.38) {
          var q = TS.anim.ease('easeIn', p / 0.38);
          var from = 1 + 2.6 * P.I;
          return { opacity: clamp01(q * 5), s: from + (1 - from) * q };
        }
        var r = (p - 0.38) / 0.62;
        var decay = (1 - r) * (1 - r);
        return { opacity: 1, s: 1,
          dx: 0.11 * P.I * Math.sin(r * 55) * decay,
          dy: 0.07 * P.I * Math.sin(r * 71 + 2.1) * decay,
          glow: 0.5 * P.I * decay };
      } },
    { id: 'pakka', name: 'パカッ（中央から）', desc: '中央から左右に開く', direction: false, blockOnly: true, centerClip: true,
      ev: function () { return {}; } },
    { id: 'typewriter', name: 'タイプライター', desc: '1字ずつ即表示',
      ev: function (e, p) { return { opacity: p > 0 ? 1 : 0 }; } },   // 補間なしの即時出現（文字ごと推奨）
    { id: 'glitch', name: 'グリッチ', desc: '乱れながら確定', intensity: true,
      ev: function (e, p, P) {
        // 量子化ジッタ＋色相の飛び（RGBずれの近似。決定的＝書き出しでも同じ乱れ）
        var env = 1 - e;
        var q = Math.floor(p * 14);
        var j = Math.sin(q * 12.9898) * 43758.5453;
        j = j - Math.floor(j);   // 擬似乱数 0..1（tのみ依存）
        return { opacity: p <= 0 ? 0 : (j < 0.12 ? 0.35 : 1),
          dx: (j - 0.5) * 0.24 * P.I * env,
          hue: (j < 0.3 ? (j * 900) : 0) * env };
      } }
  ];

  var OUT = [
    { id: 'fadeOut', name: 'フェード', desc: 'じわっと消える', ev: function (e) { return { opacity: 1 - e }; } },
    { id: 'slideOut', name: 'スライド', desc: '指定方向へ退場', direction: true, intensity: true,
      ev: function (e, p, P) {
        return { opacity: 1 - clamp01(e * 1.4 - 0.2), dx: P.vec[0] * 1.2 * P.I * e, dy: P.vec[1] * 1.2 * P.I * e };
      } },
    { id: 'zoomOut', name: 'ズームアウト', desc: '縮んで消える', intensity: true,
      ev: function (e, p, P) {
        var to = Math.max(0.02, 1 - 0.85 * P.I);
        return { opacity: 1 - clamp01(e * 1.6 - 0.3), s: 1 + (to - 1) * e };
      } },
    { id: 'popOut', name: 'ポップ', desc: '縮み弾んで消える', intensity: true, defaultEasing: 'backIn',
      ev: function (e, p, P) { return { opacity: 1 - clamp01(p * p), s: Math.max(0, 1 - e) }; } },
    { id: 'blurOut', name: 'ブラーアウト', desc: 'ボケて消える', intensity: true,
      ev: function (e, p, P) { return { opacity: 1 - e, blur: 0.28 * P.I * e }; } },
    { id: 'wipeOut', name: 'ワイプ', desc: '端へ拭き消える', direction: true, blockOnly: true, ev: function () { return {}; } },
    // ---- P3 追加 ----
    { id: 'flipOut', name: 'フリップ', desc: 'めくれて消える', intensity: true, defaultEasing: 'backIn',
      ev: function (e, p, P) { return { opacity: 1 - clamp01(p * p * 1.5), sx: Math.max(0.02, 1 - e) }; } },
    { id: 'pakkaOut', name: 'パカッ（中央へ）', desc: '中央へ閉じて消える', blockOnly: true, centerClip: true, ev: function () { return {}; } }
  ];

  var LOOP = [
    { id: 'shine', name: '照り', desc: '光沢が横切る', period: 3 },   // 見た目はshineレイヤー、時間はここ（evalBlockで位置を返す）
    { id: 'pulse', name: '鼓動', desc: '拍動する', period: 1.2, intensity: true,
      ev: function (ph, P) { return { s: 1 + 0.06 * P.I * Math.sin(ph * TAU) }; } },
    { id: 'float', name: 'フロート', desc: 'ゆらゆら上下', period: 2.6, intensity: true,
      ev: function (ph, P) { return { dy: 0.07 * P.I * Math.sin(ph * TAU) }; } },
    { id: 'wave', name: 'ウェーブ', desc: '文字が波打つ', period: 1.6, intensity: true, perUnit: true,
      ev: function (ph, P, ctx) { return { dy: 0.11 * P.I * Math.sin((ph - ctx.i * 0.09) * TAU) }; } },
    { id: 'flicker', name: '点滅', desc: 'ネオン風の明滅', period: 2.0, intensity: true,
      ev: function (ph, P) {
        var f = Math.sin(ph * TAU) * Math.sin(ph * TAU * 3 + 1.3) * Math.sin(ph * TAU * 7 + 4.2);
        return { opacity: f < -0.62 ? Math.max(0, 1 - 0.75 * P.I) : 1 };
      } },
    // ---- P3 追加 ----
    { id: 'rainbow', name: 'レインボー', desc: '色相が回り続ける', period: 2.4,
      ev: function (ph) { return { hue: 360 * ph }; } },   // 色相サイクル（filter: hue-rotate）
    { id: 'glowPulse', name: 'グロー脈動', desc: '発光が脈打つ', period: 1.4, intensity: true,
      ev: function (ph, P) { return { glow: 0.22 * P.I * (0.5 + 0.5 * Math.sin(ph * TAU)) }; } }
  ];

  function byId(list, id) {
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  // ---- ユニットモード / 数 ---------------------------------------------------
  // stagger有効→その単位。無効でも perUnit なループ（wave等）があれば char。
  function unitMode(scene) {
    var m = scene.motion || {};
    var st = m.stagger || {};
    if (st.enabled) return st.per === 'word' || st.per === 'line' ? st.per : 'char';
    var loops = m.loop || [];
    for (var i = 0; i < loops.length; i++) {
      var def = byId(LOOP, loops[i].preset);
      if (def && def.perUnit) return 'char';
    }
    return 'block';
  }
  function needsCharMode(scene) { return unitMode(scene) !== 'block'; }

  // ユニット数（タイミング計算用。レイアウト不要のテキスト解析のみ）
  function countUnits(scene) {
    var mode = unitMode(scene);
    var content = (scene.text && scene.text.content) || '';
    if (mode === 'block') return 1;
    if (mode === 'line') return Math.max(1, content.split('\n').length);
    if (mode === 'word') {
      var n = 0;
      content.split('\n').forEach(function (ln) {
        n += ln.split(/\s+/).filter(function (w) { return w.length; }).length;
      });
      return Math.max(1, n);
    }
    return Math.max(1, Array.from(content.replace(/\n/g, '')).length);
  }

  // ---- タイムライン -----------------------------------------------------------
  function timeline(scene) {
    var m = scene.motion || {};
    var n = countUnits(scene);
    var st = m.stagger || {};
    var amount = st.enabled ? (st.amount || 0) : 0;
    var tail = amount * Math.max(0, n - 1);
    var inSpan = m['in'] ? (m['in'].delay || 0) + (m['in'].duration || 0) + tail : 0;
    var outSpan = m.out ? (m.out.delay || 0) + (m.out.duration || 0) + tail : 0;
    var hold = Math.max(0.05, m.hold == null ? 2.55 : m.hold);
    var outStart = inSpan + hold;
    return { D: outStart + outSpan, inSpan: inSpan, outSpan: outSpan,
             holdStart: inSpan, outStart: outStart, unitCount: n, mode: unitMode(scene),
             stagAmount: amount };
  }

  // ---- 合成 --------------------------------------------------------------------
  function mix(dst, add) {
    if (!add) return dst;
    if (add.opacity != null) dst.opacity *= add.opacity;
    if (add.dx) dst.dx += add.dx;
    if (add.dy) dst.dy += add.dy;
    if (add.s != null) dst.s *= add.s;
    if (add.sx != null) dst.sx *= add.sx;
    if (add.sy != null) dst.sy *= add.sy;
    if (add.rot) dst.rot += add.rot;
    if (add.blur) dst.blur += add.blur;
    if (add.hue) dst.hue += add.hue;
    if (add.glow) dst.glow = Math.max(dst.glow, add.glow);
    return dst;
  }
  function phaseOf(t, period) {
    var per = period > 0 ? period : 3;
    return ((t / per) % 1 + 1) % 1;
  }

  // ユニット i のプロパティ。完全非表示なら null（描画スキップ）
  function evalUnit(scene, t, i, n) {
    var m = scene.motion || {};
    var tl = timeline(scene);
    var props = ident();

    var inCfg = m['in'];
    if (inCfg) {
      var def = byId(IN, inCfg.preset) || IN[0];
      var stag = def.blockOnly ? 0 : tl.stagAmount;
      var lt = t - ((inCfg.delay || 0) + i * stag);
      if (lt < 0) return null;                       // まだ出ていない
      var dur = Math.max(0.01, inCfg.duration || 0.4);
      if (lt < dur && !def.blockOnly) {
        var p = lt / dur;
        var e = TS.anim.ease(inCfg.easing || def.defaultEasing || 'easeOut', p);
        mix(props, def.ev(e, p, prm(inCfg, def), { i: i, n: n }));
      }
    }

    var outCfg = m.out;
    if (outCfg) {
      var odef = byId(OUT, outCfg.preset) || OUT[0];
      var ostag = odef.blockOnly ? 0 : tl.stagAmount;
      var ot = t - (tl.outStart + (outCfg.delay || 0) + i * ostag);
      var odur = Math.max(0.01, outCfg.duration || 0.3);
      if (ot >= odur && !odef.blockOnly) return null;   // 退場済み
      if (ot >= 0 && !odef.blockOnly) {
        var op = ot / odur;
        var oe = TS.anim.ease(outCfg.easing || odef.defaultEasing || 'easeIn', op);
        mix(props, odef.ev(oe, op, prm(outCfg, odef), { i: i, n: n }));
      }
    }

    // ループ（加算。shineはevalBlock側）
    var loops = m.loop || [];
    for (var k = 0; k < loops.length; k++) {
      var lc = loops[k];
      var ldef = byId(LOOP, lc.preset);
      if (!ldef || !ldef.ev) continue;
      mix(props, ldef.ev(phaseOf(t, lc.period || ldef.period), prm(lc, ldef), { i: i, n: n }));
    }
    if (props.opacity <= 0) return null;
    return props;
  }

  function prm(cfg, def) {
    return { vec: dirVec(cfg.direction), I: (def.intensity && cfg.intensity != null) ? cfg.intensity : 1 };
  }

  // ブロックレベル: ワイプのクリップ＆shine位置
  function evalBlock(scene, t) {
    var m = scene.motion || {};
    var tl = timeline(scene);
    var out = { clipIn: null, clipOut: null, shine: null };

    var inCfg = m['in'];
    if (inCfg) {
      var def = byId(IN, inCfg.preset);
      if (def && def.blockOnly) {
        var dir = def.centerClip ? 'center-h' : (inCfg.direction || 'right');
        var dur = Math.max(0.01, inCfg.duration || 0.4);
        var lt = t - (inCfg.delay || 0);
        var p = clamp01(lt / dur);
        var e = TS.anim.ease(inCfg.easing || 'easeInOut', p);
        if (e < 1) out.clipIn = { dir: dir, p: e };
        if (lt < 0) out.clipIn = { dir: dir, p: 0 };
      }
    }
    var outCfg = m.out;
    if (outCfg) {
      var odef = byId(OUT, outCfg.preset);
      if (odef && odef.blockOnly) {
        var odir = odef.centerClip ? 'center-h' : (outCfg.direction || 'right');
        var odur = Math.max(0.01, outCfg.duration || 0.3);
        var oe = TS.anim.ease(outCfg.easing || 'easeInOut', clamp01((t - (tl.outStart + (outCfg.delay || 0))) / odur));
        if (oe > 0) out.clipOut = { dir: odir, p: oe };
      }
    }
    var loops = m.loop || [];
    for (var k = 0; k < loops.length; k++) {
      if (loops[k].preset === 'shine') {
        out.shine = { posPercent: TS.anim.shineAt(t, loops[k].period || 3).posPercent };
        break;
      }
    }
    return out;
  }

  /* ---- ユニット分割（レイアウト連携） ----------------------------------------
     units(scene, layout) -> { mode, units:[{cx,cy}], idOf(line,seg,ci)->unitId|-1 }
     アンカー: 文字= (segX+cellX+w/2, baselineY-(A-D)/2)。word/line=メンバー文字のbbox中央×同式。 */
  function units(scene, layout) {
    var mode = layout.charMode ? unitMode(scene) : 'block';
    var res = { mode: mode, units: [], idOf: function () { return 0; } };
    if (mode === 'block' || !layout.charMode) return res;

    var map = {};   // "line:seg:ci" -> unitId
    function anchorY(ln, seg) { return ln.baselineY - (seg.A - seg.D) / 2; }

    if (mode === 'line') {
      layout.lines.forEach(function (ln, li) {
        var id = res.units.length;
        var seg0 = ln.segments[0];
        res.units.push({ cx: ln.x + ln.width / 2, cy: seg0 ? anchorY(ln, seg0) : ln.baselineY });
        ln.segments.forEach(function (seg, si) {
          (seg.chars || []).forEach(function (c, ci) { map[li + ':' + si + ':' + ci] = id; });
        });
      });
    } else if (mode === 'word') {
      layout.lines.forEach(function (ln, li) {
        var cur = null;   // {minX,maxX,seg,ids:[]}
        ln.segments.forEach(function (seg, si) {
          (seg.chars || []).forEach(function (c, ci) {
            var isSpace = /\s/.test(c.ch);
            if (isSpace) { cur = null; map[li + ':' + si + ':' + ci] = -1; return; }
            var x0 = seg.x + c.x, x1 = x0 + c.w;
            if (!cur) {
              cur = { id: res.units.length, minX: x0, maxX: x1, seg: seg, ln: ln };
              res.units.push({ cx: 0, cy: 0, _ref: cur });
            } else { cur.maxX = x1; }
            map[li + ':' + si + ':' + ci] = cur.id;
          });
        });
      });
      res.units.forEach(function (u) {
        u.cx = (u._ref.minX + u._ref.maxX) / 2;
        u.cy = anchorY(u._ref.ln, u._ref.seg);
        delete u._ref;
      });
    } else { // char
      layout.lines.forEach(function (ln, li) {
        ln.segments.forEach(function (seg, si) {
          (seg.chars || []).forEach(function (c, ci) {
            var id = res.units.length;
            res.units.push({ cx: seg.x + c.x + c.w / 2, cy: anchorY(ln, seg) });
            map[li + ':' + si + ':' + ci] = id;
          });
        });
      });
    }
    res.idOf = function (li, si, ci) {
      var v = map[li + ':' + si + ':' + ci];
      return v == null ? -1 : v;
    };
    return res;
  }

  /* ---- ワイプのクリップ矩形（ブロックローカルpx。padは縁/影のはみ出しを覆う）
     「dir 方向へ開いていく可視率 p の矩形」のみを定義する。
     wipeOut は呼び出し側で dir を反転し p=1-進行 で渡すと補集合と一致する（両レンダラ共通規則）。 */
  var OPP = { up: 'down', down: 'up', left: 'right', right: 'left' };
  function oppositeDir(d) { return OPP[d] || 'left'; }
  function clipRect(clip, layout, basePx, outerWem) {
    var pad = basePx * (1.2 + (outerWem || 0));
    var W = layout.block.w, H = layout.block.h;
    var p = clamp01(clip.p);
    var fw = W + 2 * pad, fh = H + 2 * pad;
    switch (clip.dir) {
      case 'left':  return { x: W + pad - fw * p, y: -pad, w: fw * p, h: fh };  // 右端から左へ開く
      case 'up':    return { x: -pad, y: H + pad - fh * p, w: fw, h: fh * p };  // 下端から上へ開く
      case 'down':  return { x: -pad, y: -pad, w: fw, h: fh * p };              // 上端から下へ開く
      case 'center-h': return { x: -pad + fw * (1 - p) / 2, y: -pad, w: fw * p, h: fh }; // 中央から左右へ開く（パカッ）
      case 'center-v': return { x: -pad, y: -pad + fh * (1 - p) / 2, w: fw, h: fh * p }; // 中央から上下へ開く
      default:      return { x: -pad, y: -pad, w: fw * p, h: fh };              // right: 左端から右へ開く
    }
  }
  // out側クリップの可視領域仕様（両レンダラ＋CSS書き出しの共通規則）:
  // 端方向 = dir反転・可視率1-p（補集合と一致）/ 中央系 = 同方向・可視率1-p（中央へ閉じる）
  function outClipSpec(clip) {
    var d = clip.dir || 'right';
    if (d === 'center-h' || d === 'center-v') return { dir: d, p: 1 - clip.p };
    return { dir: oppositeDir(d), p: 1 - clip.p };
  }

  TS.motion = {
    PRESETS: { 'in': IN, out: OUT, loop: LOOP },
    EASINGS: [
      ['easeOut', 'スムーズ'], ['easeInOut', 'イーズ両側'], ['easeIn', '加速'],
      ['linear', 'リニア'], ['backOut', 'オーバーシュート'], ['backIn', '助走'],
      ['elasticOut', 'エラスティック'], ['bounceOut', 'バウンス']
    ],
    unitMode: unitMode,
    needsCharMode: needsCharMode,
    countUnits: countUnits,
    timeline: timeline,
    evalUnit: evalUnit,
    evalBlock: evalBlock,
    units: units,
    clipRect: clipRect,
    oppositeDir: oppositeDir,
    outClipSpec: outClipSpec,
    filterCSS: filterCSS,
    dirVec: dirVec
  };
})();
