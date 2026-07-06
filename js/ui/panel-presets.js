'use strict';
/* TS.panelPresets — プリセットタブ
   ・デザインプリセット: サムネカードのカテゴリ別グリッド（IntersectionObserverで遅延描画）
   ・モーションプリセット: 同じカード作法で**動くサムネ**（現在のデザイン＋各プリセットのモーションを
     共有rAFティッカーで再生。タブ非表示/画面外は停止＝負荷ゼロ）
   ・両セクションとも tuning-group のアコーディオンで開閉できる */
(function () {
  window.TS = window.TS || {};

  var STYLE_ID = 'tsPanelPresetsCSS';
  var CSS = '.preset-thumb-stage{position:absolute;left:50%;top:50%;pointer-events:none;}' +
    '.preset-cat-label{display:block;font-size:11px;color:var(--text-muted);letter-spacing:.05em;' +
      'margin:14px 0 8px;padding-top:10px;border-top:1px solid var(--border-soft);}' +
    '.preset-cat-label:first-of-type{margin-top:4px;padding-top:0;border-top:none;}' +
    /* プリセット節はグリッドが縦に長い → アコーディオン開時のmax-height制限を実質解除 */
    '#tsPanelPresets .tuning-group.open .tuning-group-body{max-height:20000px;}' +
    '#tsPanelPresets .tuning-group{margin-top:2px;}';

  var FIT_W = 88, FIT_H = 52;  // サムネ箱の実測不能時フォールバック(px)
  var THUMB_SIZE = 60;         // サムネ文字サイズpx
  var SHINE_T = 0.35;          // デザインサムネの静止フレーム t = period*0.35
  var DEBOUNCE_MS = 300;

  function injectCSS() {
    if (document.getElementById(STYLE_ID)) return;
    var st = document.createElement('style');
    st.id = STYLE_ID;
    st.textContent = CSS;
    document.head.appendChild(st);
  }
  function el(tag, cls) { var e = document.createElement(tag); if (cls) e.className = cls; return e; }

  // 現contentの先頭3文字（改行除去・サロゲート安全）。空なら「金」
  function thumbText(content) {
    var raw = String(content || '').replace(/\n/g, '');
    var t = Array.from(raw).slice(0, 3).join('');
    return t || '金';
  }

  function mount(container) {
    injectCSS();

    var appliedId = null;        // デザイン: 最終適用id
    var appliedMotionId = null;  // モーション: 最終適用id
    var prevDesign = null;       // 適用直前の layers/shadows（タップ解除で復元）
    var prevMotion = null;       // 適用直前の motion（タップ解除で復元）
    var designCards = [];
    var mpCards = [];
    var designDirtyAll = false;
    var timer = null;

    function curScene() {
      var s = (TS.store && TS.store.get) ? TS.store.get() : null;
      return s || TS.scene.create();
    }
    function isVisible() {
      return document.body.getAttribute('data-active-tab') === 'presets';
    }

    /* ==== 遅延描画IO（デザイン・モーション共用。画面内カードだけ処理） ==== */
    var visSet = new Set();
    var io = (typeof IntersectionObserver === 'function') ? new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        var c = en.target._tsCard;
        if (!c) return;
        if (en.isIntersecting) {
          visSet.add(c);
          if (c.dirty !== false) { c.draw(); c.dirty = false; }
        } else {
          visSet.delete(c);
        }
      });
    }, { rootMargin: '120px' }) : null;

    /* ==== カード共通ビルダー ==== */
    function buildCardShell(name, ariaLabel, onClick) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'preset';
      b.setAttribute('aria-pressed', 'false');
      b.setAttribute('aria-label', ariaLabel);
      var thumb = el('div', 'preset-thumb');
      var stage = el('div', 'preset-thumb-stage');
      thumb.appendChild(stage);
      var label = el('div', 'preset-label');
      label.textContent = name;
      b.appendChild(thumb);
      b.appendChild(label);
      b.addEventListener('click', onClick);
      return { btn: b, thumb: thumb, stage: stage, h: TS.renderDOM.mount(stage) };
    }
    function fitStage(c, ts) {
      var r = c.thumb.getBoundingClientRect();
      var fw = (r.width > 10 ? r.width : FIT_W) - 10;
      var fh = (r.height > 10 ? r.height : FIT_H) - 10;
      var w = FIT_W, hh = FIT_H;
      try {
        var lay = TS.layout.measure(ts);
        w = lay.block.w;
        hh = lay.block.h;
      } catch (e) { /* 計測不能時はフォールバック */ }
      var pad = (TS.scene.outerW(ts) + 0.12) * THUMB_SIZE * 2;
      var sc = Math.min(fw / (w + pad), fh / (hh + pad), 1);
      c.stage.style.transform = 'translate(-50%,-50%) scale(' + (Math.round(sc * 1000) / 1000) + ')';
    }

    /* ==== デザインプリセット（静止サムネ） ==== */
    function designThumbScene(preset) {
      var cur = curScene();
      var s = TS.scene.create();
      s.text.content = thumbText(cur.text && cur.text.content);
      if (cur.text && cur.text.font) s.text.font = cur.text.font;
      if (cur.text && cur.text.weight) s.text.weight = cur.text.weight;
      s.text.size = THUMB_SIZE;
      s.text.lineHeight = 1;
      s.text.italicSkew = 0;
      s.text.runs = [];
      s.layers = TS.scene.clone(preset.layers || []);
      s.shadows = TS.scene.clone(preset.shadows || []);
      return TS.scene.normalize(s);
    }
    function buildDesignCard(p) {
      var c = buildCardShell(p.name, 'プリセット「' + p.name + '」を適用', function () {
        if (appliedId === p.id && prevDesign) {
          // 適用中カードを再タップ → 適用前のデザインへ戻す（解除。Undo可）
          TS.store.set(function (d) {
            d.layers = TS.scene.clone(prevDesign.layers);
            d.shadows = TS.scene.clone(prevDesign.shadows);
          });
          appliedId = null;
          prevDesign = null;
          syncActive();
          return;
        }
        if (appliedId == null) {
          var cur = curScene();
          prevDesign = { layers: TS.scene.clone(cur.layers), shadows: TS.scene.clone(cur.shadows) };
        }
        TS.store.applyPreset(p);
        appliedId = p.id;
        syncActive();
      });
      c.preset = p;
      c.dirty = true;
      c.draw = function () {
        var ts = designThumbScene(p);
        c.h.update(ts);
        fitStage(c, ts);
        var period = (ts.motion && ts.motion.loop && ts.motion.loop[0] && ts.motion.loop[0].period) || 3;
        c.h.setTime(period * SHINE_T);   // 静止（照りが乗る時刻）
      };
      designCards.push(c);
      if (io) { c.thumb._tsCard = c; io.observe(c.thumb); }
      return c.btn;
    }
    function buildDesignBody() {
      var body = el('div');
      var cats = Array.isArray(TS.PRESET_CATS) ? TS.PRESET_CATS : [[null, null]];
      cats.forEach(function (cat) {
        var items = TS.PRESETS.filter(function (p) {
          return cat[0] == null || (p.cat || 'color') === cat[0];
        });
        if (!items.length) return;
        if (cat[1]) {
          var lb = el('span', 'preset-cat-label');
          lb.textContent = cat[1];
          body.appendChild(lb);
        }
        var list = el('div', 'presets-list');
        items.forEach(function (p) { list.appendChild(buildDesignCard(p)); });
        body.appendChild(list);
      });
      return body;
    }

    /* ==== モーションプリセット（動くサムネ＝現在のデザイン＋各モーション） ==== */
    function mpThumbScene(p) {
      var cur = TS.scene.clone(curScene());
      cur.text.content = thumbText(cur.text && cur.text.content);
      cur.text.size = THUMB_SIZE;
      cur.text.lineHeight = 1;
      cur.text.italicSkew = 0;
      cur.text.runs = [];
      cur.canvas = { w: 1920, h: 1080, fps: 30, background: 'transparent' };
      cur.motion = TS.scene.clone(p.motion);
      return TS.scene.normalize(cur);
    }
    function buildMpCard(p) {
      var c = buildCardShell(p.name, 'モーション「' + p.name + '」を適用', function () {
        if (appliedMotionId === p.id && prevMotion) {
          // 適用中カードを再タップ → 適用前のモーションへ戻す（解除。Undo可）
          TS.store.set(function (d) { d.motion = TS.scene.clone(prevMotion); });
          appliedMotionId = null;
          prevMotion = null;
          syncActive();
          return;
        }
        if (appliedMotionId == null) prevMotion = TS.scene.clone(curScene().motion);
        TS.store.set(function (d) { d.motion = TS.scene.clone(p.motion); }); // 1履歴・Undo可
        appliedMotionId = p.id;
        syncActive();
      });
      c.mp = p;
      c.dirty = true;
      c.D = 3;
      c.btn.title = p.desc || '';
      c.draw = function () {
        var ts = mpThumbScene(p);
        try { c.D = Math.max(0.5, TS.motion.timeline(ts).D); } catch (e) { c.D = 3; }
        c.h.update(ts);
        fitStage(c, ts);
        c.h.setTime(0);
      };
      mpCards.push(c);
      if (io) { c.thumb._tsCard = c; io.observe(c.thumb); }
      return c.btn;
    }
    function buildMpBody() {
      var body = el('div');
      var cats = Array.isArray(TS.MOTION_PRESET_CATS) ? TS.MOTION_PRESET_CATS : [null];
      cats.forEach(function (mc) {
        var items = (TS.MOTION_PRESETS || []).filter(function (p) { return mc == null || p.cat === mc; });
        if (!items.length) return;
        if (mc != null) {
          var lb = el('span', 'preset-cat-label');
          lb.textContent = mc;
          body.appendChild(lb);
        }
        var list = el('div', 'presets-list');
        items.forEach(function (p) { list.appendChild(buildMpCard(p)); });
        body.appendChild(list);
      });
      return body;
    }

    /* ==== 共有ティッカー（動くサムネ。可視カードのみ・タブ非表示は仕事ゼロ） ==== */
    var raf = 0;
    function tick(now) {
      raf = requestAnimationFrame(tick);
      if (!isVisible()) return;
      var t = now / 1000;
      visSet.forEach(function (c) {
        if (!c.mp || c.dirty !== false) return;
        c.h.setTime(t % c.D);
      });
    }

    /* ==== 組み立て（見出し＋アコーディオン2節） ==== */
    var title = el('h2', 'section-title');
    title.textContent = 'プリセット';
    container.appendChild(title);
    var designBody = buildDesignBody();
    var mpBody = buildMpBody();
    container.appendChild(TS.ui.group({
      icon: 'grid',
      title: 'デザインプリセット・' + TS.PRESETS.length + '種',
      open: true,
      body: designBody
    }));
    if (mpCards.length) {
      container.appendChild(TS.ui.group({
        icon: 'play',
        title: 'モーションプリセット・' + (TS.MOTION_PRESETS || []).length + '種',
        open: true,
        body: mpBody
      }));
    }

    /* ==== 再描画まわり ==== */
    function drawAllVisible() {
      designCards.concat(mpCards).forEach(function (c) {
        if (!io) { c.draw(); c.dirty = false; return; }
        if (visSet.has(c)) { c.draw(); c.dirty = false; }
        else c.dirty = true;
      });
      designDirtyAll = false;
    }
    function requestDraw() {
      if (isVisible()) drawAllVisible();
      else designDirtyAll = true;
    }

    // store購読: 文言/フォント/ウェイトは全サムネ、デザイン(layers/shadows)はモーションサムネに影響
    var lastKey = null;
    function sceneKey(s) {
      var t = (s && s.text) || {};
      return thumbText(t.content) + '|' + t.font + '|' + t.weight + '|' +
        JSON.stringify(s.layers || []).length + ':' + JSON.stringify(s.shadows || []).length;
    }
    lastKey = sceneKey(curScene());
    if (TS.store && TS.store.subscribe) {
      TS.store.subscribe(function (scene) {
        var k = sceneKey(scene);
        if (k === lastKey) return;
        lastKey = k;
        if (timer) clearTimeout(timer);
        timer = setTimeout(requestDraw, DEBOUNCE_MS);
      });
    }

    // タブ復帰時に保留分を描画
    var mo = new MutationObserver(function () {
      if (!isVisible()) return;
      if (designDirtyAll) drawAllVisible();
    });
    mo.observe(document.body, { attributes: true, attributeFilter: ['data-active-tab'] });

    if (document.fonts && document.fonts.ready && document.fonts.ready.then) {
      document.fonts.ready.then(function () { requestDraw(); });
    }

    function syncActive() {
      designCards.forEach(function (c) {
        var on = c.preset.id === appliedId;
        c.btn.classList.toggle('active', on);
        c.btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      mpCards.forEach(function (c) {
        var on = c.mp.id === appliedMotionId;
        c.btn.classList.toggle('active', on);
        c.btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
    }

    drawAllVisible();
    raf = requestAnimationFrame(tick);
    return { el: container };
  }

  TS.panelPresets = { mount: mount };
})();
