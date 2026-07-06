'use strict';
// app.js — 起動シーケンスと配線（契約書§7）
// fonts.injectLink → store.init → 各mount → タブ配線 → Undo/Redo → fonts.ready後に再描画1回
(function () {
  window.TS = window.TS || {};

  // フェーズタブ定義（motion / my は準備中: disabled + バッジ）
  var TABS = [
    { id: 'text', label: 'テキスト' },
    { id: 'presets', label: 'プリセット' },
    { id: 'design', label: 'デザイン' },
    { id: 'motion', label: 'モーション' },
    { id: 'my', label: 'Myプリセット' }
  ];

  // モジュールを指定セレクタへ mount（未実装モジュールは静かにスキップ）
  function mountInto(mod, sel) {
    var host = document.querySelector(sel);
    if (!host || !mod || typeof mod.mount !== 'function') return null;
    return mod.mount(host);
  }

  // ---- タブ配線（.tab-btn と #tsPhaseSwitch の両方 → body[data-active-tab]） ----
  function wireTabs() {
    var phaseHost = document.getElementById('tsPhaseSwitch');
    var phaseBtns = [];
    if (phaseHost) {
      var group = document.createElement('div');
      group.className = 'option-group';
      group.setAttribute('role', 'tablist');
      TABS.forEach(function (t) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'option-btn';
        b.dataset.tab = t.id;
        b.setAttribute('role', 'tab');
        b.textContent = t.label;
        if (t.disabled) {
          b.disabled = true;
          b.setAttribute('aria-disabled', 'true');
          var badge = document.createElement('span');
          badge.className = 'coming-soon-badge';
          badge.textContent = t.badge;
          b.appendChild(badge);
        }
        b.addEventListener('click', function () {
          if (b.disabled) return;
          setTab(t.id);
        });
        group.appendChild(b);
        phaseBtns.push(b);
      });
      phaseHost.appendChild(group);
    }

    var tabBtns = Array.prototype.slice.call(document.querySelectorAll('.tab-btn'));
    tabBtns.forEach(function (b) {
      b.addEventListener('click', function () {
        if (b.disabled) return; // disabledタブはクリック無効
        setTab(b.dataset.tab);
      });
    });

    function setTab(id) {
      document.body.setAttribute('data-active-tab', id);
      tabBtns.forEach(function (b) {
        var on = b.dataset.tab === id;
        b.classList.toggle('active', on);
        b.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      phaseBtns.forEach(function (b) {
        var on = b.dataset.tab === id;
        b.classList.toggle('active', on);
        b.setAttribute('aria-selected', on ? 'true' : 'false');
      });
    }

    // 初期タブ（index.html の data-active-tab。既定 presets）を全UIへ反映
    setTab(document.body.getAttribute('data-active-tab') || 'presets');
  }

  // ---- Undo/Redo（ボタン + Cmd/Ctrl+Z / Shift+Cmd/Ctrl+Z） ----
  function wireHistory() {
    var undoBtn = document.getElementById('tsUndo');
    var redoBtn = document.getElementById('tsRedo');

    function sync() {
      if (undoBtn) undoBtn.disabled = !TS.store.canUndo();
      if (redoBtn) redoBtn.disabled = !TS.store.canRedo();
    }
    if (undoBtn) undoBtn.addEventListener('click', function () { TS.store.undo(); sync(); });
    if (redoBtn) redoBtn.addEventListener('click', function () { TS.store.redo(); sync(); });
    TS.store.subscribe(sync);
    sync();

    document.addEventListener('keydown', function (e) {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (String(e.key).toLowerCase() !== 'z') return;
      // テキスト入力中はブラウザ標準のundoを尊重
      var t = e.target;
      if (t instanceof Element && (t.closest('input, textarea, select') || t.isContentEditable)) return;
      e.preventDefault();
      if (e.shiftKey) TS.store.redo(); else TS.store.undo();
      sync();
    });
  }

  function boot() {
    // 1) テロップ用フォントCSSの注入（ロードを最速で開始）
    TS.fonts.injectLink();

    // 2) 状態初期化（既定シーン）
    TS.store.init(TS.scene.create());

    // 3) 各モジュールの mount
    var preview = mountInto(TS.uiPreview, '#tsPreviewSection');
    mountInto(TS.panelText, '#tsPanelText');
    mountInto(TS.panelDesign, '#tsPanelDesign');
    mountInto(TS.panelPresets, '#tsPanelPresets');
    mountInto(TS.panelMotion, '#tsPanelMotion');
    mountInto(TS.panelMy, '#tsPanelMy');

    // 4) タブ・履歴・書き出しの配線
    wireTabs();
    wireHistory();
    var exportBtn = document.getElementById('tsExport');
    if (exportBtn && TS.uiExport && typeof TS.uiExport.mount === 'function') {
      var exporter = TS.uiExport.mount();
      exportBtn.addEventListener('click', function () { exporter.open(); });
    }

    // 5) フォントロード完了後に再描画1回（Canvas計測をロード済みフォントで確定）
    if (document.fonts && document.fonts.ready && typeof document.fonts.ready.then === 'function') {
      document.fonts.ready.then(function () {
        if (preview && typeof preview.refresh === 'function') preview.refresh();
      });
    }

    // 6) PWA: Service Worker 登録（http(s)のみ。file://では黙ってスキップ）
    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
      navigator.serviceWorker.register('sw.js').catch(function () { /* 開発環境等の失敗は無視 */ });
    }
  }

  // script は body 末尾読込だが、念のため DOM 構築完了を保証
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
