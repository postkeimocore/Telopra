'use strict';
// TS.panelText — テキストタブ（契約書§6.12）
// 文言 / フォント選択（検索付き独自ドロップダウン）/ ウェイト / サイズ・字間・行間・斜体角 / ジャンプ率（runs編集）
(function () {
  window.TS = window.TS || {};

  var FALLBACK = "'Hiragino Sans','Noto Sans CJK JP','Yu Gothic',sans-serif";

  // ---- パネル専用スタイル（app.css 未定義のドロップダウン・チップのみ。id付きで冪等注入） ----
  var STYLE_ID = 'tsPanelTextCSS';
  var CSS = [
    '.pt-field{margin-top:16px;}',
    '.pt-label{display:block;font-size:11.5px;color:var(--text-muted);letter-spacing:.03em;margin-bottom:6px;}',
    '.pt-label-row{display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;}',
    '.pt-label-row .pt-label{margin-bottom:0;}',
    '.pt-note{font-size:10.5px;color:var(--text-dim);letter-spacing:.02em;padding:2px 0;}',
    '.pt-hint{font-size:10.5px;color:var(--text-dim);margin:0 0 8px;}',
    '.pt-mini-btn{background:var(--surface);border:1px solid var(--border-soft);color:var(--text-muted);font-size:10px;letter-spacing:.03em;padding:4px 10px;border-radius:var(--radius-pill);transition:all .2s var(--easing);-webkit-tap-highlight-color:transparent;}',
    '.pt-mini-btn:active:not(:disabled){transform:scale(.95);}',
    '.pt-mini-btn:disabled{opacity:.4;}',
    '.pt-skew-reset-row{display:flex;justify-content:flex-end;margin-top:-2px;}',
    /* フォント選択ドロップダウン */
    '.font-select{position:relative;}',
    '.font-select-btn{width:100%;display:flex;align-items:center;justify-content:space-between;gap:8px;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-sm);padding:10px 12px;font-size:15px;color:var(--text);text-align:left;transition:border-color .2s var(--easing);-webkit-tap-highlight-color:transparent;}',
    '.font-select-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
    '.font-select-chev{display:inline-flex;}',
    '.font-select-chev svg{width:16px;height:16px;color:var(--text-muted);transition:transform .25s var(--easing);}',
    '.font-select.open .font-select-btn{border-color:var(--accent-soft);}',
    '.font-select.open .font-select-chev svg{transform:rotate(180deg);}',
    '.font-select-pop{position:absolute;left:0;right:0;top:calc(100% + 6px);z-index:60;background:var(--surface);border:1px solid var(--border-soft);border-radius:var(--radius-md);box-shadow:0 12px 32px rgba(30,30,64,.16);overflow:hidden;}',
    '.font-select-search{padding:8px;border-bottom:1px solid var(--border-soft);}',
    '.font-select-list{max-height:280px;overflow-y:auto;padding:2px 0 8px;overscroll-behavior:contain;}',
    '.font-select-cat{font-size:10px;color:var(--text-dim);letter-spacing:.06em;padding:10px 12px 4px;}',
    '.font-select-item{display:flex;width:100%;align-items:center;justify-content:space-between;gap:8px;background:transparent;border:none;padding:9px 12px;font-size:15px;color:var(--text);text-align:left;-webkit-tap-highlight-color:transparent;}',
    '.font-item-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
    '.font-item-check{display:inline-flex;opacity:0;}',
    '.font-item-check svg{width:14px;height:14px;color:var(--accent);}',
    '.font-select-item.active{background:var(--accent-softer);color:var(--accent);}',
    '.font-select-item.active .font-item-check{opacity:1;}',
    /* ジャンプ率チップ */
    '.jump-chips{display:flex;flex-wrap:wrap;gap:6px;margin:2px 0 4px;}',
    '.jump-break{flex-basis:100%;height:0;}',
    '.jump-chip{position:relative;min-width:36px;height:36px;padding:0 7px;display:inline-flex;align-items:center;justify-content:center;background:var(--surface);border:1px solid var(--border-soft);border-radius:var(--radius-sm);font-size:15px;line-height:1;color:var(--text);transition:all .15s var(--easing);-webkit-tap-highlight-color:transparent;}',
    '.jump-chip::before{content:"";position:absolute;inset:-4px;}', /* 44pxタップ確保 */
    '.jump-chip:active{transform:scale(.94);}',
    '.jump-chip.has-run{border-color:var(--accent-soft);}',
    '.jump-chip.has-run::after{content:attr(data-scale);position:absolute;right:2px;bottom:1px;font-size:7px;color:var(--accent);}',
    '.jump-chip.selected{background:var(--accent-softer);border-color:var(--accent);color:var(--accent);box-shadow:0 1px 2px rgba(52,81,255,.16);}',
    '@media(hover:hover){',
    '.pt-mini-btn:hover:not(:disabled){color:var(--accent);border-color:var(--accent-soft);}',
    '.font-select-btn:hover{border-color:var(--accent-soft);}',
    '.font-select-item:hover:not(.active){background:var(--surface-hover);}',
    '.jump-chip:hover:not(.selected){border-color:var(--accent-soft);}',
    '}',
    '@media(prefers-reduced-motion:reduce){.font-select-chev svg,.jump-chip,.pt-mini-btn,.font-select-btn{transition:none!important;}}'
  ].join('\n');

  function injectCSS() {
    if (document.getElementById(STYLE_ID)) return;
    var st = document.createElement('style');
    st.id = STYLE_ID;
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  // ---- 小ヘルパ ----
  function el(tag, cls) { var e = document.createElement(tag); if (cls) e.className = cls; return e; }
  function btn(cls) { var b = el('button', cls); b.type = 'button'; return b; }
  function findFont(family) {
    for (var i = 0; i < TS.FONTS.length; i++) if (TS.FONTS[i].family === family) return TS.FONTS[i];
    return null;
  }
  function storeScene() {
    var s = (TS.store && TS.store.get) ? TS.store.get() : null;
    return s || TS.scene.create();
  }

  // content と runs から全インデックスの倍率配列（改行も1文字）
  function scaleArr(content, runs) {
    var arr = new Array(content.length);
    for (var i = 0; i < content.length; i++) arr[i] = 1;
    (runs || []).forEach(function (r) {
      if (!r || !Array.isArray(r.range)) return;
      var s = Math.max(0, r.range[0] | 0), e = Math.min(content.length, r.range[1] | 0);
      for (var k = s; k < e; k++) arr[k] = (typeof r.scale === 'number') ? r.scale : 1;
    });
    return arr;
  }
  // 倍率配列 → runs（隣接同倍率マージ・1.0除去）
  function compress(arr) {
    var out = [], i = 0;
    while (i < arr.length) {
      var v = Math.round(arr[i] * 1000) / 1000;
      if (v === 1) { i++; continue; }
      var j = i + 1;
      while (j < arr.length && Math.round(arr[j] * 1000) / 1000 === v) j++;
      out.push({ range: [i, j], scale: v });
      i = j;
    }
    return out;
  }
  // content 変更時に runs を新長に収める（範囲外は除去・はみ出しはクランプ）
  function clampRuns(draft) {
    var len = (draft.text.content || '').length;
    draft.text.runs = (draft.text.runs || [])
      .filter(function (r) { return r && Array.isArray(r.range) && r.range[0] < len; })
      .map(function (r) { return { range: [r.range[0], Math.min(r.range[1], len)], scale: r.scale }; });
  }

  function mount(container) {
    injectCSS();
    var scene0 = storeScene();

    // ---- 変更検知用キャッシュ ----
    var lastContent = scene0.text.content || '';
    var lastRunsJson = JSON.stringify(scene0.text.runs || []);
    var lastFont = scene0.text.font;
    var lastWeight = scene0.text.weight;

    var title = el('h2', 'section-title');
    title.textContent = 'テキスト';
    container.appendChild(title);

    // ================= 文言（IME対応: input=transient / blur・change=commit） =================
    var fld = el('div', 'pt-field');
    var lbl = el('label', 'pt-label');
    lbl.textContent = '文言';
    lbl.htmlFor = 'tsTextContent';
    var ta = el('textarea');
    ta.id = 'tsTextContent';
    ta.rows = 2;
    ta.placeholder = 'テロップの文言（改行で複数行）';
    ta.value = lastContent;
    fld.appendChild(lbl);
    fld.appendChild(ta);
    container.appendChild(fld);

    var composing = false;
    function applyInput() {
      var v = ta.value;
      if (storeScene().text.content === v) return; // compositionend直後のinput二重発火ガード
      TS.store.set(function (d) { d.text.content = v; clampRuns(d); }, { transient: true });
    }
    function finalizeInput() {
      var v = ta.value;
      if (storeScene().text.content !== v) {
        TS.store.set(function (d) { d.text.content = v; clampRuns(d); });
      } else {
        TS.store.commit(); // transient連続入力を1履歴に確定
      }
    }
    ta.addEventListener('compositionstart', function () { composing = true; });
    ta.addEventListener('compositionend', function () { composing = false; applyInput(); });
    ta.addEventListener('input', function () { if (!composing) applyInput(); });
    ta.addEventListener('blur', finalizeInput);
    ta.addEventListener('change', finalizeInput);

    // ================= フォント選択（独自ドロップダウン） =================
    var fontFld = el('div', 'pt-field');
    var fontLbl = el('span', 'pt-label');
    fontLbl.textContent = 'フォント';
    var fontWrap = el('div', 'font-select');
    var fontBtn = btn('font-select-btn');
    fontBtn.setAttribute('aria-haspopup', 'listbox');
    fontBtn.setAttribute('aria-expanded', 'false');
    fontBtn.setAttribute('aria-label', 'フォントを選択');
    var fontName = el('span', 'font-select-name');
    var chev = el('span', 'font-select-chev');
    chev.innerHTML = TS.ui.icon('chevron-down');
    fontBtn.appendChild(fontName);
    fontBtn.appendChild(chev);

    var pop = el('div', 'font-select-pop');
    pop.hidden = true;
    var searchWrap = el('div', 'font-select-search');
    var searchInput = el('input');
    searchInput.type = 'search';
    searchInput.placeholder = 'フォントを検索';
    searchInput.setAttribute('aria-label', 'フォントを検索');
    searchWrap.appendChild(searchInput);
    var listWrap = el('div', 'font-select-list');
    listWrap.setAttribute('role', 'listbox');

    // カテゴリ順（TS.fonts.CATS）に見出し + 各項目を自書体プレビューで並べる
    var fontItems = [];  // { f, el }
    var sections = [];   // { sec, items:[fontItems…] }
    TS.fonts.CATS.forEach(function (cat) {
      var fonts = TS.FONTS.filter(function (f) { return f.cat === cat[0]; });
      if (!fonts.length) return;
      var sec = el('div', 'font-select-sec');
      var head = el('div', 'font-select-cat');
      head.textContent = cat[1];
      sec.appendChild(head);
      var secItems = [];
      fonts.forEach(function (f) {
        var item = btn('font-select-item');
        item.setAttribute('role', 'option');
        var nm = el('span', 'font-item-name');
        nm.textContent = f.label;
        nm.style.fontFamily = '"' + f.family + '", ' + FALLBACK;
        var ck = el('span', 'font-item-check');
        ck.innerHTML = TS.ui.icon('check');
        item.appendChild(nm);
        item.appendChild(ck);
        item.addEventListener('click', function () { chooseFont(f); });
        sec.appendChild(item);
        var rec = { f: f, el: item };
        fontItems.push(rec);
        secItems.push(rec);
      });
      listWrap.appendChild(sec);
      sections.push({ sec: sec, items: secItems });
    });

    pop.appendChild(searchWrap);
    pop.appendChild(listWrap);
    fontWrap.appendChild(fontBtn);
    fontWrap.appendChild(pop);
    fontFld.appendChild(fontLbl);
    fontFld.appendChild(fontWrap);
    container.appendChild(fontFld);

    function runFilter() {
      var q = searchInput.value.trim().toLowerCase();
      sections.forEach(function (s) {
        var any = false;
        s.items.forEach(function (it) {
          var hit = !q ||
            it.f.label.toLowerCase().indexOf(q) >= 0 ||
            it.f.family.toLowerCase().indexOf(q) >= 0;
          it.el.style.display = hit ? '' : 'none';
          if (hit) any = true;
        });
        s.sec.style.display = any ? '' : 'none';
      });
    }
    searchInput.addEventListener('input', runFilter);
    searchInput.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.stopPropagation(); closePop(); fontBtn.focus(); }
    });

    function onDocDown(e) {
      if (!(e.target instanceof Node) || !fontWrap.contains(e.target)) closePop();
    }
    function onDocKey(e) {
      if (e.key === 'Escape') { e.stopPropagation(); closePop(); fontBtn.focus(); }
    }
    function openPop() {
      if (!pop.hidden) return;
      pop.hidden = false;
      fontWrap.classList.add('open');
      fontBtn.setAttribute('aria-expanded', 'true');
      searchInput.value = '';
      runFilter();
      document.addEventListener('pointerdown', onDocDown, true);
      document.addEventListener('keydown', onDocKey, true);
      var act = listWrap.querySelector('.font-select-item.active');
      if (act && act.scrollIntoView) act.scrollIntoView({ block: 'nearest' });
      // タッチ端末ではキーボードが開かないよう focus はポインタ機器のみ
      if (window.matchMedia && window.matchMedia('(hover: hover)').matches) searchInput.focus();
    }
    function closePop() {
      if (pop.hidden) return;
      pop.hidden = true;
      fontWrap.classList.remove('open');
      fontBtn.setAttribute('aria-expanded', 'false');
      document.removeEventListener('pointerdown', onDocDown, true);
      document.removeEventListener('keydown', onDocKey, true);
    }
    fontBtn.addEventListener('click', function () { if (pop.hidden) openPop(); else closePop(); });

    function chooseFont(f) {
      closePop();
      var w = TS.fonts.nearestWeight(f.family, storeScene().text.weight);
      // ロード完了後に反映（計測がフォールバック字形にならないよう ensure を待つ。失敗時も適用）
      TS.fonts.ensure(f.family, w).catch(function () {}).then(function () {
        TS.store.set(function (d) { d.text.font = f.family; d.text.weight = w; });
      });
    }
    function syncFontUI() {
      var fam = storeScene().text.font;
      fontName.textContent = fam;
      fontName.style.fontFamily = '"' + fam + '", ' + FALLBACK;
      fontItems.forEach(function (it) {
        var on = it.f.family === fam;
        it.el.classList.toggle('active', on);
        it.el.setAttribute('aria-selected', on ? 'true' : 'false');
      });
    }

    // ================= ウェイト（選択フォントの weights から動的生成） =================
    var weightFld = el('div', 'pt-field');
    var weightLbl = el('span', 'pt-label');
    weightLbl.textContent = 'ウェイト';
    var weightWrap = el('div');
    weightFld.appendChild(weightLbl);
    weightFld.appendChild(weightWrap);
    container.appendChild(weightFld);

    // スライダー式（P3レビュー反映）。フォントが持つウェイトへスナップし、表示は数値
    function renderWeight() {
      weightWrap.textContent = '';
      var t = storeScene().text;
      var f = findFont(t.font);
      var weights = (f && f.weights) ? f.weights : [t.weight];
      if (weights.length <= 1) {
        var note = el('div', 'pt-note');
        note.textContent = 'このフォントは単一ウェイト（' + weights[0] + '）';
        weightWrap.appendChild(note);
        return;
      }
      function snap(v) {
        var best = weights[0];
        weights.forEach(function (w) { if (Math.abs(w - v) < Math.abs(best - v)) best = w; });
        return best;
      }
      var pendingW = TS.fonts.nearestWeight(t.font, t.weight);
      var row = TS.ui.sliderRow({
        label: '太さ',
        min: weights[0], max: weights[weights.length - 1], step: 5,
        value: pendingW,
        format: function (v) { return String(snap(v)); },
        onInput: function (v) {
          var w = snap(v);
          if (w === pendingW) return;
          pendingW = w;
          // ドラッグ中も即プレビュー（フォントは読み込み済みが多いのでtransient反映）
          TS.store.set(function (d) { d.text.weight = w; }, { transient: true });
        },
        onCommit: function (v) {
          var w = snap(v);
          pendingW = w;
          var fam = storeScene().text.font;
          TS.fonts.ensure(fam, w).catch(function () {}).then(function () {
            TS.store.set(function (d) { d.text.weight = w; });
            TS.store.commit();
          });
        }
      });
      weightWrap.appendChild(row);
      var hint = el('div', 'pt-note');
      hint.textContent = '利用可: ' + weights.join(' / ');
      weightWrap.appendChild(hint);
    }

    // ================= サイズ / 字間 / 行間 / 斜体角 =================
    var sliderDefs = [];
    function makeSlider(def) {
      def.row = TS.ui.sliderRow({
        icon: def.icon, label: def.label,
        min: def.min, max: def.max, step: def.step,
        value: def.get(scene0), format: def.fmt, unit: def.unit,
        onInput: function (v) { TS.store.set(function (d) { def.set(d, v); }, { transient: true }); },
        onCommit: function (v) { TS.store.set(function (d) { def.set(d, v); }); }
      });
      sliderDefs.push(def);
      return def.row;
    }
    function syncSliders(scene) {
      sliderDefs.forEach(function (d) {
        var v = d.get(scene);
        var range = d.row.querySelector('input[type="range"]');
        if (!range || parseFloat(range.value) === v) return;
        range.value = String(v);
        var val = d.row.querySelector('.slider-value');
        if (val) val.textContent = d.fmt(v) + d.unit;
      });
    }

    var slidersFld = el('div', 'pt-field');
    slidersFld.appendChild(makeSlider({
      icon: 'type', label: 'サイズ', min: 24, max: 400, step: 1, unit: 'px',
      fmt: String,
      get: function (s) { return s.text.size; },
      set: function (d, v) { d.text.size = v; }
    }));
    slidersFld.appendChild(makeSlider({
      icon: 'text-cursor', label: '字間', min: -0.05, max: 0.30, step: 0.005, unit: '',
      fmt: function (v) { return v.toFixed(3); },
      get: function (s) { return s.text.letterSpacing; },
      set: function (d, v) { d.text.letterSpacing = v; }
    }));
    slidersFld.appendChild(makeSlider({
      icon: 'layers', label: '行間', min: 0.8, max: 2.0, step: 0.05, unit: '',
      fmt: function (v) { return v.toFixed(2); },
      get: function (s) { return s.text.lineHeight; },
      set: function (d, v) { d.text.lineHeight = v; }
    }));
    var skewDef = {
      icon: 'sliders', label: '斜体角', min: -20, max: 20, step: 1, unit: '°',
      fmt: String,
      get: function (s) { return s.text.italicSkew; },
      set: function (d, v) { d.text.italicSkew = v; }
    };
    slidersFld.appendChild(makeSlider(skewDef));
    // 斜体角の0リセット（rangeにinput/changeを発火させ通常経路で1履歴commit）
    var resetRow = el('div', 'pt-skew-reset-row');
    var resetBtn = btn('pt-mini-btn');
    resetBtn.textContent = '0°リセット';
    resetBtn.addEventListener('click', function () {
      var range = skewDef.row.querySelector('input[type="range"]');
      if (!range) return;
      if (parseFloat(range.value) === 0 && (storeScene().text.italicSkew || 0) === 0) return;
      range.value = '0';
      range.dispatchEvent(new Event('input'));
      range.dispatchEvent(new Event('change'));
    });
    resetRow.appendChild(resetBtn);
    slidersFld.appendChild(resetRow);
    container.appendChild(slidersFld);

    // ================= ジャンプ率（文字チップ複数選択 → 倍率 → runs生成） =================
    var jumpFld = el('div', 'pt-field');
    var jumpHead = el('div', 'pt-label-row');
    var jumpLbl = el('span', 'pt-label');
    jumpLbl.textContent = 'ジャンプ率';
    var clearBtn = btn('pt-mini-btn');
    clearBtn.textContent = 'すべて解除';
    jumpHead.appendChild(jumpLbl);
    jumpHead.appendChild(clearBtn);
    var jumpHint = el('div', 'pt-hint');
    jumpHint.textContent = '文字をタップして選択 → 倍率スライダーで調整';
    var chipsWrap = el('div', 'jump-chips');

    var selection = new Set();   // 選択中チップの開始インデックス（UIローカル）
    var chipRanges = {};         // 開始 → 終了（サロゲートペアは2文字で1チップ）

    var jumpRow = TS.ui.sliderRow({
      icon: 'zap', label: '倍率', min: 0.4, max: 1.5, step: 0.05, value: 1, unit: '',
      format: function (v) { return '×' + v.toFixed(2); },
      onInput: function (v) { applyScale(v, true); },
      onCommit: function (v) { applyScale(v, false); }
    });

    jumpFld.appendChild(jumpHead);
    jumpFld.appendChild(jumpHint);
    jumpFld.appendChild(chipsWrap);
    jumpFld.appendChild(jumpRow);
    container.appendChild(jumpFld);

    function selectionScale() {
      var t = storeScene().text;
      var arr = scaleArr(t.content || '', t.runs);
      var v = null, mixed = false;
      selection.forEach(function (s) {
        var x = (s < arr.length) ? Math.round(arr[s] * 1000) / 1000 : 1;
        if (v === null) v = x;
        else if (x !== v) mixed = true;
      });
      return (v === null || mixed) ? null : v;
    }
    function updateJumpUI() {
      var range = jumpRow.querySelector('input[type="range"]');
      if (range) range.disabled = selection.size === 0;
      var v = selectionScale();
      if (v != null && range && parseFloat(range.value) !== v) {
        range.value = String(v);
        var val = jumpRow.querySelector('.slider-value');
        if (val) val.textContent = '×' + v.toFixed(2);
      }
      clearBtn.disabled = ((storeScene().text.runs || []).length === 0) && selection.size === 0;
    }
    function onChipClick(ev) {
      var b = ev.currentTarget;
      var s = parseInt(b.dataset.s, 10);
      if (selection.has(s)) {
        selection.delete(s);
        b.classList.remove('selected');
        b.setAttribute('aria-pressed', 'false');
      } else {
        selection.add(s);
        b.classList.add('selected');
        b.setAttribute('aria-pressed', 'true');
      }
      updateJumpUI();
    }
    function renderChips() {
      var t = storeScene().text;
      var content = t.content || '';
      var arr = scaleArr(content, t.runs);
      chipsWrap.textContent = '';
      chipRanges = {};
      if (!content.replace(/\n/g, '')) {
        selection.clear();
        var none = el('div', 'pt-note');
        none.textContent = '文言を入力すると文字チップが表示されます';
        chipsWrap.appendChild(none);
        return;
      }
      var keep = new Set();
      var i = 0;
      while (i < content.length) {
        var ch = content.charAt(i);
        if (ch === '\n') { chipsWrap.appendChild(el('span', 'jump-break')); i++; continue; }
        var e = i + 1;
        var cc = content.charCodeAt(i);
        if (cc >= 0xD800 && cc <= 0xDBFF && i + 1 < content.length) e = i + 2; // サロゲートペア
        var text = content.slice(i, e);
        var b = btn('jump-chip');
        b.textContent = (text === ' ' || text === '　') ? '␣' : text;
        b.dataset.s = String(i);
        chipRanges[i] = e;
        var sc = Math.round(arr[i] * 1000) / 1000;
        if (sc !== 1) { b.classList.add('has-run'); b.dataset.scale = '×' + sc; }
        var on = selection.has(i);
        if (on) { b.classList.add('selected'); keep.add(i); }
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
        b.addEventListener('click', onChipClick);
        chipsWrap.appendChild(b);
        i = e;
      }
      selection = keep;
    }
    function applyScale(v, transient) {
      if (selection.size === 0) return;
      var sel = [];
      selection.forEach(function (s) { sel.push(s); });
      TS.store.set(function (d) {
        var content = d.text.content || '';
        var arr = scaleArr(content, d.text.runs);
        sel.forEach(function (s) {
          var e = chipRanges[s] || (s + 1);
          for (var k = s; k < e && k < content.length; k++) arr[k] = v;
        });
        d.text.runs = compress(arr);
      }, { transient: !!transient });
    }
    clearBtn.addEventListener('click', function () {
      selection.clear();
      if ((storeScene().text.runs || []).length) {
        TS.store.set(function (d) { d.text.runs = []; });  // Undo可
      } else {
        renderChips();
        updateJumpUI();
      }
    });

    // ================= store購読（外部変更＝Undo/Redo/プリセット適用にも追随） =================
    function sync(scene, meta) {
      var transient = !!(meta && meta.transient);
      var t = scene.text;
      if (t.content !== lastContent) {
        lastContent = t.content;
        lastRunsJson = JSON.stringify(t.runs || []);
        if (!composing && ta.value !== t.content) ta.value = t.content;
        selection.clear();
        renderChips();
        updateJumpUI();
      } else {
        var rj = JSON.stringify(t.runs || []);
        if (rj !== lastRunsJson) {
          lastRunsJson = rj;
          renderChips();
          updateJumpUI();
        }
      }
      if (t.font !== lastFont || t.weight !== lastWeight) {
        lastFont = t.font;
        lastWeight = t.weight;
        syncFontUI();
        renderWeight();
      }
      if (!transient) syncSliders(scene); // 自分のドラッグ中はrangeを触らない
    }
    if (TS.store && TS.store.subscribe) TS.store.subscribe(sync);

    // ---- 初期描画 ----
    syncFontUI();
    renderWeight();
    renderChips();
    updateJumpUI();

    return { el: container };
  }

  TS.panelText = { mount: mount };
})();
