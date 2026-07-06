'use strict';
// TS.uiPreview — プレビュー領域（契約書§6.11）
// ステージ（scene.canvasのアスペクト箱）に DOM / Canvas 両レンダラを重ね、
// 背景チップ・解像度セグメント・表示切替[DOM|Canvas|差分]・ガイド・再生制御を配線する。
(function () {
  window.TS = window.TS || {};

  var VIEWS = [
    { value: 'dom', label: 'DOM' },
    { value: 'canvas', label: 'Canvas' },
    { value: 'diff', label: '差分' }
  ];
  var RESOLUTIONS = [
    { w: 1920, h: 1080, label: '1920×1080' },
    { w: 1080, h: 1920, label: '1080×1920' },
    { w: 1080, h: 1080, label: '1080×1080' }
  ];
  // 背景チップ用ミニチェッカー
  var CHIP_CHECKER = 'repeating-conic-gradient(#E9EBF0 0% 25%, #FFFFFF 0% 50%) 0 0 / 10px 10px';
  var CHIP_BASE = 'width:22px;height:22px;border-radius:50%;border:2px solid var(--border);' +
    'padding:0;flex-shrink:0;box-shadow:var(--shadow-soft);cursor:pointer;';

  function el(tag, cls) { var e = document.createElement(tag); if (cls) e.className = cls; return e; }
  function btn(cls) { var b = el('button', cls); b.type = 'button'; return b; }

  function mount(container) {
    // ---- 表示状態（scene以外のプレビューローカル状態） ----
    var view = 'dom';            // dom | canvas | diff
    var playing = true;          // 再生/停止トグル
    var speed = 1;               // 再生速度（0.5/1/2）
    var pausedT = 0;             // 停止時に固定する時刻（秒）
    var clock0 = performance.now(); // 再生クロック起点
    var diffT = 0;               // 差分モードの同期時刻（秒）
    var scrubbing = false;       // スクラブ操作中はスライダーの自動追従を止める
    var bgKind = 'checker';      // checker | black | white | gray | color | image
    var bgColor = '#333333';
    var bgUrl = null;            // 画像背景の objectURL
    var raf = 0;                 // canvasアニメ用 rAF ハンドル
    var fontToken = 0;           // フォントensureの競合防止トークン

    // ---- ステージ構築 ----
    var wrap = el('div', 'preview-wrap');
    var stage = el('div', 'stage');

    var bgEl = el('div', 'stage-bg stage-bg--checker');

    // scene座標の箱（canvas.w×h px）。中央に置いて scale(fit)。DOMテロップは flex 中央
    var sceneBox = el('div', 'stage-scene');
    sceneBox.style.cssText =
      'position:absolute;left:50%;top:50%;display:flex;align-items:center;justify-content:center;' +
      'transform:translate(-50%,-50%) scale(1);';
    var dom = TS.renderDOM.mount(sceneBox);

    var canvas = el('canvas', 'stage-canvas hidden');
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;';
    canvas.setAttribute('aria-hidden', 'true');

    var guides = el('div', 'stage-guides hidden');

    stage.appendChild(bgEl);
    stage.appendChild(sceneBox);
    stage.appendChild(canvas);
    stage.appendChild(guides);
    wrap.appendChild(stage);
    container.appendChild(wrap);

    // ---- 時間ヘルパ（P2: タイムライン全長 D をループ。TS.motion が唯一の時間定義） ----
    function totalD() {
      try { return Math.max(0.1, TS.motion.timeline(TS.store.get()).D); }
      catch (e) { return 3; }
    }
    function elapsed() { // 経過秒（D循環・速度反映）
      var D = totalD();
      var t = ((performance.now() - clock0) / 1000) * speed;
      return ((t % D) + D) % D;
    }
    function rebaseClock(t) { // 時刻 t から再生継続するようクロック起点を合わせる
      clock0 = performance.now() - (t / speed) * 1000;
    }
    function displayT() { // 静止描画に使う時刻
      if (view === 'diff') return diffT;
      return playing ? elapsed() : pausedT;
    }

    // ---- fit 計算・canvas描画 ----
    function fitScale() {
      var rect = stage.getBoundingClientRect();
      var scene = TS.store.get();
      return rect.width > 0 ? rect.width / scene.canvas.w : 0;
    }
    function layoutStage() { // DOMテロップの scale(fit) を更新
      var fit = fitScale();
      if (fit > 0) sceneBox.style.transform = 'translate(-50%,-50%) scale(' + fit + ')';
      return fit;
    }
    function renderCanvasNow(t) { // 非表示（DOM単独）時は描かない
      if (view === 'dom') return;
      var fit = fitScale();
      if (!(fit > 0)) return;
      TS.renderCanvas.renderToCanvas(canvas, TS.store.get(), {
        t: t === undefined ? null : t,
        scale: fit * (window.devicePixelRatio || 1)
      });
    }

    // ---- 再生クロック（P2: CSSアニメ廃止。rAFが両レンダラを setTime/render で駆動する） ----
    function tick() {
      raf = 0;
      if (view === 'diff' || !playing) return;
      var t = elapsed();
      if (view === 'dom') dom.setTime(t);
      else renderCanvasNow(t);
      if (!scrubbing) syncSliderTo(t);
      raf = requestAnimationFrame(tick);
    }
    function startLoop() { if (!raf) raf = requestAnimationFrame(tick); }
    function stopLoop() { if (raf) { cancelAnimationFrame(raf); raf = 0; } }

    // ---- 再生状態の適用 ----
    function applyTimeState() {
      if (view === 'diff') {   // 差分: rAF停止・スライダー時刻で両者を静止同期
        stopLoop();
        dom.setTime(diffT);
        renderCanvasNow(diffT);
        syncSliderTo(diffT);
        return;
      }
      if (playing) {
        startLoop();
      } else {
        stopLoop();
        dom.setTime(pausedT);
        if (view === 'canvas') renderCanvasNow(pausedT);
        syncSliderTo(pausedT);
      }
    }
    function setPlaying(on) {
      playing = on;
      if (on) rebaseClock(pausedT); // 停止位置から再開
      else pausedT = elapsed();
      applyTimeState();
    }

    // ---- 表示切替 [DOM|Canvas|差分] ----
    var viewWrap = el('div', 'ba-toggle');
    viewWrap.setAttribute('role', 'group');
    viewWrap.setAttribute('aria-label', '表示切替');
    var viewBtns = VIEWS.map(function (v) {
      var b = btn('ba-btn');
      b.textContent = v.label;
      b.dataset.value = v.value;
      b.addEventListener('click', function () { setView(v.value); });
      viewWrap.appendChild(b);
      return b;
    });
    function syncViewBtns() {
      viewBtns.forEach(function (b) {
        var on = b.dataset.value === view;
        b.classList.toggle('active', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
    }
    function setView(v) {
      view = v;
      syncViewBtns();
      sceneBox.style.visibility = (v === 'canvas') ? 'hidden' : ''; // canvas単独時のみDOM非表示
      canvas.classList.toggle('hidden', v === 'dom');
      canvas.style.mixBlendMode = (v === 'diff') ? 'difference' : ''; // 差分=DOMの上に重ねる
      if (v === 'diff') { dom.setTime(diffT); } // 差分はスライダー駆動で静止
      playBtn.disabled = (v === 'diff');
      applyTimeState();
    }

    // ---- 解像度セグメント ----
    var resWrap = el('div', 'option-group');
    resWrap.style.margin = '0';
    resWrap.style.flex = '0 1 auto';
    resWrap.setAttribute('role', 'group');
    resWrap.setAttribute('aria-label', '解像度');
    var resBtns = RESOLUTIONS.map(function (r) {
      var b = btn('option-btn');
      b.textContent = r.label;
      b.addEventListener('click', function () {
        var c = TS.store.get().canvas;
        if (c.w === r.w && c.h === r.h) return;
        TS.store.set(function (d) { d.canvas.w = r.w; d.canvas.h = r.h; });
      });
      resWrap.appendChild(b);
      return b;
    });
    function syncResBtns(scene) {
      resBtns.forEach(function (b, i) {
        var on = RESOLUTIONS[i].w === scene.canvas.w && RESOLUTIONS[i].h === scene.canvas.h;
        b.classList.toggle('active', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
    }

    // ---- 背景チップ（透過/黒/白/グレー/任意色/画像） ----
    var bgWrap = el('div');
    bgWrap.style.cssText = 'display:flex;align-items:center;gap:6px;';
    bgWrap.setAttribute('role', 'group');
    bgWrap.setAttribute('aria-label', '背景');
    var bgChips = {}; // kind -> 要素（active枠の同期用）

    function addChip(kind, title, bgCss) {
      var b = btn();
      b.title = title;
      b.setAttribute('aria-label', '背景: ' + title);
      b.style.cssText = CHIP_BASE + 'background:' + bgCss + ';';
      b.addEventListener('click', function () { bgKind = kind; applyBg(); });
      bgChips[kind] = b;
      bgWrap.appendChild(b);
    }
    addChip('checker', '透過', CHIP_CHECKER);
    addChip('black', '黒', '#000000');
    addChip('white', '白', '#ffffff');
    addChip('gray', 'グレー', '#808080');

    // 任意色: チップ全面を <input type=color> で覆う（.color-swatch と同じ手法）
    var colorChip = el('span');
    colorChip.style.cssText = CHIP_BASE + 'position:relative;display:inline-block;overflow:hidden;background:' + bgColor + ';';
    var colorPick = el('input');
    colorPick.type = 'color';
    colorPick.value = bgColor;
    colorPick.title = '任意色';
    colorPick.setAttribute('aria-label', '背景: 任意色');
    colorPick.style.cssText = 'position:absolute;inset:-6px;width:calc(100% + 12px);height:calc(100% + 12px);border:none;padding:0;background:none;cursor:pointer;';
    colorPick.addEventListener('input', function () {
      bgColor = colorPick.value;
      colorChip.style.background = bgColor;
      bgKind = 'color';
      applyBg();
    });
    colorChip.appendChild(colorPick);
    bgChips.color = colorChip;
    bgWrap.appendChild(colorChip);

    // 画像: file input → objectURL（cover配置）。差し替え時は旧URLをrevoke
    var imgChip = btn();
    imgChip.title = '画像';
    imgChip.setAttribute('aria-label', '背景: 画像を選択');
    imgChip.style.cssText = CHIP_BASE + 'background:var(--surface);display:inline-flex;align-items:center;justify-content:center;color:var(--text-muted);';
    imgChip.innerHTML = TS.ui.icon('image');
    imgChip.firstElementChild.style.cssText = 'width:12px;height:12px;';
    var fileInput = el('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.style.display = 'none';
    fileInput.setAttribute('aria-hidden', 'true');
    imgChip.addEventListener('click', function () { fileInput.click(); });
    fileInput.addEventListener('change', function () {
      var f = fileInput.files && fileInput.files[0];
      if (!f) return;
      if (bgUrl) URL.revokeObjectURL(bgUrl);
      bgUrl = URL.createObjectURL(f);
      bgKind = 'image';
      applyBg();
      fileInput.value = ''; // 同じファイルの再選択も change を発火させる
    });
    bgChips.image = imgChip;
    bgWrap.appendChild(imgChip);
    bgWrap.appendChild(fileInput);

    function applyBg() {
      var cls = 'stage-bg';
      if (bgKind === 'checker' || bgKind === 'black' || bgKind === 'white' || bgKind === 'gray') {
        cls += ' stage-bg--' + bgKind;
      }
      bgEl.className = cls;
      bgEl.style.background = '';
      if (bgKind === 'color') {
        bgEl.style.background = bgColor;
      } else if (bgKind === 'image' && bgUrl) {
        bgEl.style.backgroundImage = 'url("' + bgUrl + '")';
        bgEl.style.backgroundSize = 'cover';
        bgEl.style.backgroundPosition = 'center';
      }
      Object.keys(bgChips).forEach(function (k) {
        bgChips[k].style.borderColor = (k === bgKind) ? 'var(--accent)' : 'var(--border)';
      });
    }

    // ---- ガイド・再生トグル ----
    var guideBtn = TS.ui.toggle({
      label: 'ガイド', checked: false,
      onChange: function (on) { guides.classList.toggle('hidden', !on); }
    });
    guideBtn.style.flex = '0 0 auto';
    var playBtn = TS.ui.toggle({ label: '再生', checked: true, onChange: setPlaying });
    playBtn.style.flex = '0 0 auto';

    // ---- タイムスクラブ（常時表示。0..D, step 1/30）＋速度セグメント（§4） ----
    var sliderWrap = el('div', 'preview-toolbar');
    var sliderRow = el('div', 'slider-row timeline-row');   // タイムライン=playhead（Signal Cyan）
    sliderRow.style.flex = '1 1 auto';
    sliderRow.style.minWidth = '160px';
    var sIcon = el('span', 'slider-icon');
    sIcon.innerHTML = TS.ui.icon('play');
    var sLabel = el('span', 'slider-label');
    sLabel.textContent = '時刻';
    sLabel.style.width = 'auto';
    var sRange = el('input');
    sRange.type = 'range';
    sRange.min = '0';
    sRange.max = String(totalD());
    sRange.step = String(1 / 30);
    sRange.value = '0';
    sRange.setAttribute('aria-label', 'タイムライン時刻');
    var sValue = el('span', 'slider-value');
    function showT(t) { sValue.textContent = t.toFixed(2) + 's'; }
    showT(0);
    function syncSliderTo(t) { // 再生中の自動追従（スクラブ中は止める）
      sRange.value = String(t);
      showT(t);
    }
    sRange.addEventListener('pointerdown', function () { scrubbing = true; });
    sRange.addEventListener('pointerup', function () { scrubbing = false; });
    sRange.addEventListener('input', function () {
      var v = parseFloat(sRange.value) || 0;
      showT(v);
      if (view === 'diff') {
        diffT = v;
        dom.setTime(diffT);       // DOM seek と canvas render を同時刻に同期
        renderCanvasNow(diffT);
        return;
      }
      if (playing) rebaseClock(v);  // 再生中はジャンプ
      else {
        pausedT = v;
        dom.setTime(v);
        if (view === 'canvas') renderCanvasNow(v);
      }
    });
    sliderRow.appendChild(sIcon);
    sliderRow.appendChild(sLabel);
    sliderRow.appendChild(sRange);
    sliderRow.appendChild(sValue);
    sliderWrap.appendChild(sliderRow);

    // 速度セグメント
    var speedWrap = el('div', 'option-group');
    speedWrap.style.cssText = 'margin:0;flex:0 0 auto;width:auto;';
    speedWrap.setAttribute('role', 'group');
    speedWrap.setAttribute('aria-label', '再生速度');
    [[0.5, '0.5×'], [1, '1×'], [2, '2×']].forEach(function (sp) {
      var b = btn('option-btn');
      b.textContent = sp[1];
      b.style.flex = '0 0 auto';
      b.style.padding = '7px 10px';
      b.classList.toggle('active', sp[0] === 1);
      b.addEventListener('click', function () {
        var t = displayT();
        speed = sp[0];
        rebaseClock(t);   // 速度変更でも時刻連続
        Array.prototype.forEach.call(speedWrap.children, function (c) {
          c.classList.toggle('active', c === b);
        });
      });
      speedWrap.appendChild(b);
    });
    sliderWrap.appendChild(speedWrap);

    function syncSliderMax() {
      var D = totalD();
      if (sRange.max !== String(D)) {
        sRange.max = String(D);
        if (diffT > D) { diffT = D; }
        if (pausedT > D) { pausedT = D; }
      }
    }

    // ---- ツールバー組み立て ----
    var toolbar = el('div', 'preview-toolbar');
    toolbar.appendChild(viewWrap);
    toolbar.appendChild(resWrap);
    toolbar.appendChild(bgWrap);
    toolbar.appendChild(guideBtn);
    toolbar.appendChild(playBtn);
    container.appendChild(toolbar);
    container.appendChild(sliderWrap);

    // ---- シーン反映（store.subscribe で全再描画） ----
    function onScene(scene) {
      stage.style.aspectRatio = scene.canvas.w + ' / ' + scene.canvas.h;
      sceneBox.style.width = scene.canvas.w + 'px';
      sceneBox.style.height = scene.canvas.h + 'px';
      syncResBtns(scene);
      syncSliderMax();
      dom.update(scene); // 差分/停止中の seek 時刻は renderDOM が再適用する
      layoutStage();
      // canvas はフォント ensure 後に描画（計測はロード後のみ有効）
      var token = ++fontToken;
      function paint() {
        if (token !== fontToken) return; // 後続の更新が来ていたら破棄
        if (view !== 'dom') renderCanvasNow(displayT());
      }
      TS.fonts.ensure(scene.text.font, scene.text.weight).then(paint, paint);
    }
    TS.store.subscribe(onScene);

    // ---- リサイズ追随（fit 再計算） ----
    function onResize() {
      layoutStage();
      if (view !== 'dom') renderCanvasNow(displayT());
    }
    if (typeof ResizeObserver === 'function') {
      new ResizeObserver(onResize).observe(stage);
    } else {
      window.addEventListener('resize', onResize);
    }

    // ---- 初期化 ----
    onScene(TS.store.get());
    setView('dom');
    applyBg();

    return {
      el: wrap,
      refresh: function () { onScene(TS.store.get()); } // fonts.ready 後の再描画などに使用
    };
  }

  TS.uiPreview = { mount: mount };
})();
