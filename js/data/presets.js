'use strict';
// デザインプリセット（契約書§6.9）— telop_variants.html COLORS 12色を Scene レイヤー形式へ変換（数値は原典そのまま）
(function () {
  window.TS = window.TS || {};

  // 1プリセット生成。o: { stroke:外縁色, stops:塗りグラデ停止, sw:縁幅em(省略0.14),
  //                       wl:白セパレーター幅em(指定色のみ), edge:押し出し側面色(省略でstroke),
  //                       shadow:原典カラードシャドウ(未使用・meta保持のみ) }
  function make(id, name, o) {
    var layers = [
      { id: id + '_ex1', type: 'extrude', visible: true,
        steps: 6, dist: 0.014, angle: 90, color: (o.edge || o.stroke),
        contact: { enabled: true, opacity: 0.4, dist: 0.1 } },
      { id: id + '_st1', type: 'stroke', visible: true,
        width: (o.sw != null ? o.sw : 0.14), align: 'center',
        color: { type: 'solid', value: o.stroke }, opacity: 1 }
    ];
    if (o.wl != null) {
      layers.push({ id: id + '_st2', type: 'stroke', visible: true,
        width: o.wl, align: 'center',
        color: { type: 'solid', value: '#ffffff' }, opacity: 1 });
    }
    layers.push(
      { id: id + '_fl1', type: 'fill', visible: true,
        color: { type: 'linear', angle: 180, stops: o.stops }, opacity: 1 },
      { id: id + '_sh1', type: 'shine', visible: true,
        angle: 105, band: 0.16, span: 2.5, opacity: 0.98 }
    );
    return { id: id, name: name, layers: layers, shadows: [], meta: { shadowColor: o.shadow } };
  }

  // 並び: telop_preview.html の HUE 順（赤→オレンジ→ゴールド→黄→緑→水色→青→紫→ピンク→白→シルバー→黒）
  TS.PRESETS = [
    make('red', 'レッド', {
      stroke: '#3a0608', sw: 0.18, wl: 0.03, shadow: 'rgba(150,20,25,.5)',
      stops: [['#d4141c', 0], ['#e83840', 0.18], ['#ff9a9a', 0.34], ['#ffb2b2', 0.40],
              ['#ffb2b2', 0.60], ['#f57a7a', 0.72], ['#c01218', 0.86], ['#980a10', 1]]
    }),
    make('orange', 'オレンジ', {
      stroke: '#4a2302', shadow: 'rgba(200,90,10,.5)',
      stops: [['#ffa028', 0], ['#ffc054', 0.20], ['#ffdfa8', 0.36], ['#fff0d4', 0.40],
              ['#fff0d4', 0.60], ['#ffcf74', 0.72], ['#ffab30', 0.86], ['#ff9012', 1]]
    }),
    make('gold', 'ゴールド', {
      stroke: '#3d2703', shadow: 'rgba(190,135,15,.5)',
      stops: [['#e8a410', 0], ['#ffd24a', 0.14], ['#fffbe8', 0.26], ['#ffdb54', 0.40], ['#ffe884', 0.50],
              ['#fff2c0', 0.60], ['#e8a814', 0.74], ['#b8820c', 0.88], ['#855f08', 1]]
    }),
    make('yellow', 'イエロー', {
      stroke: '#2a1f04', shadow: 'rgba(200,150,30,.45)',
      stops: [['#ffcf33', 0], ['#ffe268', 0.20], ['#fff3b8', 0.36], ['#fff8dc', 0.40],
              ['#fff8dc', 0.60], ['#ffdd55', 0.72], ['#f8ce3c', 0.86], ['#f0c020', 1]]
    }),
    make('green', 'グリーン', {
      stroke: '#0a2e12', sw: 0.18, wl: 0.03, shadow: 'rgba(15,110,40,.5)',
      stops: [['#12a034', 0], ['#2fb84e', 0.18], ['#6ad890', 0.34], ['#82e0a0', 0.40],
              ['#82e0a0', 0.60], ['#48c066', 0.72], ['#0c8a2c', 0.86], ['#077020', 1]]
    }),
    make('aqua', 'アクア', {
      stroke: '#0a3a56', shadow: 'rgba(15,110,160,.5)',
      stops: [['#35c6f8', 0], ['#7fe0ff', 0.20], ['#c4edff', 0.36], ['#dcf4ff', 0.40],
              ['#dcf4ff', 0.60], ['#8ae6fd', 0.72], ['#2dbdf4', 0.86], ['#17b2f0', 1]]
    }),
    make('blue', 'ブルー', {
      stroke: '#0a1c52', sw: 0.18, wl: 0.03, shadow: 'rgba(20,60,160,.5)',
      stops: [['#2058e0', 0], ['#3a72ee', 0.18], ['#90b4f8', 0.34], ['#a6c6fa', 0.40],
              ['#a6c6fa', 0.60], ['#5e8cf0', 0.72], ['#163fa8', 0.86], ['#10308a', 1]]
    }),
    make('purple', 'パープル', {
      stroke: '#28083e', sw: 0.18, wl: 0.03, shadow: 'rgba(90,25,150,.5)',
      stops: [['#8420d0', 0], ['#9c40e0', 0.18], ['#c496f2', 0.34], ['#d4aef6', 0.40],
              ['#d4aef6', 0.60], ['#a870ec', 0.72], ['#6a16a8', 0.86], ['#560d8a', 1]]
    }),
    make('pink', 'ピンク', {
      stroke: '#3a0a22', sw: 0.18, wl: 0.03, shadow: 'rgba(190,20,110,.5)',
      stops: [['#f02888', 0], ['#ff5aa4', 0.18], ['#ff9ecc', 0.34], ['#ffb2d8', 0.40],
              ['#ffb2d8', 0.60], ['#f56ea8', 0.72], ['#d01068', 0.86], ['#a80a52', 1]]
    }),
    make('white', 'ホワイト', {
      stroke: '#3a3a3a', shadow: 'rgba(120,120,120,.5)',
      stops: [['#e8e8e8', 0], ['#f2f2f2', 0.20], ['#fafafa', 0.36], ['#ffffff', 0.40],
              ['#ffffff', 0.60], ['#ececec', 0.72], ['#dcdcdc', 0.86], ['#d2d2d2', 1]]
    }),
    make('silver', 'シルバー', {
      stroke: '#262d36', shadow: 'rgba(90,100,112,.5)',
      stops: [['#eaeff4', 0], ['#dbe2ea', 0.14], ['#ffffff', 0.26], ['#c2ccd8', 0.40], ['#dde4ec', 0.50],
              ['#f2f6f9', 0.60], ['#aab6c4', 0.74], ['#808d9c', 0.88], ['#5e6b7a', 1]]
    }),
    make('black', 'ブラック', {
      stroke: '#ffffff', sw: 0.10, edge: '#080808', shadow: 'rgba(30,34,40,.5)',
      stops: [['#0a0a0a', 0], ['#1e1e1e', 0.20], ['#404040', 0.36], ['#7a7a7a', 0.40],
              ['#7a7a7a', 0.60], ['#343434', 0.72], ['#141414', 0.86], ['#050505', 1]]
    })
  ];
  TS.PRESETS.forEach(function (p) { p.cat = 'color'; });   // 原典12色 = カラーカテゴリ

  /* ==== P3 拡張ビルダー ====
     o: { stops(+angle=180) or fill(色obj), stroke:{w,color,align?}, inner:{w,color}(セパレーター位置),
          extrude: null=無し / 省略=標準6段 / {steps,dist,color,contact},
          edge: 押し出し色, shine: false=無し / {band,opacity,angle} 上書き, shadows:[…] }
     原則（仕様書1-2）: 明暗コントラスト＋照りで質感を作る・暗塗り×暗縁は白セパレーター・
     彩度色のハイライトは純白にしない */
  function makeEx(id, name, cat, o) {
    var layers = [];
    if (o.extrude !== null) {
      var ex = o.extrude || {};
      layers.push({ id: id + '_ex1', type: 'extrude', visible: true,
        steps: ex.steps != null ? ex.steps : 6, dist: ex.dist != null ? ex.dist : 0.014,
        angle: 90, color: ex.color || o.edge || o.stroke.color,
        contact: { enabled: true, opacity: ex.contact != null ? ex.contact : 0.4, dist: 0.1 } });
    }
    layers.push({ id: id + '_st1', type: 'stroke', visible: true,
      width: o.stroke.w, align: o.stroke.align || 'center',
      color: { type: 'solid', value: o.stroke.color }, opacity: 1 });
    if (o.inner) {
      layers.push({ id: id + '_st2', type: 'stroke', visible: true,
        width: o.inner.w, align: 'center',
        color: { type: 'solid', value: o.inner.color }, opacity: 1 });
    }
    layers.push({ id: id + '_fl1', type: 'fill', visible: true,
      color: o.fill || { type: 'linear', angle: (o.angle != null ? o.angle : 180), stops: o.stops },
      opacity: 1 });
    if (o.shine !== false) {
      var sh = o.shine || {};
      layers.push({ id: id + '_sh1', type: 'shine', visible: true,
        angle: sh.angle != null ? sh.angle : 105, band: sh.band != null ? sh.band : 0.16,
        span: 2.5, opacity: sh.opacity != null ? sh.opacity : 0.98 });
    }
    return { id: id, name: name, cat: cat, layers: layers,
             shadows: o.shadows || [], meta: {} };
  }
  function glow(color, blur, spread, opacity) {
    return { color: color, x: 0, y: 0, blur: blur, spread: spread || 0, opacity: opacity };
  }

  var EX = [
    /* ---- メタル（リアル系・パチンコ演出向け） ---- */
    makeEx('richgold', 'リアルゴールド', 'metal', {
      stops: [['#c4820a', 0], ['#f5c53a', 0.10], ['#fff7d8', 0.24], ['#ffd84e', 0.34], ['#f7c22e', 0.44],
              ['#fff3b0', 0.55], ['#ffe268', 0.63], ['#c98f10', 0.78], ['#8f6408', 0.90], ['#5f4205', 1]],
      stroke: { w: 0.16, color: '#1a1206' }, inner: { w: 0.03, color: '#ffd24a' },
      edge: '#3d2703', extrude: { contact: 0.5 }, shine: { band: 0.18, opacity: 1 }
    }),
    makeEx('antiquegold', 'アンティークゴールド', 'metal', {
      stops: [['#9a7b2e', 0], ['#c2a34e', 0.14], ['#e8d49a', 0.28], ['#b8934a', 0.42],
              ['#d6b866', 0.55], ['#efe0b2', 0.66], ['#8f7020', 0.80], ['#6b5316', 1]],
      stroke: { w: 0.15, color: '#241a08' }, shine: { opacity: 0.7 }
    }),
    makeEx('rosegold', 'ローズゴールド', 'metal', {
      stops: [['#d88a6e', 0], ['#eaa88e', 0.14], ['#ffe8dc', 0.28], ['#f0b49a', 0.42],
              ['#ffd4c0', 0.56], ['#fff0e8', 0.67], ['#c67a5c', 0.82], ['#a05a40', 1]],
      stroke: { w: 0.14, color: '#4a1e12' }
    }),
    makeEx('champagne', 'シャンパンゴールド', 'metal', {
      stops: [['#e2c896', 0], ['#f2e0b8', 0.16], ['#fdf7e4', 0.30], ['#ecd8a8', 0.45],
              ['#f8ecc8', 0.60], ['#fffcf0', 0.71], ['#d0b078', 0.85], ['#b08f56', 1]],
      stroke: { w: 0.14, color: '#57431f' }, shine: { opacity: 0.85 }
    }),
    makeEx('chrome', 'クロム', 'metal', {
      stops: [['#cfe4f2', 0], ['#f8fcff', 0.12], ['#8fa8bc', 0.24], ['#e8f2f8', 0.30], ['#ffffff', 0.42],
              ['#5a6c7c', 0.50], ['#2c3844', 0.54], ['#cfdde8', 0.68], ['#ffffff', 0.78],
              ['#8ea4b6', 0.90], ['#5c707f', 1]],
      stroke: { w: 0.12, color: '#16202a' }, edge: '#10161c',
      shine: { band: 0.12, opacity: 1 }
    }),
    makeEx('platinum', 'プラチナ', 'metal', {
      stops: [['#e8ecf0', 0], ['#f8fafc', 0.15], ['#ffffff', 0.28], ['#d2dae2', 0.45],
              ['#eef2f6', 0.60], ['#fcfeff', 0.70], ['#b0bcc8', 0.85], ['#8894a2', 1]],
      stroke: { w: 0.13, color: '#2e3844' }, shine: { opacity: 0.9 }
    }),
    makeEx('copper', 'カッパー', 'metal', {
      stops: [['#b05a28', 0], ['#d47c42', 0.15], ['#f8c8a0', 0.30], ['#e09258', 0.45],
              ['#f0b880', 0.58], ['#ffe0c0', 0.69], ['#96481e', 0.83], ['#703416', 1]],
      stroke: { w: 0.14, color: '#38160a' }
    }),
    makeEx('brass', 'ブラス', 'metal', {
      stops: [['#a88a26', 0], ['#cbb045', 0.15], ['#f0e09a', 0.30], ['#c2a238', 0.45],
              ['#e0c866', 0.58], ['#f6ecb8', 0.69], ['#8a6e1c', 0.83], ['#665012', 1]],
      stroke: { w: 0.14, color: '#2e2408' }
    }),
    makeEx('gunmetal', 'ガンメタル', 'metal', {
      stops: [['#3a424c', 0], ['#525c68', 0.15], ['#8c98a6', 0.30], ['#5e6a76', 0.45],
              ['#78848f', 0.58], ['#a8b4c0', 0.69], ['#2e363e', 0.83], ['#20262e', 1]],
      stroke: { w: 0.15, color: '#14181e' }, inner: { w: 0.03, color: '#ffffff' },  // 暗塗り×暗縁→白セパ
      edge: '#0c1014', shine: { opacity: 0.85 }
    }),
    makeEx('blackgold', 'ブラックゴールド', 'metal', {
      stops: [['#0e0a04', 0], ['#241a08', 0.20], ['#443114', 0.36], ['#6e5522', 0.44],
              ['#3c2c10', 0.60], ['#1c1406', 0.80], ['#0a0602', 1]],
      stroke: { w: 0.16, color: '#060402' }, inner: { w: 0.05, color: '#e8b12a' },  // 金縁=高級パチンコ
      edge: '#030201', extrude: { contact: 0.5 }, shine: { opacity: 0.9 }
    }),
    makeEx('titanium', 'チタン', 'metal', {
      stops: [['#8fa2b4', 0], ['#b4c6d6', 0.15], ['#e6f0f8', 0.30], ['#9cb0c2', 0.45],
              ['#c6d6e4', 0.58], ['#f0f6fc', 0.69], ['#70828f', 0.84], ['#556472', 1]],
      stroke: { w: 0.13, color: '#1c2630' }
    }),

    /* ---- 発光・ネオン（グローはshadowsの色付きぼかしで） ---- */
    makeEx('neonpink', 'ネオンピンク', 'neon', {
      stops: [['#ff9ed8', 0], ['#ffe6f4', 0.30], ['#fff6fc', 0.45], ['#ffd0ec', 0.55],
              ['#ff7ac2', 0.75], ['#f23c9e', 1]],
      stroke: { w: 0.06, color: '#8a1258' }, extrude: null, shine: { band: 0.3, opacity: 0.45 },
      shadows: [glow('#ff2d95', 26, 2, 0.95), glow('#ff2d95', 60, 6, 0.5)]
    }),
    makeEx('neonblue', 'ネオンブルー', 'neon', {
      stops: [['#9ed4ff', 0], ['#e6f4ff', 0.30], ['#f6fbff', 0.45], ['#c8e8ff', 0.55],
              ['#66bcff', 0.75], ['#1e8ce8', 1]],
      stroke: { w: 0.06, color: '#0a4a8a' }, extrude: null, shine: { band: 0.3, opacity: 0.45 },
      shadows: [glow('#2196ff', 26, 2, 0.95), glow('#2196ff', 60, 6, 0.5)]
    }),
    makeEx('neongreen', 'ネオングリーン', 'neon', {
      stops: [['#a2ffc8', 0], ['#e8fff2', 0.30], ['#f8fffc', 0.45], ['#c4ffdc', 0.55],
              ['#5cf49a', 0.75], ['#1ed468', 1]],
      stroke: { w: 0.06, color: '#0a6a34' }, extrude: null, shine: { band: 0.3, opacity: 0.45 },
      shadows: [glow('#2bee7e', 26, 2, 0.95), glow('#2bee7e', 60, 6, 0.5)]
    }),
    makeEx('cyberglow', 'サイバーグロー', 'neon', {
      stops: [['#aef8ff', 0], ['#eafcff', 0.35], ['#ffffff', 0.50], ['#8ef0fc', 0.70], ['#2cd4ec', 1]],
      stroke: { w: 0.12, color: '#001418' }, inner: { w: 0.03, color: '#ffffff' },
      edge: '#001014', shine: { band: 0.2, opacity: 0.7 },
      shadows: [glow('#22d3ee', 24, 2, 0.9), glow('#22d3ee', 52, 4, 0.45)]
    }),
    makeEx('denki', '電撃イエロー', 'neon', {
      stops: [['#fff8c0', 0], ['#ffffff', 0.30], ['#fff284', 0.55], ['#ffd83c', 0.80], ['#ffb400', 1]],
      stroke: { w: 0.10, color: '#4a3300' }, extrude: null, shine: { band: 0.24, opacity: 0.9 },
      shadows: [glow('#ffd400', 26, 2, 0.9), glow('#ff9e00', 56, 6, 0.5)]
    }),
    makeEx('hologram', 'ホログラム', 'neon', {
      stops: [['#ffb3c8', 0], ['#ffe3b3', 0.20], ['#fdffb8', 0.40], ['#b8ffd9', 0.60],
              ['#b3e0ff', 0.80], ['#e3b8ff', 1]],
      angle: 120, stroke: { w: 0.08, color: '#4a4a5e' }, inner: { w: 0.03, color: '#ffffff' },
      extrude: null, shine: { band: 0.22, opacity: 0.8 },
      shadows: [glow('#ffffff', 18, 0, 0.4)]
    }),
    makeEx('aurora', 'オーロラ', 'neon', {
      stops: [['#3ce8a0', 0], ['#6ef4c8', 0.20], ['#7cd8f0', 0.45], ['#6a9cf4', 0.70], ['#9a7cf0', 1]],
      angle: 135, stroke: { w: 0.10, color: '#0c2e3e' }, inner: { w: 0.03, color: '#ffffff' },
      shine: { opacity: 0.7 }, shadows: [glow('#4ee8c0', 22, 2, 0.5)]
    }),
    makeEx('rainbow', 'レインボー', 'neon', {
      stops: [['#ff3b30', 0], ['#ff9500', 0.17], ['#ffd60a', 0.33], ['#34c759', 0.50],
              ['#32ade6', 0.67], ['#5856d6', 0.83], ['#af52de', 1]],
      angle: 90, stroke: { w: 0.14, color: '#2a2a34' }, inner: { w: 0.03, color: '#ffffff' },
      shine: { opacity: 0.9 }
    }),

    /* ---- 質感 ---- */
    makeEx('candy', 'キャンディ', 'texture', {
      stops: [['#ff5a68', 0], ['#ff8c96', 0.12], ['#ffe2e6', 0.26], ['#ff96a0', 0.40],
              ['#f43848', 0.62], ['#d41e30', 0.82], ['#b01020', 1]],
      stroke: { w: 0.16, color: '#6e0a16' }, inner: { w: 0.03, color: '#ffffff' },
      extrude: { contact: 0.45 }, shine: { band: 0.2, opacity: 1 }
    }),
    makeEx('gummy', 'グミ', 'texture', {
      stops: [['rgba(255,150,40,0.95)', 0], ['rgba(255,190,90,0.9)', 0.25], ['rgba(255,230,170,0.85)', 0.45],
              ['rgba(255,170,60,0.9)', 0.70], ['rgba(235,120,20,0.95)', 1]],
      stroke: { w: 0.08, color: 'rgba(180,80,0,0.85)' }, extrude: null,
      shine: { band: 0.28, opacity: 1 },
      shadows: [{ color: '#c86a10', x: 0, y: 10, blur: 18, spread: 0, opacity: 0.35 }]
    }),
    makeEx('ice', '氷', 'texture', {
      stops: [['#d8f2fc', 0], ['#f2fbff', 0.18], ['#ffffff', 0.30], ['#c2e8f8', 0.50],
              ['#e8f8ff', 0.62], ['#a8d8f0', 0.82], ['#88c2e4', 1]],
      stroke: { w: 0.08, color: '#2a7ca8' }, extrude: { steps: 4, dist: 0.01, color: '#9fcfe8' },
      shine: { band: 0.14, opacity: 1 }, shadows: [glow('#bfe8ff', 14, 0, 0.5)]
    }),
    makeEx('fire', '炎', 'texture', {
      stops: [['#7a1000', 0], ['#d42800', 0.25], ['#ff5a00', 0.45], ['#ff9e00', 0.65],
              ['#ffd83c', 0.82], ['#fff3a0', 1]],
      angle: 0,   // 下が熱源 → 上へ明るく
      stroke: { w: 0.12, color: '#3a0800' }, extrude: null, shine: { band: 0.3, opacity: 0.5 },
      shadows: [{ color: '#ff3c00', x: 0, y: 6, blur: 22, spread: 0, opacity: 0.55 }]
    }),
    makeEx('choco', 'チョコ', 'texture', {
      stops: [['#4a2a12', 0], ['#6a3e1c', 0.18], ['#a8703c', 0.34], ['#7a4a22', 0.50],
              ['#c89058', 0.64], ['#5a3416', 0.82], ['#3e2008', 1]],
      stroke: { w: 0.16, color: '#241004' }, inner: { w: 0.03, color: '#ffffff' },
      shine: { opacity: 0.8 }
    }),
    makeEx('toon', 'トゥーン', 'texture', {
      stops: [['#ff8c1a', 0], ['#ff8c1a', 0.52], ['#f07000', 0.53], ['#f07000', 1]],  // ベタ＋1段影
      stroke: { w: 0.18, color: '#14100c' }, inner: { w: 0.04, color: '#ffffff' },
      extrude: null, shine: false,
      shadows: [{ color: '#000000', x: 10, y: 12, blur: 0, spread: 0, opacity: 0.85 }]
    }),

    /* ---- カルチャー ---- */
    makeEx('amecomi', 'アメコミ', 'culture', {
      stops: [['#ffd21e', 0], ['#ffe14a', 0.50], ['#ffc400', 1]],
      stroke: { w: 0.20, color: '#101014' }, inner: { w: 0.06, color: '#e42618' },
      extrude: null, shine: false,
      shadows: [{ color: '#141428', x: 14, y: 14, blur: 0, spread: 0, opacity: 0.9 }]
    }),
    makeEx('sticker', 'ステッカー', 'culture', {
      stops: [['#ff7ab8', 0], ['#ff9ecc', 0.50], ['#f45898', 1]],
      stroke: { w: 0.12, color: '#ffffff', align: 'outside' },
      extrude: null, shine: false,
      shadows: [{ color: '#000000', x: 4, y: 8, blur: 10, spread: 0, opacity: 0.25 }]
    }),
    makeEx('minimal', 'ミニマル白フチ', 'culture', {
      stops: [['#ffffff', 0], ['#f4f4f6', 1]],
      stroke: { w: 0.05, color: '#1e2024' }, extrude: null, shine: false,
      shadows: [{ color: '#000000', x: 0, y: 4, blur: 8, spread: 0, opacity: 0.3 }]
    }),
    makeEx('vaporwave', 'vaporwave', 'culture', {
      stops: [['#ff71ce', 0], ['#ff9ee6', 0.30], ['#b8b8ff', 0.60], ['#01cdfe', 1]],
      angle: 135, stroke: { w: 0.12, color: '#3a2a6a' }, inner: { w: 0.03, color: '#ffffff' },
      shine: { opacity: 0.7 }, shadows: [glow('#b967ff', 20, 0, 0.5)]
    }),
    makeEx('wafu', '和風金箔', 'culture', {
      stops: [['#c9a227', 0], ['#e2c25a', 0.20], ['#f6ecc2', 0.35], ['#d4af37', 0.50],
              ['#b8912a', 0.70], ['#8a6a1c', 1]],
      stroke: { w: 0.14, color: '#1a140a' }, inner: { w: 0.035, color: '#c53d2a' },  // 朱
      shine: { opacity: 0.6 }
    }),
    makeEx('horror', 'ホラー', 'culture', {
      stops: [['#6a0a0e', 0], ['#8e1014', 0.20], ['#b81a1a', 0.38], ['#7c0c10', 0.55],
              ['#4a0608', 0.80], ['#2e0304', 1]],
      stroke: { w: 0.17, color: '#0c0304' }, inner: { w: 0.028, color: '#ffffff' },
      edge: '#180204', extrude: { contact: 0.6 }, shine: { opacity: 0.35 },
      shadows: [glow('#7a0000', 26, 4, 0.5)]
    })
  ];
  TS.PRESETS = TS.PRESETS.concat(EX);

  // カテゴリ定義（表示順）
  TS.PRESET_CATS = [
    ['color', 'カラー'], ['metal', 'メタル'], ['neon', '発光・ネオン'],
    ['texture', '質感'], ['culture', 'カルチャー']
  ];
})();
