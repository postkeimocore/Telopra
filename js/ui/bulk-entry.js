'use strict';
/* TS.uiBulk — 「まとめて作る」入口の分岐（IA_fix §2/§3）
   制作の入口（書き出しとは別）。複数テロップを作る方法を選ばせる:
   ・文言を手入力（1行=1テロップ）→ 現在の見た目を引き継いだプロジェクトを開始
   ・台本から（AIが割り当て）→ 既存 TS.uiScript（プロンプト生成→JSON貼り戻し→バリデーション）
   どちらも TS.project.startFromItems() に合流し、以後は各テロップを制作UIでフル編集する。 */
(function () {
  window.TS = window.TS || {};

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function btn(cls, label) { var b = el('button', cls); b.type = 'button'; if (label != null) b.textContent = label; return b; }

  function mount() {
    var modal = null;

    function close() {
      if (modal && modal.parentNode) modal.parentNode.removeChild(modal);
      modal = null;
      document.removeEventListener('keydown', onKey, true);
    }
    function onKey(e) { if (e.key === 'Escape') { e.stopPropagation(); close(); } }

    function open() {
      if (modal) close();
      modal = el('div', 'app-modal export-modal');
      modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-modal', 'true');
      var backdrop = el('div', 'app-modal-backdrop'); backdrop.addEventListener('click', close);
      var content = el('div', 'app-modal-content export-modal-content');
      var head = el('div', 'app-modal-head');
      head.appendChild(el('h3', 'app-modal-title', 'まとめて作る'));
      var x = btn('app-modal-close'); x.innerHTML = TS.ui.icon('x'); x.setAttribute('aria-label', '閉じる');
      x.addEventListener('click', close); head.appendChild(x);
      var body = el('div', 'app-modal-body export-body');
      content.appendChild(head); content.appendChild(body);
      modal.appendChild(backdrop); modal.appendChild(content);
      document.body.appendChild(modal);
      document.addEventListener('keydown', onKey, true);
      renderChoose(body);
    }

    function renderChoose(body) {
      body.innerHTML = '';
      body.appendChild(el('div', 'export-info-note', '複数のテロップをまとめて作ります。作り方を選んでください（このあと各テロップを1つずつフル編集できます）。'));

      var opts = el('div', 'export-usecases');
      // 台本から（AIが割り当て）
      var a = btn('export-usecase');
      var aic = el('span', 'export-usecase-ic'); aic.innerHTML = TS.ui.icon('file-text'); a.appendChild(aic);
      var at = el('div', 'export-usecase-tx');
      at.appendChild(el('div', 'export-usecase-label', '台本から（AIが割り当て）'));
      at.appendChild(el('div', 'export-usecase-note', '台本を貼ると、字幕に分割してデザイン/モーションの叩き台を割り当て'));
      a.appendChild(at);
      a.addEventListener('click', function () { close(); TS.uiScript.open(); });
      opts.appendChild(a);
      // 文言を手入力
      var b = btn('export-usecase');
      var bic = el('span', 'export-usecase-ic'); bic.innerHTML = TS.ui.icon('edit-3'); b.appendChild(bic);
      var bt = el('div', 'export-usecase-tx');
      bt.appendChild(el('div', 'export-usecase-label', '文言を手入力'));
      bt.appendChild(el('div', 'export-usecase-note', '1行＝1テロップ。今の見た目を引き継いで、各テロップを個別に編集'));
      b.appendChild(bt);
      b.addEventListener('click', function () { renderManual(body); });
      opts.appendChild(b);
      body.appendChild(opts);
    }

    function renderManual(body) {
      body.innerHTML = '';
      var back = btn('export-link', '← 戻る');
      back.addEventListener('click', function () { renderChoose(body); });
      body.appendChild(back);
      body.appendChild(el('div', 'export-section-label', '文言（1行＝1テロップ・貼り付けOK）'));
      var ta = document.createElement('textarea'); ta.className = 'export-textarea'; ta.rows = 6;
      ta.placeholder = '例）\n速報！\nついに解禁\n今すぐチェック';
      body.appendChild(ta);
      var actions = el('div', 'export-actions');
      var go = btn('export-run', 'この文言で作る');
      go.addEventListener('click', function () {
        var lines = ta.value.split('\n').map(function (s) { return s.trim(); }).filter(function (s) { return s.length; });
        if (!lines.length) { ta.focus(); return; }
        var items = lines.map(function (t) { return { text: t }; });
        close();
        TS.project.startFromItems(items);
      });
      actions.appendChild(go);
      body.appendChild(actions);
      ta.focus();
    }

    return { open: open, close: close };
  }

  TS.uiBulk = mount();
})();
