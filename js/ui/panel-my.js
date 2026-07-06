'use strict';
/* TS.panelMy — Myプリセット（仕様書3章/8章: Scene JSONまるごとの保存・呼び出し・複製・書き出し）
   保存先: localStorage（Sceneは数KBなので十分。quota超過はtry/catchで通知）。
   サムネはデザインプリセットと同じく「保存したシーン自身」を renderDOM で小型描画。 */
(function () {
  window.TS = window.TS || {};

  var LS_KEY = 'tsMyPresets';
  var STYLE_ID = 'tsPanelMyCSS';
  var CSS = [
    '.my-save-row{display:flex;gap:8px;margin:4px 0 14px;}',
    '.my-save-row input{flex:1;min-width:0;padding:9px 12px;font-size:13px;color:var(--text);',
    '  background:var(--surface);border:1px solid var(--border-soft);border-radius:var(--radius-sm);}',
    '.my-save-row input:focus-visible{outline:2px solid var(--accent);outline-offset:-1px;}',
    '.my-save-btn{flex:0 0 auto;display:inline-flex;align-items:center;gap:5px;padding:9px 16px;',
    '  background:var(--accent);color:#fff;border:none;border-radius:var(--radius-sm);',
    '  font-size:12px;font-weight:600;letter-spacing:.04em;cursor:pointer;',
    '  -webkit-tap-highlight-color:transparent;transition:all .2s var(--easing);}',
    '.my-save-btn svg{width:12px;height:12px;flex-shrink:0;}',
    '@media(hover:hover){.my-save-btn:hover{background:var(--accent-strong);}}',
    '.my-save-btn:active{transform:scale(.97);}',
    '.my-empty{font-size:11.5px;color:var(--text-dim);line-height:1.7;padding:14px 4px;}',
    '.my-card-ops{display:flex;gap:4px;justify-content:center;margin-top:2px;}',
    '.my-io-row{display:flex;gap:8px;margin-top:16px;padding-top:12px;border-top:1px solid var(--border-soft);}',
    '.my-io-row .pt-mini-btn,.my-io-row .my-io-btn{background:var(--surface);border:1px solid var(--border-soft);',
    '  color:var(--text-muted);font-size:10.5px;letter-spacing:.03em;padding:7px 12px;border-radius:var(--radius-pill);',
    '  cursor:pointer;-webkit-tap-highlight-color:transparent;transition:all .2s var(--easing);}',
    '@media(hover:hover){.my-io-row .my-io-btn:hover{border-color:var(--accent-soft);color:var(--accent);}}'
  ].join('\n');

  function injectCSS() {
    if (document.getElementById(STYLE_ID)) return;
    var st = document.createElement('style');
    st.id = STYLE_ID;
    st.textContent = CSS;
    document.head.appendChild(st);
  }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function loadAll() {
    try {
      var raw = localStorage.getItem(LS_KEY);
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }
  function saveAll(arr) {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(arr));
      return true;
    } catch (e) {
      alert('保存できませんでした（ブラウザの保存容量の上限）。不要なMyプリセットを削除してください。');
      return false;
    }
  }
  function newId() { return 'my_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function stamp() {
    var d = new Date();
    function p(n) { return ('0' + n).slice(-2); }
    return d.getFullYear() + '/' + p(d.getMonth() + 1) + '/' + p(d.getDate());
  }

  function mount(container) {
    injectCSS();
    var items = loadAll();
    var handles = [];   // {h, stage, item} サムネ再描画用

    var title = el('h2', 'section-title', 'Myプリセット');
    var count = el('span', 'section-title-count');
    title.appendChild(count);
    container.appendChild(title);

    // ---- 保存行（名前＋保存） ----
    var saveRow = el('div', 'my-save-row');
    var nameInput = el('input');
    nameInput.type = 'text';
    nameInput.placeholder = '名前（例: 金・ドドン用）';
    nameInput.maxLength = 24;
    var saveBtn = el('button', 'my-save-btn');
    saveBtn.type = 'button';
    saveBtn.innerHTML = TS.ui.icon('plus') + '<span>いまの状態を保存</span>';
    saveBtn.addEventListener('click', function () {
      var name = nameInput.value.trim() || ('プリセット ' + (items.length + 1));
      items.unshift({ id: newId(), name: name, savedAt: stamp(),
                      scene: TS.scene.clone(TS.store.get()) });
      if (saveAll(items)) {
        nameInput.value = '';
        renderList();
      } else {
        items.shift();
      }
    });
    saveRow.appendChild(nameInput);
    saveRow.appendChild(saveBtn);
    container.appendChild(saveRow);

    // ---- 一覧 ----
    var listWrap = el('div');
    container.appendChild(listWrap);

    function applyScene(saved) {
      TS.store.set(function (d) {
        var s = TS.scene.normalize(TS.scene.clone(saved));
        Object.keys(d).forEach(function (k) { delete d[k]; });
        Object.assign(d, s);
      });
    }

    function opBtn(iconName, label, fn, danger) {
      var b = el('button', 'layer-op-btn' + (danger ? ' danger' : ''));
      b.type = 'button';
      b.setAttribute('aria-label', label);
      b.title = label;
      b.innerHTML = TS.ui.icon(iconName);
      b.addEventListener('click', function (e) { e.stopPropagation(); fn(); });
      return b;
    }

    function renderList() {
      listWrap.textContent = '';
      handles = [];
      count.textContent = items.length + '件';
      if (!items.length) {
        listWrap.appendChild(el('div', 'my-empty',
          'まだ保存がありません。テキスト・デザイン・モーションを作って「いまの状態を保存」を押すと、ここからいつでも呼び出せます。'));
        return;
      }
      var grid = el('div', 'presets-list');
      items.forEach(function (item) {
        var card = el('div', 'preset');
        card.setAttribute('role', 'button');
        card.tabIndex = 0;
        card.style.cursor = 'pointer';
        var thumb = el('div', 'preset-thumb');
        var stage = el('div', 'preset-thumb-stage');
        thumb.appendChild(stage);
        var label = el('div', 'preset-label', item.name);
        var ops = el('div', 'my-card-ops');
        ops.appendChild(opBtn('copy', '複製', function () {
          items.unshift({ id: newId(), name: item.name + ' コピー', savedAt: stamp(),
                          scene: TS.scene.clone(item.scene) });
          if (saveAll(items)) renderList(); else items.shift();
        }));
        ops.appendChild(opBtn('image', 'JSONを書き出す', function () {
          var blob = new Blob([JSON.stringify({ name: item.name, scene: item.scene }, null, 2)],
            { type: 'application/json' });
          var a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = 'telop_' + item.name.replace(/[\\/:*?"<>|\s]+/g, '_') + '.json';
          a.click();
          setTimeout(function () { URL.revokeObjectURL(a.href); }, 10000);
        }));
        ops.appendChild(opBtn('trash', '削除', function () {
          TS.ui.confirm({ title: 'Myプリセットの削除',
            message: '「' + item.name + '」を削除しますか？この操作は元に戻せません。',
            okLabel: '削除', danger: true }).then(function (ok) {
            if (!ok) return;
            items = items.filter(function (x) { return x.id !== item.id; });
            saveAll(items);
            renderList();
          });
        }, true));
        card.appendChild(thumb);
        card.appendChild(label);
        card.appendChild(ops);
        function apply() { applyScene(item.scene); }
        card.addEventListener('click', apply);
        card.addEventListener('keydown', function (e) {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); apply(); }
        });
        grid.appendChild(card);
        // サムネ（保存シーン自身をミニ描画。文字サイズだけ縮めて収める）
        try {
          var ts = TS.scene.normalize(TS.scene.clone(item.scene));
          ts.text.size = 60;
          ts.text.content = (ts.text.content || '').replace(/\n/g, '').slice(0, 3) || '金';
          ts.text.runs = [];
          var h = TS.renderDOM.mount(stage);
          h.update(ts);
          var lay = TS.layout.measure(ts);
          var pad = (TS.scene.outerW(ts) + 0.12) * 60 * 2;
          var sc = Math.min(78 / (lay.block.w + pad), 42 / (lay.block.h + pad), 1);
          stage.style.transform = 'translate(-50%,-50%) scale(' + (Math.round(sc * 1000) / 1000) + ')';
          h.setTime(1.2);
          handles.push({ h: h });
        } catch (e) { /* サムネ失敗は無害（枠だけ表示） */ }
      });
      listWrap.appendChild(grid);
    }

    // ---- JSON読み込み ----
    var ioRow = el('div', 'my-io-row');
    var importBtn = el('button', 'my-io-btn', 'JSONを読み込む');
    importBtn.type = 'button';
    var fileInput = el('input');
    fileInput.type = 'file';
    fileInput.accept = 'application/json,.json';
    fileInput.style.display = 'none';
    importBtn.addEventListener('click', function () { fileInput.click(); });
    fileInput.addEventListener('change', function () {
      var f = fileInput.files && fileInput.files[0];
      if (!f) return;
      f.text().then(function (txt) {
        var data = JSON.parse(txt);
        var scene = data.scene || data;   // {name, scene} 形式と素のScene両対応
        var normalized = TS.scene.normalize(scene);   // 不正なら例外/補完
        items.unshift({ id: newId(), name: (data.name || f.name.replace(/\.json$/i, '')).slice(0, 24),
                        savedAt: stamp(), scene: normalized });
        if (saveAll(items)) renderList(); else items.shift();
      }).catch(function () {
        alert('読み込めませんでした。Telopra が書き出したJSONを選んでください。');
      });
      fileInput.value = '';
    });
    ioRow.appendChild(importBtn);
    ioRow.appendChild(fileInput);
    container.appendChild(ioRow);

    renderList();
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () { renderList(); });   // フォント確定後にサムネ描き直し
    }
    return { el: container };
  }

  TS.panelMy = { mount: mount };
})();
