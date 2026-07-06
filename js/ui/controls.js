'use strict';
// TS.ui — 汎用コントロール部品（契約書 §6.10）
// クラス名は app.css（シェル担当）が同名で定義する。markup契約を厳守。
window.TS = window.TS || {};

(function () {

  // ---- 内部ヘルパ ----------------------------------------------------------

  function el(tag, cls) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    return e;
  }
  function btn(cls) {
    var b = el('button', cls);
    b.type = 'button';
    return b;
  }
  function clamp(v, min, max) {
    return Math.min(max, Math.max(min, v));
  }
  // step の小数桁数（表示の浮動小数ゴミ除去用）
  function stepDecimals(step) {
    var s = String(step);
    var i = s.indexOf('.');
    return i < 0 ? 0 : s.length - i - 1;
  }
  // '#rrggbb' へ正規化（6桁hexのみ許可、不正は null）
  function normalizeHex(s) {
    if (typeof s !== 'string') return null;
    s = s.trim();
    if (s.charAt(0) === '#') s = s.slice(1);
    if (!/^[0-9a-fA-F]{6}$/.test(s)) return null;
    return '#' + s.toLowerCase();
  }

  // ---- icon(name) ----------------------------------------------------------
  // Feather風 24viewBox 線画。stroke=currentColor / 1.8 / round。
  var ICON_PATHS = {
    'type': '<polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/>',
    'palette': '<path d="M12 3a9 9 0 1 0 0 18c1 0 1.8-.8 1.8-1.8 0-.45-.17-.86-.45-1.17-.28-.31-.45-.72-.45-1.17 0-1 .8-1.81 1.8-1.81h2.15A4.15 4.15 0 0 0 21 10.9C21 6.53 16.97 3 12 3z"/><circle cx="7.5" cy="10.5" r="1"/><circle cx="12" cy="7.5" r="1"/><circle cx="16.5" cy="10.5" r="1"/>',
    'grid': '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>',
    'play': '<polygon points="6 4 20 12 6 20 6 4"/>',
    'star': '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
    'chevron-down': '<polyline points="6 9 12 15 18 9"/>',
    'eye': '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
    'eye-off': '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>',
    'arrow-up': '<line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/>',
    'arrow-down': '<line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/>',
    'copy': '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    'trash': '<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>',
    'plus': '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
    'undo': '<polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>',
    'redo': '<polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>',
    'x': '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
    'check': '<polyline points="20 6 9 17 4 12"/>',
    'image': '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>',
    'sliders': '<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>',
    'layers': '<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>',
    'sun': '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>',
    'droplet': '<path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/>',
    'box': '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>',
    'zap': '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
    'text-cursor': '<path d="M17 22h-1a4 4 0 0 1-4-4V6a4 4 0 0 1 4-4h1"/><path d="M7 22h1a4 4 0 0 0 4-4v-1"/><path d="M7 2h1a4 4 0 0 1 4 4v1"/>',
    'search': '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>'
  };

  function icon(name) {
    var body = ICON_PATHS[name];
    if (!body) return '';
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" ' +
      'stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" ' +
      'aria-hidden="true">' + body + '</svg>';
  }

  // アイコン名 or SVG文字列 → SVG要素（class付与）。無効なら null
  function svgFromIcon(nameOrSvg, cls) {
    var html = (typeof nameOrSvg === 'string' && nameOrSvg.indexOf('<svg') === 0)
      ? nameOrSvg : icon(nameOrSvg);
    if (!html) return null;
    var tmp = el('div');
    tmp.innerHTML = html;
    var svg = tmp.firstElementChild;
    if (svg && cls) svg.classList.add(cls);
    return svg;
  }

  // ---- sliderRow -----------------------------------------------------------
  // grid行 [icon|label|range|value]。input中=onInput（transient想定）、
  // pointerup/change=onCommit。数値クリック（タッチはタップ）で直接入力へ切替。
  function sliderRow(opts) {
    var min = opts.min, max = opts.max;
    var step = (opts.step == null) ? 1 : opts.step;
    var unit = opts.unit || '';
    var fmtFn = opts.format || String;
    var decimals = stepDecimals(step);

    var row = el('div', 'slider-row');

    var iconEl = el('span', 'slider-icon');
    var svg = opts.icon ? svgFromIcon(opts.icon) : null;
    if (svg) iconEl.appendChild(svg);

    var labelEl = el('span', 'slider-label');
    labelEl.textContent = opts.label || '';

    var range = el('input');
    range.type = 'range';
    range.min = String(min);
    range.max = String(max);
    range.step = String(step);
    range.value = String(opts.value);

    var valueEl = el('span', 'slider-value');
    valueEl.title = 'クリックで数値入力';

    row.appendChild(iconEl);
    row.appendChild(labelEl);
    row.appendChild(range);
    row.appendChild(valueEl);

    function display(v) {
      valueEl.textContent = fmtFn(v) + unit;
    }
    function current() {
      return parseFloat(range.value);
    }
    display(current());

    // 二重commit防止（pointerup と change が同時に発火するため）
    var lastCommit = current();
    var dirty = false; // input発火後は値が元に戻っていてもcommitする（transient確定のため）

    range.addEventListener('input', function () {
      dirty = true;
      var v = current();
      display(v);
      if (opts.onInput) opts.onInput(v);
    });
    function commit() {
      var v = current();
      if (!dirty && v === lastCommit) return;
      dirty = false;
      lastCommit = v;
      if (opts.onCommit) opts.onCommit(v);
    }
    range.addEventListener('change', commit);
    range.addEventListener('pointerup', commit);

    // 数値の直接入力（クリック/タップで <input type=number> に切替、blur/Enterで確定）
    valueEl.addEventListener('click', function () {
      var input = el('input', 'slider-value-input');
      input.type = 'number';
      input.min = String(min);
      input.max = String(max);
      input.step = String(step);
      input.value = String(current());
      valueEl.replaceWith(input);
      input.focus();
      input.select();

      var done = false;
      function finish(apply) {
        if (done) return;
        done = true;
        var v = parseFloat(input.value);
        input.replaceWith(valueEl);
        if (apply && isFinite(v)) {
          v = clamp(v, min, max);
          v = parseFloat(v.toFixed(Math.max(decimals, 4))); // 浮動小数ゴミ除去（stepより細かい入力は許容）
          range.value = String(v);
          display(v);
          dirty = false;
          if (v !== lastCommit) {
            lastCommit = v;
            if (opts.onCommit) opts.onCommit(v);
          }
        } else {
          display(current());
        }
      }
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); finish(true); }
        else if (e.key === 'Escape') { e.stopPropagation(); finish(false); }
      });
      input.addEventListener('blur', function () { finish(true); });
    });

    return row;
  }

  // ---- segment（排他選択） --------------------------------------------------
  function segment(opts) {
    var wrap = el('div', 'option-group');
    var current = opts.value;
    (opts.options || []).forEach(function (o) {
      var b = btn('option-btn');
      b.textContent = o.label;
      b.dataset.value = String(o.value);
      setState(b, o.value === current);
      b.addEventListener('click', function () {
        if (o.value === current) return;
        current = o.value;
        Array.prototype.forEach.call(wrap.children, function (c) {
          setState(c, c === b);
        });
        if (opts.onChange) opts.onChange(o.value);
      });
      wrap.appendChild(b);
    });
    function setState(b, on) {
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
    return wrap;
  }

  // ---- toggle（チェック風 motion-color-btn型） -------------------------------
  function toggle(opts) {
    var b = btn('option-btn motion-color-btn');
    b.textContent = opts.label || '';
    var checked = !!opts.checked;
    function sync() {
      b.classList.toggle('active', checked);
      b.setAttribute('aria-pressed', checked ? 'true' : 'false');
    }
    sync();
    b.addEventListener('click', function () {
      checked = !checked;
      sync();
      if (opts.onChange) opts.onChange(checked);
    });
    return b;
  }

  // ---- colorInput（丸スウォッチ + #hexテキスト） -----------------------------
  function colorInput(opts) {
    var wrap = el('div', 'color-input');
    var swatch = el('span', 'color-swatch');
    var picker = el('input');
    picker.type = 'color';
    var hex = el('input', 'color-hex');
    hex.type = 'text';
    hex.maxLength = 7;
    hex.spellcheck = false;
    hex.autocomplete = 'off';

    var current = normalizeHex(opts.value) || '#ffffff';
    function apply(v) {
      picker.value = v;
      hex.value = v;
      swatch.style.background = v;
    }
    apply(current);

    swatch.appendChild(picker);
    wrap.appendChild(swatch);
    wrap.appendChild(hex);

    // カラーピッカー: input=transient / change=確定
    picker.addEventListener('input', function () {
      current = picker.value;
      hex.value = current;
      hex.classList.remove('invalid');
      swatch.style.background = current;
      if (opts.onInput) opts.onInput(current);
    });
    picker.addEventListener('change', function () {
      current = picker.value;
      apply(current);
      if (opts.onCommit) opts.onCommit(current);
    });

    // hexテキスト: 6桁hexのみ有効。無効はinvalid表示、確定時に巻き戻し
    hex.addEventListener('input', function () {
      var v = normalizeHex(hex.value);
      hex.classList.toggle('invalid', !v);
      if (v) {
        current = v;
        picker.value = v;
        swatch.style.background = v;
        if (opts.onInput) opts.onInput(v);
      }
    });
    function confirmHex() {
      var v = normalizeHex(hex.value);
      hex.classList.remove('invalid');
      if (v) {
        current = v;
        apply(v);
        if (opts.onCommit) opts.onCommit(v);
      } else {
        apply(current); // 不正入力は直前の有効値へ戻す
      }
    }
    hex.addEventListener('change', confirmHex);
    hex.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); confirmHex(); hex.blur(); }
    });

    return wrap;
  }

  // ---- group（.tuning-group 折りたたみ） -------------------------------------
  function group(opts) {
    var g = el('div', 'tuning-group');
    if (opts.open) g.classList.add('open');

    var head = btn('tuning-group-head');
    head.setAttribute('aria-expanded', opts.open ? 'true' : 'false');

    var label = el('span', 'tuning-group-label');
    var ic = opts.icon ? svgFromIcon(opts.icon, 'tuning-group-icon') : null;
    if (ic) label.appendChild(ic);
    label.appendChild(document.createTextNode(opts.title || ''));

    var right = el('span', 'tuning-group-head-right');
    var closeLabel = el('span', 'tuning-group-close-label');
    closeLabel.textContent = '閉じる';
    var chev = svgFromIcon('chevron-down', 'tuning-group-chevron');
    right.appendChild(closeLabel);
    right.appendChild(chev);

    head.appendChild(label);
    head.appendChild(right);

    var body = el('div', 'tuning-group-body');
    var items = opts.body ? (Array.isArray(opts.body) ? opts.body : [opts.body]) : [];
    items.forEach(function (n) { if (n) body.appendChild(n); });

    head.addEventListener('click', function () {
      var open = g.classList.toggle('open');
      head.setAttribute('aria-expanded', open ? 'true' : 'false');
    });

    g.appendChild(head);
    g.appendChild(body);
    return g;
  }

  // ---- confirm（.app-modal → Promise<bool>） ---------------------------------
  var modalUid = 0;
  function confirm(opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      var modal = el('div', 'app-modal');
      modal.setAttribute('role', 'dialog');
      modal.setAttribute('aria-modal', 'true');

      var backdrop = el('div', 'app-modal-backdrop');
      backdrop.setAttribute('data-modal-close', '');

      var content = el('div', 'app-modal-content app-modal-content-narrow');

      var head = el('div', 'app-modal-head');
      var title = el('h3', 'app-modal-title');
      title.textContent = opts.title || '確認';
      title.id = 'tsModalTitle' + (++modalUid);
      modal.setAttribute('aria-labelledby', title.id);
      var closeBtn = btn('app-modal-close');
      closeBtn.setAttribute('data-modal-close', '');
      closeBtn.setAttribute('aria-label', '閉じる');
      closeBtn.innerHTML = icon('x');
      head.appendChild(title);
      head.appendChild(closeBtn);

      var body = el('div', 'app-modal-body');
      body.textContent = opts.message || '';

      var actions = el('div', 'app-modal-actions');
      var cancel = btn('app-modal-btn app-modal-btn-secondary');
      cancel.textContent = 'キャンセル';
      cancel.setAttribute('data-modal-close', '');
      var ok = btn('app-modal-btn ' + (opts.danger ? 'app-modal-btn-danger' : 'app-modal-btn-primary'));
      ok.textContent = opts.okLabel || 'OK';
      actions.appendChild(cancel);
      actions.appendChild(ok);

      content.appendChild(head);
      content.appendChild(body);
      content.appendChild(actions);
      modal.appendChild(backdrop);
      modal.appendChild(content);

      var closed = false;
      function close(result) {
        if (closed) return;
        closed = true;
        document.removeEventListener('keydown', onKey, true);
        modal.remove();
        resolve(result);
      }
      function onKey(e) {
        if (e.key === 'Escape') {
          e.stopPropagation();
          close(false);
        }
      }
      // backdrop / × / キャンセル は data-modal-close で一括 false
      modal.addEventListener('click', function (e) {
        var t = e.target;
        if (t instanceof Element && t.closest('[data-modal-close]')) close(false);
      });
      ok.addEventListener('click', function () { close(true); });
      document.addEventListener('keydown', onKey, true);

      document.body.appendChild(modal);
      ok.focus();
    });
  }

  // ---- 汎用ドロップダウン（認知負荷軽減のためチップ列の代替。P3レビュー反映） --------
  // opts: { options: [{value,label,desc?,group?}], value, onChange, ariaLabel?, placeholder? }
  // group が変わる位置に小見出しを挟む。パネルは body 直下の fixed 配置
  // （tuning-group-body 等の overflow:hidden にクリップされないため）。
  function select(opts) {
    var options = opts.options || [];
    var current = opts.value;

    function tEl(tag, cls, text) {
      var e = el(tag, cls);
      if (text != null) e.textContent = text;
      return e;
    }

    var wrap = el('div', 'ts-select');
    var button = btn('ts-select-btn');
    button.setAttribute('aria-haspopup', 'listbox');
    button.setAttribute('aria-expanded', 'false');
    if (opts.ariaLabel) button.setAttribute('aria-label', opts.ariaLabel);

    var labelEl = el('span', 'ts-select-label');
    var chev = el('span', 'ts-select-chevron');
    chev.innerHTML = icon('chevron-down');
    button.appendChild(labelEl);
    button.appendChild(chev);
    wrap.appendChild(button);

    function findOpt(v) {
      for (var i = 0; i < options.length; i++) if (options[i].value === v) return options[i];
      return null;
    }
    function syncLabel() {
      var o = findOpt(current);
      labelEl.textContent = o ? o.label : (opts.placeholder || '選択…');
    }
    syncLabel();

    var panel = null;
    function close() {
      if (!panel) return;
      panel.remove();
      panel = null;
      button.setAttribute('aria-expanded', 'false');
      document.removeEventListener('pointerdown', onOutside, true);
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('scroll', onScrollAway, true);
      window.removeEventListener('resize', close);
    }
    // ページ側のスクロールでは閉じるが、パネル内のスクロールでは閉じない
    //（capture監視はパネル自身のscrollも拾うため、発生元を判定する）
    function onScrollAway(e) {
      if (panel && e.target instanceof Node && panel.contains(e.target)) return;
      close();
    }
    function onOutside(e) {
      if (panel && !panel.contains(e.target) && !wrap.contains(e.target)) close();
    }
    function onKey(e) { if (e.key === 'Escape') { e.stopPropagation(); close(); } }

    function open() {
      if (panel) { close(); return; }
      panel = el('div', 'ts-select-panel');
      panel.setAttribute('role', 'listbox');
      var lastGroup = null;
      options.forEach(function (o) {
        if (o.group != null && o.group !== lastGroup) {
          lastGroup = o.group;
          panel.appendChild(tEl('div', 'ts-select-group', o.group));
        }
        var it = btn('ts-select-item' + (o.value === current ? ' active' : ''));
        it.setAttribute('role', 'option');
        it.setAttribute('aria-selected', o.value === current ? 'true' : 'false');
        it.appendChild(tEl('span', 'ts-select-item-label', o.label));
        if (o.desc) it.appendChild(tEl('span', 'ts-select-desc', o.desc));
        it.addEventListener('click', function () {
          var changed = o.value !== current;
          current = o.value;
          syncLabel();
          close();
          if (changed && opts.onChange) opts.onChange(o.value);
        });
        panel.appendChild(it);
      });
      // 配置: ボタン直下（画面下端にかかる場合は上側）。fixedでoverflowクリップを回避
      var r = button.getBoundingClientRect();
      panel.style.position = 'fixed';
      panel.style.left = Math.round(r.left) + 'px';
      panel.style.minWidth = Math.round(r.width) + 'px';
      panel.style.zIndex = '1200';
      document.body.appendChild(panel);
      var ph = panel.getBoundingClientRect().height;
      var below = window.innerHeight - r.bottom;
      if (below < ph + 8 && r.top > ph + 8) panel.style.top = Math.round(r.top - ph - 4) + 'px';
      else panel.style.top = Math.round(r.bottom + 4) + 'px';
      button.setAttribute('aria-expanded', 'true');
      document.addEventListener('pointerdown', onOutside, true);
      document.addEventListener('keydown', onKey, true);
      window.addEventListener('scroll', onScrollAway, true);   // ページスクロールで閉じる（パネル内は除外）
      window.addEventListener('resize', close);
    }
    button.addEventListener('click', open);

    return wrap;
  }

  // ---- 公開 ------------------------------------------------------------------
  TS.ui = {
    sliderRow: sliderRow,
    segment: segment,
    toggle: toggle,
    colorInput: colorInput,
    group: group,
    select: select,
    confirm: confirm,
    icon: icon
  };

})();
