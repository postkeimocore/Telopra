'use strict';
/* TS.uiScript — AI台本連携（§6・コピペ方式・API不使用＝クレジット消費ゼロ）
   台本ペースト → ツールがプロンプト自動生成（実在プリセットIDを埋め込む）→ コピー
   → ユーザーが自分のClaude/GPTに貼る → AIがJSON配列を返す → ツールに貼り戻し
   → バリデーション（不正ID→最寄り/既定へフォールバック＋警告）→ 一覧プレビュー → §2バッチへ。 */
(function () {
  window.TS = window.TS || {};

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function btn(cls, label) { var b = el('button', cls); b.type = 'button'; if (label != null) b.textContent = label; return b; }

  function designList() { return (TS.PRESETS || []).map(function (p) { return { id: p.id, name: p.name, cat: p.cat }; }); }
  function motionList() { return (TS.MOTION_PRESETS || []).map(function (p) { return { id: p.id, name: p.name, cat: p.cat, desc: p.desc }; }); }
  function catName(key) { var c = (TS.PRESET_CATS || []).filter(function (x) { return x[0] === key; })[0]; return c ? c[1] : key; }

  // ---- プロンプト生成（実在ID一覧を動的に埋め込む） ----
  function buildPrompt(script) {
    var d = designList(), m = motionList();
    var L = [];
    L.push('あなたはプロのテロップ演出家です。以下の台本を、意味の区切りで短い字幕（テロップ）に分割し、');
    L.push('各字幕に「デザイン」と「モーション」を割り当ててください。');
    L.push('');
    L.push('【割り当ての方針】');
    L.push('・台本の感情フローに沿う（盛り上がり＝メタル/ネオン＋強調系、静かな所＝カラー＋控えめ）。');
    L.push('・色は感情に合わせる（激熱＝金・赤、共感＝白・淡色）。');
    L.push('・全編ギラギラにせず緩急をつける（金や派手な演出は権威づけ・CTAなど要所だけ。連発しない）。');
    L.push('・動きは候補として妥当なものを選ぶ（細部は人がプレビューで調整します）。');
    L.push('');
    L.push('【出力フォーマット】JSONの配列のみを出力（前後に説明文・コードフェンスを付けない）。');
    L.push('各要素: {"text":"字幕文", "design":"デザインID", "motion":"モーションID", "tempo":"fast|normal|slow", "emphasis":"強|中|弱"}');
    L.push('・design は下の「デザインID一覧」の id のいずれか。motion は「モーションID一覧」の id のいずれか。実在するidだけを使うこと。');
    L.push('');
    L.push('【デザインID一覧】（id ｜ 名前 ｜ カテゴリ）');
    d.forEach(function (x) { L.push(x.id + ' ｜ ' + x.name + ' ｜ ' + catName(x.cat)); });
    L.push('');
    L.push('【モーションID一覧】（id ｜ 名前 ｜ カテゴリ ｜ 説明）');
    m.forEach(function (x) { L.push(x.id + ' ｜ ' + x.name + ' ｜ ' + x.cat + ' ｜ ' + (x.desc || '')); });
    L.push('');
    L.push('【台本】');
    L.push(script || '');
    return L.join('\n');
  }

  // ---- 取り込み・バリデーション ----
  function parseAndValidate(raw) {
    var text = String(raw || '').trim();
    // コードフェンスや前後の文章を許容: 最初の [ 〜 最後の ] を抜き出す
    var s = text.indexOf('['), e = text.lastIndexOf(']');
    if (s >= 0 && e > s) text = text.slice(s, e + 1);
    var arr;
    try { arr = JSON.parse(text); } catch (err) { return { error: 'JSONの解析に失敗しました。AIの出力からJSON配列部分（[ ... ]）だけを貼ってください。' }; }
    if (!Array.isArray(arr)) return { error: 'JSONが配列ではありません。' };
    var designIds = {}, motionIds = {};
    (TS.PRESETS || []).forEach(function (p) { designIds[p.id] = p; });
    (TS.MOTION_PRESETS || []).forEach(function (p) { motionIds[p.id] = p; });
    var defDesign = (TS.PRESETS && TS.PRESETS[0]) ? TS.PRESETS[0].id : '';
    var defMotion = motionIds['mp_classic'] ? 'mp_classic' : ((TS.MOTION_PRESETS && TS.MOTION_PRESETS[0]) ? TS.MOTION_PRESETS[0].id : '');
    var warns = [];
    var items = arr.map(function (o, i) {
      o = o || {};
      var text2 = String(o.text == null ? '' : o.text);
      var design = o.design;
      if (!designIds[design]) { warns.push((i + 1) + '件目: デザイン「' + design + '」は無いので既定にしました'); design = nearest(designIds, o.design, o.emphasis) || defDesign; }
      var motion = o.motion;
      if (!motionIds[motion]) { warns.push((i + 1) + '件目: モーション「' + motion + '」は無いので既定にしました'); motion = defMotion; }
      var tempo = /^(fast|normal|slow)$/.test(o.tempo) ? o.tempo : 'normal';
      var emphasis = /^(強|中|弱)$/.test(o.emphasis) ? o.emphasis : '中';
      return { text: text2, designId: design, motionId: motion, tempo: tempo, emphasis: emphasis, resKey: 'v916' };
    }).filter(function (it) { return it.text.length; });
    return { items: items, warns: warns };
  }
  // 最寄りデザイン（cat一致 or name部分一致）。無ければ null。
  function nearest(designIds, wanted, emphasis) {
    if (!wanted) return null;
    var keys = Object.keys(designIds);
    for (var i = 0; i < keys.length; i++) {
      var p = designIds[keys[i]];
      if (p.cat === wanted || (p.name && String(wanted).indexOf(p.name) >= 0)) return p.id;
    }
    return null;
  }

  function designSelect(value) {
    var sel = el('select', 'batch-select');
    (TS.PRESET_CATS || []).forEach(function (c) {
      var og = document.createElement('optgroup'); og.label = c[1];
      (TS.PRESETS || []).filter(function (p) { return p.cat === c[0]; }).forEach(function (p) {
        var o = document.createElement('option'); o.value = p.id; o.textContent = p.name; og.appendChild(o);
      });
      if (og.childNodes.length) sel.appendChild(og);
    });
    if (value) sel.value = value; return sel;
  }
  function motionSelect(value) {
    var sel = el('select', 'batch-select');
    (TS.MOTION_PRESET_CATS || []).forEach(function (cat) {
      var og = document.createElement('optgroup'); og.label = cat;
      (TS.MOTION_PRESETS || []).filter(function (p) { return p.cat === cat; }).forEach(function (p) {
        var o = document.createElement('option'); o.value = p.id; o.textContent = p.name; og.appendChild(o);
      });
      if (og.childNodes.length) sel.appendChild(og);
    });
    if (value) sel.value = value; return sel;
  }

  function copyText(text, okBtn) {
    (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject())
      .then(function () { okBtn.textContent = 'コピーしました'; })
      .catch(function () {
        var ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select();
        try { document.execCommand('copy'); okBtn.textContent = 'コピーしました'; } catch (e) { okBtn.textContent = 'コピー失敗（手動で選択してください）'; }
        ta.remove();
      });
  }

  function mount() {
    var modal = null, items = null;

    function close() {
      if (modal && modal.parentNode) modal.parentNode.removeChild(modal);
      modal = null;
      document.removeEventListener('keydown', onKey, true);
    }
    function onKey(e) { if (e.key === 'Escape') { e.stopPropagation(); close(); } }

    function open() {
      if (modal) close();
      items = null;
      modal = el('div', 'app-modal export-modal');
      modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-modal', 'true');
      var backdrop = el('div', 'app-modal-backdrop'); backdrop.addEventListener('click', close);
      var content = el('div', 'app-modal-content export-modal-content');
      var head = el('div', 'app-modal-head');
      head.appendChild(el('h3', 'app-modal-title', 'AIで台本からまとめて作る'));
      var x = btn('app-modal-close'); x.innerHTML = TS.ui.icon('x'); x.setAttribute('aria-label', '閉じる');
      x.addEventListener('click', close); head.appendChild(x);
      var body = el('div', 'app-modal-body export-body');
      content.appendChild(head); content.appendChild(body);
      modal.appendChild(backdrop); modal.appendChild(content);
      document.body.appendChild(modal);
      document.addEventListener('keydown', onKey, true);
      renderInput(body);
    }

    // STEP1/2: 台本→プロンプト生成→コピー → 貼り戻し→取り込み
    function renderInput(body) {
      body.innerHTML = '';
      body.appendChild(el('div', 'export-info-note',
        'API不使用・完全無料。①台本を貼る→②プロンプトをコピー→③自分のClaude/ChatGPTに貼る→④返ってきたJSONを下に貼り戻す。'));

      body.appendChild(el('div', 'export-section-label', '① 台本を貼り付け'));
      var scriptTa = document.createElement('textarea'); scriptTa.className = 'export-textarea'; scriptTa.rows = 5;
      scriptTa.placeholder = '動画の台本・ナレーション・伝えたいことを貼り付け';
      body.appendChild(scriptTa);

      var genRow = el('div', 'export-actions');
      var genBtn = btn('app-modal-btn app-modal-btn-primary', '② プロンプトを生成してコピー');
      genRow.appendChild(genBtn);
      body.appendChild(genRow);

      var promptWrap = el('div', 'script-prompt-wrap');
      promptWrap.style.display = 'none';
      var promptTa = document.createElement('textarea'); promptTa.className = 'export-textarea'; promptTa.rows = 6; promptTa.readOnly = true;
      var copyBtn = btn('app-modal-btn app-modal-btn-secondary', 'もう一度コピー');
      promptWrap.appendChild(el('div', 'export-section-label', 'このプロンプトをコピーして、自分のAIに貼ってください'));
      promptWrap.appendChild(promptTa);
      var copyRow = el('div', 'export-actions'); copyRow.appendChild(copyBtn); promptWrap.appendChild(copyRow);
      body.appendChild(promptWrap);

      genBtn.addEventListener('click', function () {
        var p = buildPrompt(scriptTa.value);
        promptTa.value = p;
        promptWrap.style.display = '';
        copyText(p, genBtn);
      });
      copyBtn.addEventListener('click', function () { copyText(promptTa.value, copyBtn); });

      body.appendChild(el('div', 'export-section-label', '③ AIが返したJSONを貼り戻し'));
      var pasteTa = document.createElement('textarea'); pasteTa.className = 'export-textarea'; pasteTa.rows = 5;
      pasteTa.placeholder = '[ { "text": "...", "design": "...", "motion": "...", "tempo": "...", "emphasis": "..." }, ... ]';
      body.appendChild(pasteTa);
      var takeRow = el('div', 'export-actions');
      var takeBtn = btn('export-run', '④ 取り込む');
      takeRow.appendChild(takeBtn); body.appendChild(takeRow);
      var errBox = el('div', 'script-err'); errBox.style.display = 'none'; body.appendChild(errBox);

      takeBtn.addEventListener('click', function () {
        var res = parseAndValidate(pasteTa.value);
        if (res.error) { errBox.style.display = ''; errBox.textContent = res.error; return; }
        if (!res.items.length) { errBox.style.display = ''; errBox.textContent = '取り込める字幕がありませんでした。'; return; }
        items = res.items;
        renderReview(body, res.warns);
      });
    }

    // STEP3: 一覧プレビュー＋警告＋個別調整 → STEP4 バッチへ
    function renderReview(body, warns) {
      body.innerHTML = '';
      body.appendChild(el('div', 'export-section-label', '取り込み結果（' + items.length + '件）'));
      if (warns && warns.length) {
        var w = el('div', 'script-warns');
        w.appendChild(el('div', 'script-warns-title', '⚠️ 一部は既定に置き換えました'));
        warns.forEach(function (t) { w.appendChild(el('div', 'script-warn', t)); });
        body.appendChild(w);
      }
      var list = el('div', 'batch-list');
      items.forEach(function (item, idx) {
        var row = el('div', 'batch-row');
        var thumbBox = el('div', 'batch-thumb'); row.appendChild(thumbBox);
        var cfg = el('div', 'batch-cfg');
        cfg.appendChild(el('div', 'script-item-text', item.text));
        var meta = el('div', 'script-item-meta', 'テンポ:' + item.tempo + ' / 強調:' + item.emphasis);
        cfg.appendChild(meta);
        var sels = el('div', 'batch-sels');
        var ds = designSelect(item.designId); ds.addEventListener('change', function () { item.designId = ds.value; drawThumb(thumbBox, item); });
        var ms = motionSelect(item.motionId); ms.addEventListener('change', function () { item.motionId = ms.value; drawThumb(thumbBox, item); });
        sels.appendChild(ds); sels.appendChild(ms); cfg.appendChild(sels);
        row.appendChild(cfg);
        list.appendChild(row);
        // list を body へ挿入した後に描画（未挿入だと getBoundingClientRect が 0×0 になりfitが効かない）
        requestAnimationFrame(function () { drawThumb(thumbBox, item); });
      });
      body.appendChild(list);

      var actions = el('div', 'export-actions');
      var back = btn('app-modal-btn app-modal-btn-secondary', '← 戻る');
      back.addEventListener('click', function () { renderInput(body); });
      var go = btn('export-run', 'この内容で作る →');   // 叩き台として割り当て → 各テロップをフル編集
      go.addEventListener('click', function () {
        close();
        TS.project.startFromItems(items);   // 以後は制作UIで各テロップをフル編集（IA_fix §3）
      });
      actions.appendChild(back); actions.appendChild(go);
      body.appendChild(actions);
    }

    function drawThumb(box, item) {
      try {
        var base = TS.scene.clone(TS.store.get());
        base.text.content = item.text; base.text.runs = [];
        var p = (TS.PRESETS || []).filter(function (x) { return x.id === item.designId; })[0];
        if (p) { base.layers = TS.scene.clone(p.layers || []); base.shadows = TS.scene.clone(p.shadows || []); }
        var mp = (TS.MOTION_PRESETS || []).filter(function (x) { return x.id === item.motionId; })[0];
        if (mp && mp.motion) base.motion = TS.scene.clone(mp.motion);
        base.transform = { x: 0, y: 0, scale: 1, rotate: 0 };
        var scene = TS.scene.normalize(base);
        box.innerHTML = '';
        var inner = el('div'); inner.style.cssText = 'position:absolute;left:50%;top:50%;';
        box.appendChild(inner);
        var h = TS.renderDOM.mount(inner); h.update(scene);
        var L = TS.layout.measure(scene); var bw = L.block.w || 1, bh = L.block.h || 1;
        var r = box.getBoundingClientRect();
        var fit = Math.min((r.width - 8) / bw, (r.height - 8) / bh); if (!(fit > 0) || !isFinite(fit)) fit = 0.05;
        inner.style.transform = 'translate(-50%,-50%) scale(' + fit + ')';
        h.setTime(TS.motion.timeline(scene).D * 0.35);
      } catch (e) { /* noop */ }
    }

    return { open: open, close: close };
  }

  TS.uiScript = mount();
})();
