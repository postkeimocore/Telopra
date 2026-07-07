'use strict';
/* TS.panelHistory — 保存履歴タブ（§7）。完成テロップ（文言込みScene）をクラウド(TS.cloud)へ保存し、
   サムネ付き一覧から呼び出して再編集・再書き出し・削除できる。UIはMyプリセットと基本同じ。
   Myプリセット（＝デザイン/モーションの型の再利用）とは概念が別（こちらは文言込みの完成履歴）。 */
(function () {
  window.TS = window.TS || {};

  var STYLE_ID = 'tsPanelHistoryCSS';
  var CSS = [
    '.hist-note{font-size:10.5px;color:var(--text-dim);line-height:1.6;margin:2px 0 12px;}',
    '.hist-note b{color:var(--text-muted);font-weight:600;}',
    '.hist-thumb img{max-width:100%;max-height:100%;display:block;}',
    '.hist-loading{font-size:12px;color:var(--text-muted);padding:16px 4px;}',
    '.my-empty.hist{white-space:pre-line;}'
  ].join('\n');

  function injectCSS() {
    if (document.getElementById(STYLE_ID)) return;
    var st = document.createElement('style'); st.id = STYLE_ID; st.textContent = CSS; document.head.appendChild(st);
  }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function stamp() { var d = new Date(); function p(n) { return ('0' + n).slice(-2); } return d.getFullYear() + '/' + p(d.getMonth() + 1) + '/' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()); }

  // 保存シーンから小さめの透過PNGサムネ（dataURL）を作る
  function makeThumbDataURL(scene) {
    try {
      var cv = document.createElement('canvas');
      var scale = Math.min(1, 260 / (scene.canvas.w || 1920));
      var t = 0;
      try { t = TS.motion.timeline(scene).D * 0.35; } catch (e) { t = 0; }
      TS.renderCanvas.renderToCanvas(cv, scene, { t: t, scale: scale });
      return cv.toDataURL('image/png');
    } catch (e) { return ''; }
  }

  function mount(container) {
    injectCSS();
    var busy = false;

    var title = el('h2', 'section-title', '保存履歴');
    var count = el('span', 'section-title-count');
    title.appendChild(count);
    container.appendChild(title);

    // モード表示（クラウド / この端末のみ）
    var note = el('div', 'hist-note');
    function refreshNote() {
      if (TS.cloud.mode() === 'cloud') {
        note.innerHTML = '<b>クラウド保存中</b>：URLを配れば、知り合いも各自の履歴で使えます（上限' + TS.cloud.LIMIT + '件・古い順に自動削除）。';
      } else {
        note.innerHTML = '<b>この端末のみ</b>で保存中（クラウド未設定）。共有したい場合は worker/README.md の手順でWorkerをデプロイし js/cloud.js の API_BASE を設定してください。';
      }
    }
    refreshNote();
    container.appendChild(note);

    // 保存行
    var saveRow = el('div', 'my-save-row');
    var nameInput = el('input');
    nameInput.type = 'text'; nameInput.placeholder = '名前（未入力なら文言から）'; nameInput.maxLength = 28;
    var saveBtn = el('button', 'my-save-btn'); saveBtn.type = 'button';
    saveBtn.innerHTML = TS.ui.icon('plus') + '<span>いまのテロップを保存</span>';
    saveBtn.addEventListener('click', function () {
      if (busy) return;
      var scene = TS.scene.clone(TS.store.get());
      var name = nameInput.value.trim() || (String(scene.text && scene.text.content || '').replace(/\n/g, ' ').slice(0, 20) || 'テロップ');
      var thumb = makeThumbDataURL(scene);
      busy = true; saveBtn.disabled = true;
      TS.cloud.save({ name: name, scene: scene, thumb: thumb, savedAt: stamp() }).then(function () {
        nameInput.value = ''; busy = false; saveBtn.disabled = false; refreshList();
      }).catch(function (e) {
        busy = false; saveBtn.disabled = false;
        alert(e && e.message || '保存に失敗しました');
      });
    });
    saveRow.appendChild(nameInput); saveRow.appendChild(saveBtn);
    container.appendChild(saveRow);

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
      var b = el('button', 'layer-op-btn' + (danger ? ' danger' : '')); b.type = 'button';
      b.setAttribute('aria-label', label); b.title = label; b.innerHTML = TS.ui.icon(iconName);
      b.addEventListener('click', function (e) { e.stopPropagation(); fn(); });
      return b;
    }

    function renderItems(items) {
      listWrap.textContent = '';
      count.textContent = items.length + '件';
      if (!items.length) {
        listWrap.appendChild(el('div', 'my-empty hist',
          'まだ保存がありません。\nテロップを作って「いまのテロップを保存」を押すと、ここから呼び出して再編集・再書き出しできます。'));
        return;
      }
      var grid = el('div', 'presets-list');
      items.forEach(function (item) {
        var card = el('div', 'preset');
        card.setAttribute('role', 'button'); card.tabIndex = 0; card.style.cursor = 'pointer';
        var thumb = el('div', 'preset-thumb hist-thumb');
        if (item.thumb) { var img = new Image(); img.alt = item.name; img.src = item.thumb; thumb.appendChild(img); }
        var label = el('div', 'preset-label', item.name);
        var ops = el('div', 'my-card-ops');
        ops.appendChild(opBtn('trash', '削除', function () {
          TS.ui.confirm({ title: '保存履歴の削除', message: '「' + item.name + '」を削除しますか？元に戻せません。', okLabel: '削除', danger: true })
            .then(function (ok) {
              if (!ok) return;
              TS.cloud.del(item.key).then(refreshList).catch(function (e) { alert(e && e.message || '削除に失敗しました'); });
            });
        }, true));
        card.appendChild(thumb); card.appendChild(label); card.appendChild(ops);
        function call() {
          TS.cloud.load(item.key).then(function (r) {
            if (r && r.scene) applyScene(r.scene);
          }).catch(function (e) { alert(e && e.message || '呼び出しに失敗しました'); });
        }
        card.addEventListener('click', call);
        card.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); call(); } });
        grid.appendChild(card);
      });
      listWrap.appendChild(grid);
    }

    function refreshList() {
      listWrap.textContent = '';
      listWrap.appendChild(el('div', 'hist-loading', '読み込み中…'));
      TS.cloud.list().then(renderItems).catch(function (e) {
        listWrap.textContent = '';
        listWrap.appendChild(el('div', 'my-empty', '一覧を取得できませんでした：' + (e && e.message || e)));
      });
    }

    refreshList();
    return { el: container };
  }

  TS.panelHistory = { mount: mount };
})();
