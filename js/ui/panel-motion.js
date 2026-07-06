'use strict';
// TS.panelMotion — モーションタブ（契約書 §3.5 scene.motion v2 / §6.12）
// 登場（In）/ 退場（Out）/ ループ / 文字ごと（stagger）/ 表示時間 の5グループ。
// UIは TS.motion.PRESETS / TS.motion.EASINGS のメタデータからデータ駆動で生成する
// （プリセットidはハードコードしない）。
// スライダーは onInput=transient set / onCommit=commit（panel-design と同方式）。
// トグル・セグメント・チップは1操作=1履歴。store.subscribe で Undo 等の外部変更に追随。
(function () {
  window.TS = window.TS || {};

  // ---- パネル専用スタイル（app.css 未定義のチップ列・カードのみ。id付きで冪等注入） ----
  var STYLE_ID = 'tsPanelMotionCSS';
  var CSS = [
    /* ループカード等でグループが縦に伸びるため、開時の max-height を引き上げ */
    '.panel-motion .tuning-group.open .tuning-group-body{max-height:2400px;}',
    '.pm-note{font-size:11px;color:var(--text-dim);letter-spacing:.02em;padding:10px 0;}',
    '.pm-label{display:block;font-size:11px;color:var(--text-muted);letter-spacing:.04em;margin:12px 0 4px;}',
    '.pm-toggle-row{display:flex;padding:6px 0 2px;}',
    '.pm-toggle-row .option-btn{flex:0 0 auto;padding:7px 14px 7px 20px;}',
    /* flex-wrap のチップ列（プリセット・イージング・ループ選択）。option-btn を自然幅で並べる */
    '.pm-chips{display:flex;flex-wrap:wrap;gap:6px;margin:2px 0 4px;}',
    '.pm-chips .option-btn{flex:0 0 auto;padding:7px 12px;}',
    /* 選択中ループのパラメータカード（stop-row と同じ静かなカード作法） */
    '.pm-loop-card{background:var(--surface);border:1px solid var(--border-soft);border-radius:var(--radius-sm);padding:2px 10px 6px;margin:10px 0 0;}',
    '.pm-loop-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding-top:6px;}',
    '.pm-loop-title{font-size:11.5px;font-weight:500;color:var(--text);padding:2px 0 0;}',
    '.pm-loop-desc{margin-left:8px;font-size:10px;font-weight:400;color:var(--text-dim);}',
    /* 合計尺表示 */
    '.pm-total{padding:6px 0 2px;font-size:12px;color:var(--text-muted);text-align:right;font-variant-numeric:tabular-nums;}'
  ].join('\n');

  function injectCSS() {
    if (document.getElementById(STYLE_ID)) return;
    var st = document.createElement('style');
    st.id = STYLE_ID;
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  // ---- DOMヘルパ -----------------------------------------------------------
  function el(tag, cls) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    return e;
  }
  function textEl(tag, cls, text) {
    var e = el(tag, cls);
    e.textContent = text;
    return e;
  }
  function num(v, fb) { return (typeof v === 'number' && isFinite(v)) ? v : fb; }
  function clone(o) { return TS.scene.clone(o); }

  // ---- 表示フォーマット ------------------------------------------------------
  function fmt1(v) { return v.toFixed(1); }
  function fmt2(v) { return v.toFixed(2); }
  function fmtX(v) { return '×' + v.toFixed(1); }
  // 合計尺 '○.○秒' 表記（3.00→'3.0'、3.05→'3.05'）
  function fmtSec(v) {
    var s = (Math.round(v * 100) / 100).toFixed(2);
    if (s.charAt(s.length - 1) === '0') s = s.slice(0, -1);
    return s;
  }

  // ---- 既定値（契約書 §3.5 スキーマの既定。トグルONで直前値が無いときに使用） ----
  var DEFAULTS = {
    'in': { preset: 'pop', duration: 0.4, delay: 0, direction: 'up', easing: 'backOut', intensity: 1 },
    'out': { preset: 'fadeOut', duration: 0.3, delay: 0, direction: 'down', easing: 'easeIn', intensity: 1 }
  };
  var DIRECTIONS = [
    { value: 'up', label: '上' },
    { value: 'down', label: '下' },
    { value: 'left', label: '左' },
    { value: 'right', label: '右' }
  ];
  var LOOP_DEFAULT = { period: 3, intensity: 1 };  // ループを新規ONにしたときの既定

  // ---- グループアイコン（TS.ui.icon に該当図が無いもの。panel-design の RING_SVG と同作法） ----
  function svg(body) {
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" ' +
      'stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" ' +
      'aria-hidden="true">' + body + '</svg>';
  }
  var SVG_IN = svg('<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/>');
  var SVG_OUT = svg('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>');
  var SVG_LOOP = svg('<polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>');
  var SVG_CLOCK = svg('<circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 16 14"/>');

  // ---- mount -----------------------------------------------------------------
  function mount(container) {
    injectCSS();
    var root = el('div', 'panel-motion');
    container.appendChild(root);
    root.appendChild(textEl('h2', 'section-title', 'モーション'));

    // モーションエンジン未ロード（並行実装のため throw しない）
    if (!window.TS.motion || !TS.motion.PRESETS) {
      root.appendChild(textEl('div', 'pm-note', 'モーションエンジン未ロード'));
      return { el: root };
    }

    var PRESETS = TS.motion.PRESETS;
    var EASINGS = Array.isArray(TS.motion.EASINGS) ? TS.motion.EASINGS : [];

    // UIローカル状態: トグルOFF時に直前値を保持（ONに戻したとき復元）
    var last = { 'in': null, 'out': null };

    // ---- store ヘルパ --------------------------------------------------------
    function sceneNow() {
      var s = (TS.store && TS.store.get) ? TS.store.get() : null;
      return s || TS.scene.create();
    }
    function motionOf(scene) { return scene.motion || {}; }
    function motionDraft(d) {
      if (!d.motion || typeof d.motion !== 'object') d.motion = {};
      return d.motion;
    }
    function tset(fn) { TS.store.set(fn, { transient: true }); }
    function cset(fn) { TS.store.set(fn); }

    // ---- 共通部品 ------------------------------------------------------------
    // スライダー行（onInput=transient / onCommit=同値をtransient反映→commitで1履歴→再描画）
    function slide(o, apply) {
      return TS.ui.sliderRow({
        icon: null,
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
    function segRow(label, seg) {
      var row = el('div', 'seg-row');
      row.appendChild(textEl('span', 'seg-row-label', label));
      row.appendChild(seg);
      return row;
    }
    // flex-wrap チップ列。active はデータ駆動（クリック→store更新→再描画で反映）
    function chips(items, isActive, onPick) {
      var wrap = el('div', 'pm-chips');
      items.forEach(function (it) {
        var b = el('button', 'option-btn');
        b.type = 'button';
        b.textContent = it.label;
        var on = !!isActive(it.value);
        b.classList.toggle('active', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
        b.addEventListener('click', function () { onPick(it.value); });
        wrap.appendChild(b);
      });
      return wrap;
    }
    function presetMeta(list, id) {
      for (var i = 0; i < list.length; i++) if (list[i] && list[i].id === id) return list[i];
      return null;
    }

    // ---- 登場（In）/ 退場（Out）共通ビルダー -----------------------------------
    // motion[kind] のプロパティ書き込み用 apply
    function setInOut(kind, key) {
      return function (d, v) {
        var m = motionDraft(d)[kind];
        if (m && typeof m === 'object') m[key] = v;
      };
    }

    function renderInOut(kind, body) {
      body.textContent = '';
      var m = motionOf(sceneNow())[kind] || null;
      if (m) last[kind] = clone(m);   // 表示中の値を直前値として控える
      var def = DEFAULTS[kind];
      var list = Array.isArray(PRESETS[kind]) ? PRESETS[kind] : [];

      // 有効トグル（OFF→null / ON→直前値 or 既定）
      var togRow = el('div', 'pm-toggle-row');
      togRow.appendChild(TS.ui.toggle({
        label: (kind === 'in') ? '登場アニメを使う' : '退場アニメを使う',
        checked: !!m,
        onChange: function (on) {
          if (!on) {
            var cur = motionOf(sceneNow())[kind];
            if (cur) last[kind] = clone(cur);
          }
          cset(function (d) {
            motionDraft(d)[kind] = on ? clone(last[kind] || def) : null;
          });
        }
      }));
      body.appendChild(togRow);
      if (!m) return;   // 無効時はパラメータUIを畳む（非表示。契約7）

      // プリセット選択（ドロップダウン＝1画面の情報量を抑える。説明文で動きを予告）
      if (list.length) {
        body.appendChild(textEl('span', 'pm-label', 'プリセット'));
        body.appendChild(TS.ui.select({
          ariaLabel: (kind === 'in') ? '登場プリセット' : '退場プリセット',
          options: list.map(function (p) {
            return { value: p.id, label: p.name || p.id, desc: p.desc };
          }),
          value: m.preset,
          onChange: function (id) { cset(setBind(kind, 'preset', id)); }
        }));
      }

      var meta = presetMeta(list, m.preset);
      // 対応パラメータ判定（motion.js はフラットなフラグ。旧 params:{} 形式にもフォールバック）
      var params = {
        direction: !!(meta && (meta.direction || (meta.params && meta.params.direction))),
        intensity: !!(meta && (meta.intensity || (meta.params && meta.params.intensity)))
      };

      // 時間・遅延
      body.appendChild(slide(
        { label: '時間', min: 0.1, max: 2.0, step: 0.05, unit: 's',
          value: num(m.duration, def.duration), format: fmt2 },
        setInOut(kind, 'duration')));
      body.appendChild(slide(
        { label: '遅延', min: 0, max: 2, step: 0.05, unit: 's',
          value: num(m.delay, 0), format: fmt2 },
        setInOut(kind, 'delay')));

      // 方向（プリセットが direction 対応のときのみ）
      if (params.direction) {
        body.appendChild(segRow('方向', TS.ui.segment({
          options: DIRECTIONS,
          value: m.direction || def.direction,
          onChange: function (v) { cset(setBind(kind, 'direction', v)); }
        })));
      }

      // イージング（ドロップダウン）
      if (EASINGS.length) {
        var curEase = m.easing || (meta && meta.defaultEasing) || def.easing;
        body.appendChild(textEl('span', 'pm-label', 'イージング'));
        body.appendChild(TS.ui.select({
          ariaLabel: 'イージング',
          options: EASINGS.map(function (e) { return { value: e[0], label: e[1] || e[0] }; }),
          value: curEase,
          onChange: function (id) { cset(setBind(kind, 'easing', id)); }
        }));
      }

      // 強さ（プリセットが intensity 対応のときのみ）
      if (params.intensity) {
        body.appendChild(slide(
          { label: '強さ', min: 0.2, max: 3.0, step: 0.1,
            value: num(m.intensity, 1), format: fmtX },
          setInOut(kind, 'intensity')));
      }
    }
    // トグル・セグメント・チップ用: 1操作=1履歴の単一プロパティ書き込み
    function setBind(kind, key, v) {
      return function (d) {
        var m = motionDraft(d)[kind];
        if (m && typeof m === 'object') m[key] = v;
      };
    }

    // ---- ループ ---------------------------------------------------------------
    function loopArrOf(scene) {
      var arr = motionOf(scene).loop;
      return Array.isArray(arr) ? arr : [];
    }
    function loopEntry(d, id) {
      var arr = motionDraft(d).loop;
      if (!Array.isArray(arr)) return null;
      for (var i = 0; i < arr.length; i++) {
        if (arr[i] && arr[i].preset === id) return arr[i];
      }
      return null;
    }

    function renderLoop(body) {
      body.textContent = '';
      var arr = loopArrOf(sceneNow());
      var list = Array.isArray(PRESETS.loop) ? PRESETS.loop : [];

      // ドロップダウンから追加（未追加のものだけ列挙）。解除は各カードの削除ボタンで
      body.appendChild(textEl('span', 'pm-label', 'エフェクト（複数追加可）'));
      var activeIds = {};
      arr.forEach(function (e) { if (e && e.preset) activeIds[e.preset] = true; });
      var addable = list.filter(function (p) { return !activeIds[p.id]; });
      if (addable.length) {
        body.appendChild(TS.ui.select({
          ariaLabel: 'ループエフェクトを追加',
          placeholder: '＋ エフェクトを追加…',
          options: addable.map(function (p) {
            return { value: p.id, label: p.name || p.id, desc: p.desc };
          }),
          value: null,
          onChange: function (id) {
            cset(function (d) {
              var mo = motionDraft(d);
              if (!Array.isArray(mo.loop)) mo.loop = [];
              mo.loop.push({ preset: id, period: LOOP_DEFAULT.period, intensity: LOOP_DEFAULT.intensity });
              // 照りは見た目=シャインレイヤーとセット。無ければ最前面に自動生成（デザインタブからは管理しない）
              if (id === 'shine' && !d.layers.some(function (L) { return L && L.type === 'shine'; })) {
                d.layers.push({ id: TS.scene.newId('sh'), type: 'shine', visible: true,
                                angle: 105, band: 0.16, span: 2.5, opacity: 0.98 });
              }
            });
          }
        }));
      } else if (!list.length) {
        body.appendChild(textEl('div', 'pm-note', 'ループプリセットがありません'));
      }

      // 選択中ループのパラメータカード（period / intensity 対応時）
      arr.forEach(function (e) {
        if (!e || !e.preset) return;
        var meta = presetMeta(list, e.preset);
        var id = e.preset;
        var card = el('div', 'pm-loop-card');
        var head = el('div', 'pm-loop-head');
        var titleWrap = textEl('div', 'pm-loop-title', (meta && meta.name) || id);
        if (meta && meta.desc) titleWrap.appendChild(textEl('span', 'pm-loop-desc', meta.desc));
        head.appendChild(titleWrap);
        var del = el('button', 'layer-op-btn danger');
        del.type = 'button';
        del.setAttribute('aria-label', ((meta && meta.name) || id) + ' を解除');
        del.innerHTML = TS.ui.icon('trash');
        del.addEventListener('click', function () {
          cset(function (d) {
            var mo = motionDraft(d);
            if (Array.isArray(mo.loop)) {
              mo.loop = mo.loop.filter(function (x) { return !(x && x.preset === id); });
            }
          });
        });
        head.appendChild(del);
        card.appendChild(head);
        card.appendChild(slide(
          { label: '周期', min: 0.5, max: 6, step: 0.1, unit: 's',
            value: num(e.period, LOOP_DEFAULT.period), format: fmt1 },
          function (d, v) {
            var t = loopEntry(d, id);
            if (t) t.period = v;
          }));
        if (meta && (meta.intensity || (meta.params && meta.params.intensity))) {
          card.appendChild(slide(
            { label: '強さ', min: 0.2, max: 3.0, step: 0.1,
              value: num(e.intensity, 1), format: fmtX },
            function (d, v) {
              var t = loopEntry(d, id);
              if (t) t.intensity = v;
            }));
        }
        // 照りの見た目パラメータ（シャインレイヤーはデザインタブでなくここで管理する）
        if (id === 'shine') {
          var shLy = null;
          var lys = sceneNow().layers || [];
          for (var li = 0; li < lys.length; li++) {
            if (lys[li] && lys[li].type === 'shine') { shLy = lys[li]; break; }
          }
          function shineSet(key) {
            return function (d, v) {
              var LL = null;
              for (var k = 0; k < d.layers.length; k++) {
                if (d.layers[k] && d.layers[k].type === 'shine') { LL = d.layers[k]; break; }
              }
              if (LL) LL[key] = v;
            };
          }
          if (shLy) {
            card.appendChild(slide(
              { label: '角度', min: 0, max: 360, step: 1, unit: '°',
                value: num(shLy.angle, 105) }, shineSet('angle')));
            card.appendChild(slide(
              { label: '帯幅', min: 0.02, max: 0.6, step: 0.01,
                value: num(shLy.band, 0.16), format: fmt2 }, shineSet('band')));
            card.appendChild(slide(
              { label: '不透明度', min: 0, max: 1, step: 0.01,
                value: num(shLy.opacity, 0.98),
                format: function (v) { return Math.round(v * 100) + ''; }, unit: '%' },
              shineSet('opacity')));
          }
        }
        body.appendChild(card);
      });
    }

    // ---- 文字ごと（stagger） ----------------------------------------------------
    function staggerDraft(d) {
      var mo = motionDraft(d);
      if (!mo.stagger || typeof mo.stagger !== 'object') mo.stagger = { enabled: false };
      return mo.stagger;
    }

    function renderStagger(body) {
      body.textContent = '';
      var st = motionOf(sceneNow()).stagger || {};
      var togRow = el('div', 'pm-toggle-row');
      togRow.appendChild(TS.ui.toggle({
        label: '文字ごとに時間差',
        checked: !!st.enabled,
        onChange: function (on) {
          cset(function (d) { staggerDraft(d).enabled = on; });
        }
      }));
      body.appendChild(togRow);
      if (!st.enabled) return;  // 無効時はパラメータを畳む（In/Out と同じ作法）

      body.appendChild(segRow('単位', TS.ui.segment({
        options: [
          { value: 'char', label: '文字' },
          { value: 'word', label: '単語' },
          { value: 'line', label: '行' }
        ],
        value: (st.per === 'word' || st.per === 'line') ? st.per : 'char',
        onChange: function (v) {
          cset(function (d) { staggerDraft(d).per = v; });
        }
      })));
      body.appendChild(slide(
        { label: '間隔', min: 0.01, max: 0.3, step: 0.01, unit: 's',
          value: num(st.amount, 0.04), format: fmt2 },
        function (d, v) { staggerDraft(d).amount = v; }));
    }

    // ---- 表示時間（hold ＋ 合計尺） ----------------------------------------------
    var totalEl = null;
    function updateTotal() {
      if (!totalEl) return;
      var text = '合計 —';
      if (typeof TS.motion.timeline === 'function') {
        try {
          var tl = TS.motion.timeline(sceneNow());
          if (tl && typeof tl.D === 'number' && isFinite(tl.D)) {
            text = '合計 ' + fmtSec(tl.D) + '秒';
          }
        } catch (e) { /* エンジン側が未対応のシーンでは合計を非表示にする */ }
      }
      totalEl.textContent = text;
    }

    function renderTime(body) {
      body.textContent = '';
      var mo = motionOf(sceneNow());
      body.appendChild(slide(
        { label: '表示', min: 0.2, max: 8, step: 0.05, unit: 's',
          value: num(mo.hold, 2.55), format: fmt2 },
        function (d, v) { motionDraft(d).hold = v; }));
      totalEl = textEl('div', 'pm-total', '');
      body.appendChild(totalEl);
      updateTotal();
    }

    // ---- グループ骨格（開閉状態を保持するため一度だけ作り、body の中身のみ再描画） ----
    var inBody = el('div');
    var outBody = el('div');
    var loopBody = el('div');
    var stgBody = el('div');
    var timeBody = el('div');

    root.appendChild(TS.ui.group({ icon: SVG_IN, title: '登場（In）', open: true, body: inBody }));
    root.appendChild(TS.ui.group({ icon: SVG_OUT, title: '退場（Out）', open: false, body: outBody }));
    root.appendChild(TS.ui.group({ icon: SVG_LOOP, title: 'ループ', open: false, body: loopBody }));
    root.appendChild(TS.ui.group({ icon: 'type', title: '文字ごと（stagger）', open: false, body: stgBody }));
    root.appendChild(TS.ui.group({ icon: SVG_CLOCK, title: '表示時間', open: false, body: timeBody }));

    // ---- 描画 -------------------------------------------------------------------
    function render() {
      renderInOut('in', inBody);
      renderInOut('out', outBody);
      renderLoop(loopBody);
      renderStagger(stgBody);
      renderTime(timeBody);
    }

    // transient（自分のスライダードラッグ中）は再描画しない＝操作中のコントロールを壊さない。
    // 合計尺のみテキスト更新（変更のたび追随。panel-text / panel-design と同方式）
    TS.store.subscribe(function (scene, meta) {
      if (meta && meta.transient) { updateTotal(); return; }
      render();
    });
    render();

    return { el: root, render: render };
  }

  TS.panelMotion = { mount: mount };
})();
