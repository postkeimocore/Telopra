'use strict';
/* TS.uiProjectBar — 「まとめて作る」プロジェクトのテロップ一覧（フィルムストリップ・IA_fix §3）
   サムネ＋文言のカードを横並びで持ち、タップで編集対象を切替。追加/複製/削除/並べ替え。
   編集中カードは対比（枠＋アクセント）で強調。編集中の見た目は store 購読でライブ更新。
   プロジェクト非アクティブ時は非表示（単発は従来どおりメインUIのみ）。 */
(function () {
  window.TS = window.TS || {};

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function iconBtn(name, label, fn) {
    var b = el('button', 'pj-op'); b.type = 'button'; b.setAttribute('aria-label', label); b.title = label;
    b.innerHTML = TS.ui.icon(name);
    b.addEventListener('click', function (e) { e.stopPropagation(); fn(); });
    return b;
  }
  function shortText(s) { return String(s || '').replace(/\n/g, ' ').slice(0, 10) || '（空）'; }

  // 1カードのサムネ（編集中Sceneを DOM で小型描画。rAFで挿入後にfit）
  function drawThumb(box, scene) {
    box.innerHTML = '';
    var inner = el('div', 'pj-thumb-inner');
    inner.style.cssText = 'position:absolute;left:50%;top:50%;';
    box.appendChild(inner);
    requestAnimationFrame(function () {
      try {
        var h = TS.renderDOM.mount(inner);
        h.update(scene);
        var L = TS.layout.measure(scene);
        var bw = L.block.w || 1, bh = L.block.h || 1;
        var r = box.getBoundingClientRect();
        var fit = Math.min((r.width - 6) / bw, (r.height - 6) / bh);
        if (!(fit > 0) || !isFinite(fit)) fit = 0.05;
        inner.style.transform = 'translate(-50%,-50%) scale(' + fit + ')';
        h.setTime(TS.motion.timeline(scene).D * 0.35);
      } catch (e) { /* noop */ }
    });
  }

  function mount(container) {
    var bar = el('div', 'project-bar');
    container.appendChild(bar);

    // ヘッダー行（コンテキスト＋編集中テロップの操作＋終了）
    var head = el('div', 'pj-head');
    var titleWrap = el('div', 'pj-title-wrap');
    var title = el('span', 'pj-title', 'まとめて作る');
    var count = el('span', 'pj-count');
    titleWrap.appendChild(title); titleWrap.appendChild(count);
    var ops = el('div', 'pj-ops');
    var dupBtn = iconBtn('copy', '編集中を複製', function () { TS.project.duplicate(TS.project.index()); });
    var prevBtn = iconBtn('chevron-down', '前へ移動', function () { TS.project.move(TS.project.index(), -1); });
    var nextBtn = iconBtn('chevron-down', '次へ移動', function () { TS.project.move(TS.project.index(), 1); });
    prevBtn.classList.add('pj-op-prev');   // chevron-down を回転で ← に
    nextBtn.classList.add('pj-op-next');   // → に
    var delBtn = el('button', 'pj-op danger'); delBtn.type = 'button'; delBtn.setAttribute('aria-label', '編集中を削除'); delBtn.title = '編集中を削除';
    delBtn.innerHTML = TS.ui.icon('trash');
    delBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (TS.project.count() <= 1) return;
      TS.ui.confirm({ title: 'テロップの削除', message: 'このテロップを削除しますか？元に戻せません。', okLabel: '削除', danger: true })
        .then(function (ok) { if (ok) TS.project.remove(TS.project.index()); });
    });
    ops.appendChild(dupBtn); ops.appendChild(prevBtn); ops.appendChild(nextBtn); ops.appendChild(delBtn);
    var exit = el('button', 'pj-exit'); exit.type = 'button'; exit.textContent = '終了';
    exit.addEventListener('click', function () { TS.project.stop(); });
    head.appendChild(titleWrap); head.appendChild(ops); head.appendChild(exit);
    // 境界での無効化（押せそうで反応しない状態を避ける＝操作性の床）
    function syncOps() {
      var i = TS.project.index(), n = TS.project.count();
      prevBtn.disabled = (i <= 0);
      nextBtn.disabled = (i >= n - 1);
      delBtn.disabled = (n <= 1);
    }
    bar.appendChild(head);

    // フィルムストリップ（横スクロール）
    var strip = el('div', 'pj-strip');
    bar.appendChild(strip);

    var activeThumbBox = null, activeLabel = null;

    function renderStrip() {
      strip.innerHTML = '';
      activeThumbBox = null; activeLabel = null;
      var scenes = TS.project.scenes();
      var idx = TS.project.index();
      count.textContent = '· ' + scenes.length + '件';
      scenes.forEach(function (sc, i) {
        var card = el('button', 'pj-card' + (i === idx ? ' active' : ''));
        card.type = 'button';
        card.setAttribute('aria-label', (i + 1) + '件目を編集');
        card.setAttribute('aria-pressed', i === idx ? 'true' : 'false');
        card.appendChild(el('span', 'pj-card-num', String(i + 1)));
        var thumb = el('div', 'pj-thumb');
        card.appendChild(thumb);
        var lbl = el('span', 'pj-card-text', shortText(sc.text && sc.text.content));
        card.appendChild(lbl);
        card.addEventListener('click', function () { TS.project.select(i); });
        strip.appendChild(card);
        if (i === idx) { activeThumbBox = thumb; activeLabel = lbl; drawThumb(thumb, TS.store.get()); }
        else drawThumb(thumb, sc);
      });
      // 追加カード
      var addCard = el('button', 'pj-card pj-add'); addCard.type = 'button'; addCard.setAttribute('aria-label', 'テロップを追加');
      addCard.innerHTML = TS.ui.icon('plus') + '<span class="pj-add-label">追加</span>';
      addCard.addEventListener('click', function () { TS.project.add(); });
      strip.appendChild(addCard);
    }

    // 編集中テロップのライブ更新（サムネ＋文言）をデバウンス
    var liveTimer = null;
    function refreshActiveLive() {
      if (!TS.project.active() || !activeThumbBox) return;
      drawThumb(activeThumbBox, TS.store.get());
      if (activeLabel) activeLabel.textContent = shortText(TS.store.get().text && TS.store.get().text.content);
    }

    function onProject() {
      if (TS.project.active()) {
        document.body.setAttribute('data-project', '');
        renderStrip();
        syncOps();
      } else {
        document.body.removeAttribute('data-project');
        strip.innerHTML = '';
      }
    }
    TS.project.subscribe(onProject);
    // store変更（編集）で編集中カードをライブ更新（自分のselect起因の全再描画とは別経路）
    TS.store.subscribe(function () {
      if (!TS.project.active()) return;
      if (liveTimer) clearTimeout(liveTimer);
      liveTimer = setTimeout(refreshActiveLive, 250);
    });

    onProject();
    return { el: bar };
  }

  TS.uiProjectBar = { mount: mount };
})();
