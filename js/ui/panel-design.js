'use strict';
// TS.panelDesign — デザインタブ（契約書 §6.12 panel-design）
// レイヤーリスト（上=最前面=配列末尾）・レイヤー編集アコーディオン・レイヤー追加・
// fill編集（種別/停止リスト/金属化）・stroke/extrude/shine編集・ドロップシャドウ節。
// スライダーは onInput=transient set / onCommit=commit。
(function () {
  window.TS = window.TS || {};

  // ---- DOMヘルパ -----------------------------------------------------------
  function el(tag, cls) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    return e;
  }
  function btn(cls, label) {
    var b = el('button', cls);
    b.type = 'button';
    if (label) { b.title = label; b.setAttribute('aria-label', label); }
    return b;
  }
  function textEl(tag, cls, text) {
    var e = el(tag, cls);
    e.textContent = text;
    return e;
  }

  // ---- 色ヘルパ --------------------------------------------------------------
  function to2(n) { return ('0' + (+n).toString(16)).slice(-2); }

  // CSS色文字列 → '#rrggbb'（colorInput 用。rgba のアルファは捨てる。不明は白）
  function cssToHex(c) {
    if (typeof c !== 'string') return '#ffffff';
    var s = c.trim();
    if (s.charAt(0) === '#') {
      if (s.length === 4) return ('#' + s[1] + s[1] + s[2] + s[2] + s[3] + s[3]).toLowerCase();
      if (s.length >= 7) return s.slice(0, 7).toLowerCase();
      return '#ffffff';
    }
    var m = s.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
    if (m) return '#' + to2(m[1]) + to2(m[2]) + to2(m[3]);
    return '#ffffff';
  }

  // 色オブジェクト or 文字列 → 単色hex（stroke色などの表示用）
  function solidHexOf(c) {
    if (typeof c === 'string') return cssToHex(c);
    if (c && c.type === 'solid') return cssToHex(c.value);
    if (c && Array.isArray(c.stops) && c.stops[0]) return cssToHex(c.stops[0][0]);
    return '#ffffff';
  }

  // 少し暗い色（単色→グラデ変換の第2停止用）
  function darker(hex) {
    var h = TS.color.hexToHsl(hex);
    h.l = Math.max(0.05, h.l - 0.3);
    return TS.color.hslToHex(h);
  }

  function pctFmt(v) { return String(Math.round(v * 100)); }

  // ---- レイヤー種別 ----------------------------------------------------------
  var TYPE_NAMES = { fill: '塗り', stroke: '縁取り', extrude: '押し出し', shine: 'シャイン' };
  function typeName(t) { return TYPE_NAMES[t] || t; }

  // 縁取りだけリング型の独自SVG（TS.ui.icon に適合する図が無いため同作法で自前定義）
  var RING_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" ' +
    'stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" ' +
    'aria-hidden="true"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/></svg>';
  function typeIconHTML(t) {
    if (t === 'stroke') return RING_SVG;
    var n = (t === 'fill') ? 'droplet' : (t === 'extrude') ? 'box' : (t === 'shine') ? 'zap' : 'sliders';
    return TS.ui.icon(n);
  }

  // ---- store ヘルパ ----------------------------------------------------------
  function tset(fn) { TS.store.set(fn, { transient: true }); }
  function cset(fn) { TS.store.set(fn); }

  function findLayer(scene, id) {
    var ls = scene.layers || [];
    for (var i = 0; i < ls.length; i++) if (ls[i].id === id) return ls[i];
    return null;
  }
  function indexOfLayer(layers, id) {
    for (var i = 0; i < layers.length; i++) if (layers[i].id === id) return i;
    return -1;
  }

  function segRow(label, seg) {
    var row = el('div', 'seg-row');
    row.appendChild(textEl('span', 'seg-row-label', label));
    row.appendChild(seg);
    return row;
  }

  // ---- fill 種別変換（stops引き継ぎ規約） -------------------------------------
  function convertFillType(L, t) {
    var old = L.color || { type: 'solid', value: '#ffffff' };
    if (old.type === t) return;
    if (t === 'solid') {
      // グラデ→単色は先頭停止色
      var v = (old.type === 'solid') ? cssToHex(old.value)
        : (old.stops && old.stops[0]) ? cssToHex(old.stops[0][0]) : '#ffffff';
      L.color = { type: 'solid', value: v };
      return;
    }
    var stops;
    if (old.type === 'solid') {
      // 単色→グラデは2停止生成（基準色→暗色）
      var base = cssToHex(old.value || '#ffffff');
      stops = [[base, 0], [darker(base), 1]];
    } else {
      stops = (old.stops || []).map(function (s) { return [s[0], +s[1] || 0]; });
      if (stops.length < 2) {
        var b2 = stops[0] ? cssToHex(stops[0][0]) : '#ffffff';
        stops = [[b2, 0], [darker(b2), 1]];
      }
    }
    var nc = { type: t, stops: stops };
    if (t === 'linear') nc.angle = (old.type === 'linear' && old.angle != null) ? old.angle : 180;
    if (t === 'conic') nc.from = (old.type === 'conic' && old.from != null) ? old.from : 0;
    L.color = nc;
  }

  // 停止追加位置: 最大の隣接ギャップの中点（色は手前側の停止色）
  function midInsert(stops) {
    if (!stops || stops.length < 2) {
      return { idx: stops ? stops.length : 0, pos: 0.5,
        color: (stops && stops.length) ? stops[stops.length - 1][0] : '#ffffff' };
    }
    var bi = 0, bg = -Infinity;
    for (var i = 0; i < stops.length - 1; i++) {
      var g = (+stops[i + 1][1] || 0) - (+stops[i][1] || 0);
      if (g > bg) { bg = g; bi = i; }
    }
    var pos = ((+stops[bi][1] || 0) + (+stops[bi + 1][1] || 0)) / 2;
    pos = Math.min(1, Math.max(0, pos));
    return { idx: bi + 1, pos: pos, color: stops[bi][0] };
  }

  // ---- 金属化（1履歴で fill / 最外stroke色 / whiteline に適用） -----------------
  // whiteline = 白単色かつ幅0.06em以下の細stroke（既定プリセットの 0.03 白線相当）
  function isWhiteline(L) {
    if (!L || L.type !== 'stroke') return false;
    var v = (typeof L.color === 'string') ? L.color : (L.color && L.color.value);
    if (typeof v !== 'string') return false;
    v = v.toLowerCase();
    return (v === '#ffffff' || v === '#fff') && (typeof L.width === 'number' ? L.width : 0) <= 0.06;
  }

  function applyMetal(d, baseHex) {
    var res = TS.color.metalStops(baseHex);
    var i, L;
    // fill: 可視優先で先頭の1枚（複数/ゼロでも壊れない）
    var fill = null;
    for (i = 0; i < d.layers.length; i++) {
      L = d.layers[i];
      if (L.type === 'fill' && L.visible !== false) { fill = L; break; }
    }
    if (!fill) {
      for (i = 0; i < d.layers.length; i++) if (d.layers[i].type === 'fill') { fill = d.layers[i]; break; }
    }
    if (fill) fill.color = res.fill;
    // 最外stroke（whiteline除外・可視優先・実効幅最大）
    var best = null;
    for (var pass = 0; pass < 2 && !best; pass++) {
      var bw = -1;
      for (i = 0; i < d.layers.length; i++) {
        L = d.layers[i];
        if (L.type !== 'stroke' || isWhiteline(L)) continue;
        if (pass === 0 && L.visible === false) continue;
        var w = (L.align === 'outside' ? 2 : 1) * (typeof L.width === 'number' ? L.width : 0);
        if (w > bw) { bw = w; best = L; }
      }
    }
    if (best) best.color = { type: 'solid', value: res.stroke };
    // whiteline: 0.03白strokeの挿入 or 除去
    if (res.whiteline > 0) {
      var wl = null;
      for (i = 0; i < d.layers.length; i++) if (isWhiteline(d.layers[i])) { wl = d.layers[i]; break; }
      if (wl) {
        wl.width = res.whiteline;
        wl.visible = true;
        wl.opacity = 1;
      } else {
        wl = { id: TS.scene.newId('st'), type: 'stroke', visible: true, width: res.whiteline,
          align: 'center', color: { type: 'solid', value: '#ffffff' }, opacity: 1 };
        // 主strokeの上・fillの下に入れる
        var at = fill ? d.layers.indexOf(fill)
          : (best ? d.layers.indexOf(best) + 1 : d.layers.length);
        d.layers.splice(at, 0, wl);
      }
    } else {
      for (i = d.layers.length - 1; i >= 0; i--) {
        if (isWhiteline(d.layers[i])) d.layers.splice(i, 1);
      }
    }
  }

  // ---- mount -----------------------------------------------------------------
  function mount(container) {
    var LIM = TS.scene.LIMITS;
    // UIローカル状態（再描画で保持）
    var state = { selectedId: null, metalBase: null };
    var root = el('div', 'panel-design');
    container.appendChild(root);

    // スライダー行（onInput=transient / onCommit=同値をtransient反映してからcommitで1履歴）。
    // commit後は再描画（ドラッグ終了済みなので安全。行メタ等の表示を追従させる）
    function slide(o, apply) {
      return TS.ui.sliderRow({
        icon: o.icon || null,
        label: o.label, min: o.min, max: o.max, step: o.step,
        value: o.value, format: o.format, unit: o.unit,
        onInput: function (v) { tset(function (d) { apply(d, v); }); },
        onCommit: function (v) {
          tset(function (d) { apply(d, v); });
          TS.store.commit();
          render();
        }
      });
    }

    // colorInput（ピッカードラッグ=transient / 確定=commit）。
    // commit後の再描画はしない（Safariはピッカー表示中にchangeが発火し得るため）
    function colorCtl(value, apply) {
      return TS.ui.colorInput({
        value: value,
        onInput: function (v) { tset(function (d) { apply(d, v); }); },
        onCommit: function (v) { tset(function (d) { apply(d, v); }); TS.store.commit(); }
      });
    }
    function colorRow(label, value, apply) {
      var row = el('div', 'color-row');
      row.appendChild(textEl('span', 'color-row-label', label));
      row.appendChild(colorCtl(value, apply));
      return row;
    }

    // ---- レイヤー操作 --------------------------------------------------------
    function moveLayer(id, dir) { // dir=+1 前面（配列末尾側）/ -1 背面
      var s = TS.store.get();
      var i = indexOfLayer(s.layers, id);
      if (i < 0 || i + dir < 0 || i + dir >= s.layers.length) return;
      cset(function (d) {
        var a = indexOfLayer(d.layers, id);
        var b = a + dir;
        if (a < 0 || b < 0 || b >= d.layers.length) return;
        var t = d.layers[a];
        d.layers[a] = d.layers[b];
        d.layers[b] = t;
      });
    }

    function dupLayer(id) {
      var s = TS.store.get();
      var i = indexOfLayer(s.layers, id);
      if (i < 0) return;
      var copy = TS.scene.clone(s.layers[i]);
      copy.id = TS.scene.newId(String(copy.type).slice(0, 2));
      state.selectedId = copy.id;
      cset(function (d) {
        var j = indexOfLayer(d.layers, id);
        if (j < 0) return;
        d.layers.splice(j + 1, 0, copy);
      });
    }

    function delLayer(id) {
      var s = TS.store.get();
      var i = indexOfLayer(s.layers, id);
      if (i < 0) return;
      var name = typeName(s.layers[i].type);
      TS.ui.confirm({
        title: 'レイヤーを削除',
        message: '「' + name + '」レイヤーを削除しますか？',
        okLabel: '削除',
        danger: true
      }).then(function (ok) {
        if (!ok) return;
        if (state.selectedId === id) state.selectedId = null;
        cset(function (d) {
          var j = indexOfLayer(d.layers, id);
          if (j >= 0) d.layers.splice(j, 1);
        });
      });
    }

    // 追加: extrudeは最下層、strokeはfillの下、shineは最前面（各typeの妥当な既定値）
    function addLayer(type) {
      var L;
      if (type === 'stroke') {
        L = { id: TS.scene.newId('st'), type: 'stroke', visible: true, width: 0.14,
          align: 'center', color: { type: 'solid', value: '#000000' }, opacity: 1 };
      } else if (type === 'extrude') {
        L = { id: TS.scene.newId('ex'), type: 'extrude', visible: true,
          steps: 6, dist: 0.014, angle: 90, color: '#000000',
          contact: { enabled: true, opacity: 0.4, dist: 0.1 } };
      } else {
        L = { id: TS.scene.newId('sh'), type: 'shine', visible: true,
          angle: 105, band: 0.16, span: 2.5, opacity: 0.98 };
      }
      state.selectedId = L.id;
      cset(function (d) {
        var at = d.layers.length;
        if (type === 'extrude') {
          at = 0;
        } else if (type === 'stroke') {
          for (var i = 0; i < d.layers.length; i++) {
            if (d.layers[i].type === 'fill') { at = i; break; }
          }
        }
        d.layers.splice(at, 0, TS.scene.clone(L));
      });
    }

    // ---- レイヤー行 ----------------------------------------------------------
    function layerMeta(L) {
      if (L.type === 'stroke') return (typeof L.width === 'number' ? L.width : 0) + 'em';
      if (L.type === 'extrude') return (L.steps || 0) + '段';
      if (L.type === 'fill') {
        var t = L.color && L.color.type;
        return t === 'linear' ? '線形' : t === 'radial' ? '放射' : t === 'conic' ? '円錐' : '単色';
      }
      return '';
    }

    function buildLayerRow(scene, L) {
      var selected = (L.id === state.selectedId);
      var row = el('div', 'layer-row' + (selected ? ' selected' : '') +
        (L.visible === false ? ' layer-hidden' : ''));
      row.setAttribute('data-layer-id', L.id);   // D&D入れ替え用
      row.setAttribute('role', 'button');
      row.tabIndex = 0;
      row.setAttribute('aria-expanded', selected ? 'true' : 'false');

      var ic = el('span', 'layer-row-icon');
      ic.innerHTML = typeIconHTML(L.type);
      var name = textEl('span', 'layer-row-name', typeName(L.type));
      var meta = textEl('span', 'layer-row-meta', layerMeta(L));

      var eye = btn('layer-row-eye', L.visible === false ? '表示する' : '非表示にする');
      eye.innerHTML = TS.ui.icon(L.visible === false ? 'eye-off' : 'eye');
      eye.setAttribute('aria-pressed', L.visible === false ? 'false' : 'true');
      eye.addEventListener('click', function (e) {
        e.stopPropagation();
        cset(function (d) {
          var LL = findLayer(d, L.id);
          if (LL) LL.visible = (LL.visible === false);
        });
      });

      function toggleSelect() {
        state.selectedId = selected ? null : L.id;
        render();
      }
      row.addEventListener('click', toggleSelect);
      row.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleSelect(); }
      });

      row.appendChild(ic);
      row.appendChild(name);
      row.appendChild(meta);
      row.appendChild(eye);
      return row;
    }

    // ---- 行操作ツールバー -----------------------------------------------------
    function buildOps(scene, L) {
      var ops = el('div', 'layer-ops');
      var idx = indexOfLayer(scene.layers, L.id);
      var isFill = (L.type === 'fill');
      function mkOp(iconName, label, disabled, danger, fn) {
        var b = btn('layer-op-btn' + (danger ? ' danger' : ''), label);
        b.innerHTML = TS.ui.icon(iconName);
        b.disabled = !!disabled;
        b.addEventListener('click', fn);
        ops.appendChild(b);
      }
      mkOp('arrow-up', '前面へ', idx >= scene.layers.length - 1, false, function () { moveLayer(L.id, +1); });
      mkOp('arrow-down', '背面へ', idx <= 0, false, function () { moveLayer(L.id, -1); });
      mkOp('copy', '複製', isFill, false, function () { dupLayer(L.id); });
      mkOp('trash', '削除', isFill, true, function () { delLayer(L.id); });
      return ops;
    }

    // ---- fill 編集 ------------------------------------------------------------
    function stopsOf(d, id) {
      var L = findLayer(d, id);
      return (L && L.color && Array.isArray(L.color.stops)) ? L.color.stops : null;
    }

    function buildStopRow(id, stop, i, count) {
      var row = el('div', 'stop-row');
      var head = el('div', 'stop-row-head');
      head.appendChild(colorCtl(cssToHex(stop[0]), function (d, v) {
        var st = stopsOf(d, id);
        if (st && st[i]) st[i][0] = v;
      }));
      var del = btn('layer-op-btn stop-del', '停止を削除');
      del.innerHTML = TS.ui.icon('trash');
      del.disabled = count <= 2; // 2停止未満にはしない
      del.addEventListener('click', function () {
        cset(function (d) {
          var st = stopsOf(d, id);
          if (st && st.length > 2 && i < st.length) st.splice(i, 1);
        });
      });
      head.appendChild(del);
      row.appendChild(head);
      row.appendChild(slide(
        { label: '位置', min: 0, max: 100, step: 1, value: Math.round((+stop[1] || 0) * 100), unit: '%' },
        function (d, v) {
          var st = stopsOf(d, id);
          if (st && st[i]) st[i][1] = v / 100;
        }));
      return row;
    }

    function defaultMetalBase(L) {
      return solidHexOf(L.color) || '#c8a52a';
    }

    // 金属化: 基準色（UIローカル）＋実行で1履歴適用
    function buildMetalRow(L) {
      var wrap = el('div', 'metal-row');
      wrap.appendChild(textEl('span', 'color-row-label', '基準色'));
      wrap.appendChild(TS.ui.colorInput({
        value: state.metalBase || defaultMetalBase(L),
        onInput: function (v) { state.metalBase = v; },   // 実行までsceneに触れない
        onCommit: function (v) { state.metalBase = v; }
      }));
      var run = btn('option-btn metal-btn');
      run.textContent = '金属化';
      run.addEventListener('click', function () {
        var b = state.metalBase || defaultMetalBase(L);
        state.metalBase = b;
        cset(function (d) { applyMetal(d, b); });
      });
      wrap.appendChild(run);
      return wrap;
    }

    function buildFillEditor(L) {
      var out = [];
      var c = L.color || { type: 'solid', value: '#ffffff' };
      var t = c.type || 'solid';
      out.push(segRow('種別', TS.ui.segment({
        options: [
          { value: 'solid', label: '単色' },
          { value: 'linear', label: '線形' },
          { value: 'radial', label: '放射' },
          { value: 'conic', label: '円錐' }
        ],
        value: t,
        onChange: function (nt) {
          cset(function (d) {
            var LL = findLayer(d, L.id);
            if (LL) convertFillType(LL, nt);
          });
        }
      })));
      if (t === 'solid') {
        out.push(colorRow('色', cssToHex(c.value), function (d, v) {
          var LL = findLayer(d, L.id);
          if (LL) LL.color = { type: 'solid', value: v };
        }));
      } else {
        var stops = c.stops || [];
        var list = el('div', 'stop-list');
        stops.forEach(function (s, i) { list.appendChild(buildStopRow(L.id, s, i, stops.length)); });
        out.push(list);
        var add = btn('option-btn stop-add');
        add.innerHTML = TS.ui.icon('plus') + '<span>停止を追加</span>';
        add.addEventListener('click', function () {
          cset(function (d) {
            var st = stopsOf(d, L.id);
            if (!st) return;
            var ins = midInsert(st);
            st.splice(ins.idx, 0, [ins.color, ins.pos]);
          });
        });
        out.push(add);
        if (t === 'linear') {
          out.push(slide(
            { label: '角度', min: LIM.angle[0], max: LIM.angle[1], step: 1,
              value: (c.angle != null) ? c.angle : 180, unit: '°' },
            function (d, v) {
              var LL = findLayer(d, L.id);
              if (LL && LL.color) LL.color.angle = v;
            }));
        }
        if (t === 'conic') {
          out.push(slide(
            { label: '開始角', min: LIM.angle[0], max: LIM.angle[1], step: 1,
              value: c.from || 0, unit: '°' },
            function (d, v) {
              var LL = findLayer(d, L.id);
              if (LL && LL.color) LL.color.from = v;
            }));
        }
      }
      out.push(buildMetalRow(L));
      return out;
    }

    // ---- stroke 編集 ----------------------------------------------------------
    function buildStrokeEditor(L) {
      return [
        slide(
          { label: '太さ', min: LIM.strokeW[0], max: LIM.strokeW[1], step: 0.005,
            value: (typeof L.width === 'number') ? L.width : 0.14 },
          function (d, v) {
            var LL = findLayer(d, L.id);
            if (LL) LL.width = v;
          }),
        colorRow('色', solidHexOf(L.color), function (d, v) {
          var LL = findLayer(d, L.id);
          if (LL) LL.color = { type: 'solid', value: v };   // P0はsolidのみ
        }),
        slide(
          { label: '不透明度', min: LIM.opacity[0], max: LIM.opacity[1], step: 0.01,
            value: (typeof L.opacity === 'number') ? L.opacity : 1, format: pctFmt, unit: '%' },
          function (d, v) {
            var LL = findLayer(d, L.id);
            if (LL) LL.opacity = v;
          }),
        segRow('位置', TS.ui.segment({
          options: [{ value: 'center', label: '中央' }, { value: 'outside', label: '外側' },
                    { value: 'inside', label: '内側' }],
          value: (L.align === 'outside' || L.align === 'inside') ? L.align : 'center',
          onChange: function (v) {
            cset(function (d) {
              var LL = findLayer(d, L.id);
              if (!LL) return;
              LL.align = v;
              // 内側縁は塗りの上にないと見えない → 塗りより下にあれば自動で直上へ移動
              if (v === 'inside') {
                var idx = d.layers.indexOf(LL);
                var fillIdx = -1;
                for (var i = 0; i < d.layers.length; i++) {
                  if (d.layers[i].type === 'fill' && d.layers[i].visible !== false) { fillIdx = i; break; }
                }
                if (fillIdx >= 0 && idx < fillIdx) {
                  d.layers.splice(idx, 1);
                  d.layers.splice(fillIdx, 0, LL);   // 元のfill位置＝fillの直上に入る
                }
              }
            });
          }
        }))
      ].concat((L.align === 'inside')
        ? [noteEl('内側縁はプレビューでは簡易表示です（書き出しでは正確にグリフ内側へ乗ります）')]
        : []);
    }
    function noteEl(text) {
      var n = textEl('div', 'pm-note', text);
      n.style.cssText = 'font-size:10.5px;color:var(--text-dim);padding:4px 0 0;line-height:1.5;';
      return n;
    }

    // ---- extrude 編集 ---------------------------------------------------------
    function contactOf(LL) {
      if (!LL.contact) LL.contact = { enabled: true, opacity: 0.4, dist: 0.1 };
      return LL.contact;
    }

    function buildExtrudeEditor(L) {
      var ct = L.contact || { enabled: true, opacity: 0.4, dist: 0.1 };
      return [
        slide(
          { label: '段数', min: LIM.extrudeSteps[0], max: LIM.extrudeSteps[1], step: 1,
            value: L.steps || 6 },
          function (d, v) {
            var LL = findLayer(d, L.id);
            if (LL) LL.steps = Math.round(v);
          }),
        slide(
          { label: '距離', min: LIM.extrudeDist[0], max: LIM.extrudeDist[1], step: 0.001,
            value: (typeof L.dist === 'number') ? L.dist : 0.014 },
          function (d, v) {
            var LL = findLayer(d, L.id);
            if (LL) LL.dist = v;
          }),
        slide(
          { label: '方向', min: LIM.angle[0], max: LIM.angle[1], step: 1,
            value: (typeof L.angle === 'number') ? L.angle : 90, unit: '°' },
          function (d, v) {
            var LL = findLayer(d, L.id);
            if (LL) LL.angle = v;
          }),
        colorRow('側面色', cssToHex(typeof L.color === 'string' ? L.color : solidHexOf(L.color)),
          function (d, v) {
            var LL = findLayer(d, L.id);
            if (LL) LL.color = v;   // 側面色は単色文字列
          }),
        TS.ui.toggle({
          label: '接地影',
          checked: ct.enabled !== false,
          onChange: function (on) {
            cset(function (d) {
              var LL = findLayer(d, L.id);
              if (LL) contactOf(LL).enabled = on;
            });
          }
        }),
        slide(
          { label: '濃さ', min: LIM.contactOpacity[0], max: LIM.contactOpacity[1], step: 0.01,
            value: (typeof ct.opacity === 'number') ? ct.opacity : 0.4, format: pctFmt, unit: '%' },
          function (d, v) {
            var LL = findLayer(d, L.id);
            if (LL) contactOf(LL).opacity = v;
          }),
        slide(
          { label: '影距離', min: LIM.contactDist[0], max: LIM.contactDist[1], step: 0.005,
            value: (typeof ct.dist === 'number') ? ct.dist : 0.1 },
          function (d, v) {
            var LL = findLayer(d, L.id);
            if (LL) contactOf(LL).dist = v;
          })
      ];
    }

    // ---- shine 編集 -----------------------------------------------------------
    function buildShineEditor(L) {
      return [
        slide(
          { label: '角度', min: LIM.angle[0], max: LIM.angle[1], step: 1,
            value: (typeof L.angle === 'number') ? L.angle : 105, unit: '°' },
          function (d, v) {
            var LL = findLayer(d, L.id);
            if (LL) LL.angle = v;
          }),
        slide(
          { label: '帯幅', min: LIM.shineBand[0], max: LIM.shineBand[1], step: 0.01,
            value: (typeof L.band === 'number') ? L.band : 0.16 },
          function (d, v) {
            var LL = findLayer(d, L.id);
            if (LL) LL.band = v;
          }),
        slide(
          { label: '移動幅', min: LIM.shineSpan[0], max: LIM.shineSpan[1], step: 0.1,
            value: (typeof L.span === 'number') ? L.span : 2.5 },
          function (d, v) {
            var LL = findLayer(d, L.id);
            if (LL) LL.span = v;
          }),
        slide(
          { label: '不透明度', min: LIM.opacity[0], max: LIM.opacity[1], step: 0.01,
            value: (typeof L.opacity === 'number') ? L.opacity : 0.98, format: pctFmt, unit: '%' },
          function (d, v) {
            var LL = findLayer(d, L.id);
            if (LL) LL.opacity = v;
          })
      ];
    }

    // ---- 選択レイヤーの編集アコーディオン ---------------------------------------
    function buildLayerEditor(scene, L) {
      var ed = el('div', 'layer-editor');
      ed.appendChild(buildOps(scene, L));
      var rows;
      if (L.type === 'fill') rows = buildFillEditor(L);
      else if (L.type === 'stroke') rows = buildStrokeEditor(L);
      else if (L.type === 'extrude') rows = buildExtrudeEditor(L);
      else if (L.type === 'shine') rows = buildShineEditor(L);
      else rows = [];
      rows.forEach(function (n) { ed.appendChild(n); });
      return ed;
    }

    // ---- レイヤー節 ------------------------------------------------------------
    function buildLayerSection(scene) {
      var sec = el('section', 'design-section design-section-layers');
      sec.appendChild(textEl('h2', 'section-title', 'レイヤー'));

      var list = el('div', 'layer-list');
      // 上=最前面（配列末尾を先頭に表示）。シャインはモーションタブ管理のため一覧に出さない
      var disp = (scene.layers || []).slice().reverse()
        .filter(function (L) { return L && L.type !== 'shine'; });
      disp.forEach(function (L) {
        list.appendChild(buildLayerRow(scene, L));
        if (L.id === state.selectedId) list.appendChild(buildLayerEditor(scene, L));
      });
      sec.appendChild(list);
      wireDragReorder(list);   // タップ＆ドラッグでレイヤー入れ替え

      // レイヤーを追加（fillは常に1枚のため追加不可。シャインはモーションタブ「照り」で管理）
      var addWrap = el('div', 'add-layer-row');
      addWrap.appendChild(textEl('span', 'add-layer-label', 'レイヤーを追加'));
      var btns = el('div', 'add-layer-btns');
      [['stroke', '縁取り'], ['extrude', '押し出し']].forEach(function (p) {
        var b = btn('option-btn add-layer-btn');
        b.innerHTML = TS.ui.icon('plus') + '<span>' + p[1] + '</span>';
        b.addEventListener('click', function () { addLayer(p[0]); });
        btns.appendChild(b);
      });
      addWrap.appendChild(btns);
      sec.appendChild(addWrap);
      return sec;
    }

    /* ---- ドラッグ&ドロップでレイヤー入れ替え（ポインタ共通・タッチ対応） ----
       行を長押し不要でそのまま掴んで縦に動かす。しきい値6pxまでは通常タップ（選択）扱い。 */
    function wireDragReorder(list) {
      var drag = null;   // { id, el, startY, moved, rows }
      list.addEventListener('pointerdown', function (e) {
        var row = e.target.closest ? e.target.closest('.layer-row') : null;
        if (!row || !list.contains(row)) return;
        if (e.target.closest('button')) return;              // eye等のボタンはドラッグ対象外
        drag = { id: row.getAttribute('data-layer-id'), el: row, startY: e.clientY, moved: false };
        row.setPointerCapture && row.setPointerCapture(e.pointerId);
      });
      list.addEventListener('pointermove', function (e) {
        if (!drag) return;
        var dy = e.clientY - drag.startY;
        if (!drag.moved && Math.abs(dy) < 6) return;
        if (!drag.moved) {
          drag.moved = true;
          drag.el.classList.add('dragging');
          drag.rows = Array.prototype.slice.call(list.querySelectorAll('.layer-row'));
        }
        e.preventDefault();
        drag.el.style.transform = 'translateY(' + dy + 'px)';
        // ドロップ先ハイライト
        var over = rowAtY(e.clientY);
        drag.rows.forEach(function (r) { r.classList.toggle('drop-target', r === over && r !== drag.el); });
      });
      function rowAtY(y) {
        if (!drag || !drag.rows) return null;
        for (var i = 0; i < drag.rows.length; i++) {
          var r = drag.rows[i].getBoundingClientRect();
          if (y >= r.top && y <= r.bottom) return drag.rows[i];
        }
        return null;
      }
      function finish(e) {
        if (!drag) return;
        var d = drag; drag = null;
        d.el.style.transform = '';
        d.el.classList.remove('dragging');
        if (!d.moved) return;                       // ただのタップ → click（選択）に任せる
        var over = (e.clientY != null) ? (function () {
          if (!d.rows) return null;
          for (var i = 0; i < d.rows.length; i++) {
            var r = d.rows[i].getBoundingClientRect();
            if (e.clientY >= r.top && e.clientY <= r.bottom) return d.rows[i];
          }
          return null;
        })() : null;
        if (d.rows) d.rows.forEach(function (r) { r.classList.remove('drop-target'); });
        // moved後のclickで選択がトグルしないよう1度だけ抑止
        list.addEventListener('click', function block(ev) {
          ev.stopPropagation(); ev.preventDefault();
          list.removeEventListener('click', block, true);
        }, true);
        if (!over || over === d.el) { render(); return; }   // 変化なし→表示だけ戻す
        var overId = over.getAttribute('data-layer-id');
        cset(function (dr) {
          var ids = dr.layers.map(function (L) { return L.id; });
          var from = ids.indexOf(d.id);
          var to = ids.indexOf(overId);
          if (from < 0 || to < 0 || from === to) return;
          var L = dr.layers.splice(from, 1)[0];
          dr.layers.splice(to, 0, L);              // 相手の位置へ挿入（表示は逆順なので相手の位置=視覚的な入替）
        });
      }
      list.addEventListener('pointerup', finish);
      list.addEventListener('pointercancel', finish);
    }

    // ---- ドロップシャドウ節 ------------------------------------------------------
    function buildShadowCard(sh, i) {
      var card = el('div', 'shadow-card');
      var head = el('div', 'shadow-card-head');
      head.appendChild(textEl('span', 'shadow-card-title', 'シャドウ' + (i + 1)));
      var del = btn('layer-op-btn danger shadow-del', '削除');
      del.innerHTML = TS.ui.icon('trash');
      del.addEventListener('click', function () {
        cset(function (d) {
          if (i < d.shadows.length) d.shadows.splice(i, 1);
        });
      });
      head.appendChild(del);
      card.appendChild(head);

      function sset(fn) {
        return function (d, v) { if (d.shadows[i]) fn(d.shadows[i], v); };
      }
      card.appendChild(colorRow('色', cssToHex(sh.color), sset(function (s, v) { s.color = v; })));
      card.appendChild(slide(
        { label: 'X', min: LIM.shadowOffset[0], max: LIM.shadowOffset[1], step: 1, value: sh.x || 0 },
        sset(function (s, v) { s.x = v; })));
      card.appendChild(slide(
        { label: 'Y', min: LIM.shadowOffset[0], max: LIM.shadowOffset[1], step: 1, value: sh.y || 0 },
        sset(function (s, v) { s.y = v; })));
      card.appendChild(slide(
        { label: 'ぼかし', min: LIM.shadowBlur[0], max: LIM.shadowBlur[1], step: 1, value: sh.blur || 0 },
        sset(function (s, v) { s.blur = v; })));
      card.appendChild(slide(
        { label: '広がり', min: LIM.shadowSpread[0], max: LIM.shadowSpread[1], step: 1, value: sh.spread || 0 },
        sset(function (s, v) { s.spread = v; })));
      card.appendChild(slide(
        { label: '不透明度', min: LIM.opacity[0], max: LIM.opacity[1], step: 0.01,
          value: (typeof sh.opacity === 'number') ? sh.opacity : 1, format: pctFmt, unit: '%' },
        sset(function (s, v) { s.opacity = v; })));
      return card;
    }

    function buildShadowSection(scene) {
      var sec = el('section', 'design-section design-section-shadows');
      sec.appendChild(textEl('h2', 'section-title', 'ドロップシャドウ'));
      var list = el('div', 'shadow-list');
      (scene.shadows || []).forEach(function (sh, i) { list.appendChild(buildShadowCard(sh, i)); });
      sec.appendChild(list);
      var add = btn('option-btn shadow-add');
      add.innerHTML = TS.ui.icon('plus') + '<span>シャドウを追加</span>';
      add.addEventListener('click', function () {
        cset(function (d) {
          d.shadows.push({ color: '#000000', x: 0, y: 8, blur: 10, spread: 0, opacity: 0.35 });
        });
      });
      sec.appendChild(add);
      return sec;
    }

    // ---- 描画 -------------------------------------------------------------------
    function render() {
      var scene = TS.store.get();
      if (!scene) return;
      // 選択レイヤーが消えていたら解除
      if (state.selectedId && !findLayer(scene, state.selectedId)) state.selectedId = null;
      root.innerHTML = '';
      root.appendChild(buildLayerSection(scene));
      root.appendChild(buildShadowSection(scene));
    }

    // transient（スライダードラッグ中）は再描画しない＝操作中のコントロールを壊さない
    TS.store.subscribe(function (scene, meta) {
      if (meta && meta.transient) return;
      render();
    });
    render();

    return { el: root, render: render };
  }

  TS.panelDesign = { mount: mount };
})();
