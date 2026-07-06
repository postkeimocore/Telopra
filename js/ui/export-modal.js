'use strict';
/* TS.uiExport — 書き出しモーダル（仕様書7章）
   形式ごとに「用途 / 崩れなさ / 制約」を1行明示（ハルシネーション厳禁の実現性区分をUIに反映）。
   進捗表示・キャンセル対応。 */
(function () {
  window.TS = window.TS || {};

  var FORMATS = [
    { id: 'mov', name: '透過ムービー', ext: '.mov', badge: '推奨',
      desc: 'ProRes 4444（アルファ付き）。Premiere / AE / CapCut / DaVinci にそのまま載せて崩れない。容量大・生成に時間。',
      video: true },
    { id: 'png', name: 'PNG連番', ext: '.zip',
      desc: 'アルファ付きPNGのzip。全効果保持でどのソフトでも読める保険。ファイル数・容量は多い。',
      video: true },
    { id: 'webm', name: '透過WebM', ext: '.webm',
      desc: 'VP9＋アルファ。Web埋め込み・CapCut向けに軽量。Premiere/AEは非対応なので透過movを使う。',
      video: true },
    { id: 'gif', name: 'GIFアニメ', ext: '.gif',
      desc: '手軽に共有できる。動きは再現されるが透過は1bitで縁がギザつく（仕様上の制約）。',
      video: true },
    { id: 'lottie', name: 'Lottie', ext: '.json',
      desc: '軽量・AEで編集可（テキストレイヤー）。ただし近似: 塗りは単色化・縁1本・ブロック単位の動きのみ。リッチ表現は透過movを。',
      video: false },
    { id: 'css', name: 'CSS', ext: '.css',
      desc: 'Webにコピペで貼れる（HTML片＋@keyframes）。ブラウザ上は完全再現。編集ソフトには読み込めない。',
      video: false },
    { id: 'html', name: 'HTML（1ファイル）', ext: '.html',
      desc: '単体で開ける自己完結ファイル。確認・納品・Web埋め込みに。ブラウザ上は完全再現。',
      video: false }
  ];

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function btn(cls, label) {
    var b = document.createElement('button');
    b.type = 'button';
    if (cls) b.className = cls;
    if (label != null) b.textContent = label;
    return b;
  }
  function stamp() {
    var d = new Date();
    function p(n) { return ('0' + n).slice(-2); }
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes());
  }
  function download(data, mime, filename) {
    var blob = (data instanceof Blob) ? data : new Blob([data], { type: mime });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 30000);
    return blob.size;
  }
  function fmtBytes(n) {
    if (n > 1024 * 1024) return (Math.round(n / 1024 / 1024 * 10) / 10) + ' MB';
    if (n > 1024) return Math.round(n / 1024) + ' KB';
    return n + ' B';
  }
  function period(scene) {
    // P2: 尺 = モーションタイムライン全長 D（in+hold+out）
    if (TS.motion && TS.motion.timeline) {
      try { return TS.motion.timeline(scene).D; } catch (e) { /* fallthrough */ }
    }
    return (scene.motion && scene.motion.loop && scene.motion.loop[0] &&
            scene.motion.loop[0].period) || 3;
  }

  function mount() {
    // UIローカル状態
    var st = { format: 'mov', fps: 30, loops: 1, scalePct: 100, bg: 'transparent', bgColor: '#00ff00' };
    var running = null;   // { abort: AbortController, doneCb }
    var modal = null;

    function close() {
      if (running) return; // 実行中は×から直接閉じさせない（キャンセル経由）
      if (modal) { modal.remove(); modal = null; }
      document.removeEventListener('keydown', onKey, true);
    }
    function onKey(e) {
      if (e.key === 'Escape') { e.stopPropagation(); if (!running) close(); }
    }

    function open() {
      if (modal) return;
      modal = el('div', 'app-modal export-modal');
      modal.setAttribute('role', 'dialog');
      modal.setAttribute('aria-modal', 'true');
      var backdrop = el('div', 'app-modal-backdrop');
      backdrop.addEventListener('click', function () { if (!running) close(); });
      var content = el('div', 'app-modal-content export-modal-content');

      var head = el('div', 'app-modal-head');
      head.appendChild(el('h3', 'app-modal-title', '書き出し'));
      var x = btn('app-modal-close');
      x.innerHTML = TS.ui.icon('x');
      x.setAttribute('aria-label', '閉じる');
      x.addEventListener('click', function () { if (!running) close(); });
      head.appendChild(x);

      var body = el('div', 'app-modal-body export-body');
      content.appendChild(head);
      content.appendChild(body);
      modal.appendChild(backdrop);
      modal.appendChild(content);
      document.body.appendChild(modal);
      document.addEventListener('keydown', onKey, true);
      renderBody(body);
    }

    function renderBody(body) {
      body.innerHTML = '';
      var scene = TS.store.get();

      // ---- 形式カード ----
      var cards = el('div', 'export-cards');
      FORMATS.forEach(function (f) {
        var c = btn('export-card' + (st.format === f.id ? ' active' : ''));
        c.setAttribute('aria-pressed', st.format === f.id ? 'true' : 'false');
        var head = el('div', 'export-card-head');
        head.appendChild(el('span', 'export-card-name', f.name));
        head.appendChild(el('span', 'export-card-ext', f.ext));
        if (f.badge) head.appendChild(el('span', 'export-card-badge', f.badge));
        c.appendChild(head);
        c.appendChild(el('div', 'export-card-desc', f.desc));
        if ((f.id === 'mov' || f.id === 'webm') && !TS.exportMovie.available()) {
          c.disabled = true;
          c.appendChild(el('div', 'export-card-note',
            'file:// では書き出せません。node .claude/serve.mjs 等の http で開くと有効になります。'));
        }
        c.addEventListener('click', function () { st.format = f.id; renderBody(body); });
        cards.appendChild(c);
      });
      body.appendChild(cards);

      var fdef = FORMATS.filter(function (f) { return f.id === st.format; })[0];

      // ---- 設定（動画系のみ） ----
      if (fdef.video) {
        var set = el('div', 'export-settings');
        function segRow(label, node) {
          var r = el('div', 'seg-row');
          r.appendChild(el('span', 'seg-row-label', label));
          r.appendChild(node);
          return r;
        }
        set.appendChild(segRow('fps', TS.ui.segment({
          options: [{ value: 24, label: '24' }, { value: 30, label: '30' }, { value: 60, label: '60' }],
          value: st.fps,
          onChange: function (v) { st.fps = +v; renderBody(body); }
        })));
        set.appendChild(segRow('ループ', TS.ui.segment({
          options: [{ value: 1, label: '1回' }, { value: 2, label: '2回' }, { value: 3, label: '3回' }],
          value: st.loops,
          onChange: function (v) { st.loops = +v; renderBody(body); }
        })));
        set.appendChild(segRow('解像度', TS.ui.segment({
          options: [{ value: 100, label: '100%' }, { value: 75, label: '75%' }, { value: 50, label: '50%' }],
          value: st.scalePct,
          onChange: function (v) { st.scalePct = +v; renderBody(body); }
        })));
        var bgOpts = [{ value: 'transparent', label: '透過' }, { value: '#000000', label: '黒' },
                      { value: '#ffffff', label: '白' }, { value: 'custom', label: '指定色' }];
        var bgSeg = TS.ui.segment({
          options: bgOpts, value: st.bg,
          onChange: function (v) { st.bg = v; renderBody(body); }
        });
        set.appendChild(segRow('背景', bgSeg));
        if (st.bg === 'custom') {
          set.appendChild(segRow('背景色', TS.ui.colorInput({
            value: st.bgColor,
            onInput: function (v) { st.bgColor = v; },
            onCommit: function (v) { st.bgColor = v; }
          })));
        }
        // サマリー（尺・フレーム数・出力解像度）
        var per = period(scene);
        var dur = per * st.loops;
        var frames = Math.round(dur * st.fps);
        var w = Math.round(scene.canvas.w * st.scalePct / 100);
        var h = Math.round(scene.canvas.h * st.scalePct / 100);
        set.appendChild(el('div', 'export-summary',
          w + '×' + h + ' / ' + dur + '秒 / ' + frames + 'フレーム' +
          (st.format === 'gif' && st.bg === 'transparent' ? '（GIFの透過は1bit）' : '')));
        body.appendChild(set);
      }

      // ---- 実行 ----
      var actions = el('div', 'export-actions');
      var run = btn('export-run', fdef.video ? '書き出す' : (st.format === 'css' ? 'CSSを生成' : 'HTMLを生成'));
      run.addEventListener('click', function () { execute(body, run); });
      actions.appendChild(run);
      body.appendChild(actions);

      // ---- 進捗プレースホルダ ----
      body.appendChild(el('div', 'export-progress-slot'));
    }

    // 進捗UI
    function progressUI(slot, onCancel) {
      slot.innerHTML = '';
      var box = el('div', 'export-progress');
      var label = el('div', 'export-progress-label', '準備中…');
      var barWrap = el('div', 'export-progress-bar');
      var bar = el('div', 'export-progress-fill');
      barWrap.appendChild(bar);
      var cancel = btn('app-modal-btn app-modal-btn-secondary', 'キャンセル');
      cancel.addEventListener('click', onCancel);
      box.appendChild(label);
      box.appendChild(barWrap);
      box.appendChild(cancel);
      slot.appendChild(box);
      return {
        set: function (phase, ratio) {
          if (phase != null) label.textContent = phase;
          if (ratio != null) bar.style.width = Math.round(ratio * 100) + '%';
        },
        done: function (msg) {
          box.classList.add('done');
          label.textContent = msg;
          bar.style.width = '100%';
          cancel.textContent = '閉じる';
        },
        fail: function (msg) {
          box.classList.add('fail');
          label.textContent = msg;
          cancel.textContent = '閉じる';
        }
      };
    }

    function execute(body, runBtn) {
      var scene = TS.scene.clone(TS.store.get());
      var slot = body.querySelector('.export-progress-slot');
      var name = 'telop_' + stamp();

      // 即時系（CSS / HTML）
      if (st.format === 'css') {
        var css = TS.exportCSS.cssText(scene);
        var htmlPiece = TS.exportCSS.markupHTML(scene);
        showTextResult(slot, 'CSS（@keyframes等）と HTML片。コピーまたはダウンロードして使用。',
          css + '\n/* ---- HTML片（bodyに貼る） ---- */\n' + htmlPiece,
          function () { download(css, 'text/css', name + '.css'); });
        return;
      }
      if (st.format === 'html') {
        var doc = TS.exportCSS.htmlDocument(scene);
        var size = download(doc, 'text/html', name + '.html');
        var p0 = progressUI(slot, close);
        p0.done('ダウンロードしました（' + fmtBytes(size) + '）。ダブルクリックで開けます。?bg=dark で背景確認。');
        return;
      }
      if (st.format === 'lottie') {
        var lr = TS.exportLottie.build(scene);
        var lsize = download(JSON.stringify(lr.json), 'application/json', name + '.json');
        var pl = progressUI(slot, close);
        pl.done('Lottie JSONをダウンロードしました（' + fmtBytes(lsize) + '）。' +
          (lr.notes.length ? '\n近似される内容: ' + lr.notes.join(' / ') : ''));
        return;
      }

      // 動画系
      runBtn.disabled = true;
      var abort = new AbortController();
      running = { abort: abort };
      var p = progressUI(slot, function () {
        if (running) {
          abort.abort();
          if (st.format === 'mov' || st.format === 'webm') TS.exportMovie.cancel();
          running = null;
          runBtn.disabled = false;
          p.fail('キャンセルしました');
        } else { close(); }
      });

      var per = period(scene);
      var opts = {
        fps: st.fps,
        duration: per * st.loops,
        scale: st.scalePct / 100,
        background: st.bg === 'transparent' ? null : (st.bg === 'custom' ? st.bgColor : st.bg),
        format: st.format === 'gif' ? 'rgba' : 'png',
        signal: abort.signal,
        onProgress: function (done, total) {
          p.set('フレームを描画中 ' + done + ' / ' + total, done / total * (st.format === 'mov' ? 0.35 : 0.6));
        }
      };

      TS.exportFrames.run(scene, opts).then(function (res) {
        if (st.format === 'png') {
          p.set('zipを作成中…', 0.8);
          var zw = TS.exportZip.create();
          return Promise.all(res.frames.map(function (b) { return b.arrayBuffer(); })).then(function (bufs) {
            bufs.forEach(function (ab, i) {
              zw.add('frames/f' + ('0000' + i).slice(-4) + '.png', new Uint8Array(ab));
            });
            zw.add('README.txt', new TextEncoder().encode(
              'Telopra PNG連番書き出し\n' +
              res.width + 'x' + res.height + ' / ' + res.fps + 'fps / ' + res.count + 'frames (アルファ付き)\n' +
              'Premiere: ファイル→読み込み→f0000.pngを選択し「画像シーケンス」にチェック\n'));
            var zip = zw.finish();
            var size = download(zip, 'application/zip', name + '_png.zip');
            finish('PNG連番zipをダウンロードしました（' + fmtBytes(size) + '）');
          });
        }
        if (st.format === 'gif') {
          p.set('GIFにエンコード中…', 0.6);
          return new Promise(function (resolve) { setTimeout(resolve, 0); }).then(function () {
            var gif = TS.exportGif.encode(res.frames, {
              fps: res.fps, loop: 0,
              transparent: st.bg === 'transparent',
              background: st.bg === 'transparent' ? null : (st.bg === 'custom' ? st.bgColor : st.bg),
              onProgress: function (r) {
                if (abort.signal.aborted) return;
                p.set('GIFにエンコード中 ' + Math.round(r * 100) + '%', 0.6 + r * 0.4);
              }
            });
            var size = download(gif, 'image/gif', name + '.gif');
            finish('GIFをダウンロードしました（' + fmtBytes(size) + '）');
          });
        }
        // mov / webm（フェーズごとに全体バーの区間へ写像: フレーム描画0-35% → load35-50 → write50-60 → encode60-100）
        var isWebm = (st.format === 'webm');
        var PHASE_RANGE = { load: [0.35, 0.5], write: [0.5, 0.6], encode: [0.6, 1.0] };
        var curPhase = 'load';
        var encOpts = {
          fps: res.fps,
          signal: abort.signal,
          onPhase: function (ph) {
            curPhase = ph;
            var map = { load: 'エンコーダを準備中（初回のみ約31MB）…', write: 'フレームを転送中…',
                        encode: (isWebm ? 'VP9(WebM)' : 'ProRes 4444') + ' にエンコード中…' };
            var rg = PHASE_RANGE[ph];
            p.set(map[ph] || ph, rg ? rg[0] : null);
          },
          onProgress: function (r) {
            if (r == null) return;
            var rg = PHASE_RANGE[curPhase] || [0.35, 1];
            p.set(null, rg[0] + Math.max(0, Math.min(1, r)) * (rg[1] - rg[0]));
          }
        };
        if (isWebm) {
          return TS.exportMovie.encodeWebM(res.frames, encOpts).then(function (bytes) {
            var size = download(bytes, 'video/webm', name + '.webm');
            finish('透過WebMをダウンロードしました（' + fmtBytes(size) + '）。Web/CapCutへ。');
          });
        }
        return TS.exportMovie.encodeProRes(res.frames, encOpts).then(function (bytes) {
          var size = download(bytes, 'video/quicktime', name + '.mov');
          finish('透過movをダウンロードしました（' + fmtBytes(size) + '）。編集ソフトの上トラックへ。');
        });
      }).catch(function (e) {
        if (e && e.name === 'AbortError') return; // キャンセル表示済み
        console.error(e);
        p.fail('失敗: ' + (e && e.message || e));
        running = null;
        runBtn.disabled = false;
      });

      function finish(msg) {
        running = null;
        runBtn.disabled = false;
        p.done(msg);
      }
    }

    // CSS用のテキスト結果表示（コピー＋ダウンロード）
    function showTextResult(slot, note, text, onDownload) {
      slot.innerHTML = '';
      var box = el('div', 'export-progress done');
      box.appendChild(el('div', 'export-progress-label', note));
      var ta = document.createElement('textarea');
      ta.className = 'export-textarea';
      ta.value = text;
      ta.readOnly = true;
      ta.rows = 8;
      box.appendChild(ta);
      var row = el('div', 'export-actions');
      var copy = btn('app-modal-btn app-modal-btn-primary', 'コピー');
      copy.addEventListener('click', function () {
        (navigator.clipboard ? navigator.clipboard.writeText(ta.value)
          : Promise.reject()).then(function () { copy.textContent = 'コピーしました'; })
          .catch(function () { ta.select(); document.execCommand('copy'); copy.textContent = 'コピーしました'; });
      });
      var dl = btn('app-modal-btn app-modal-btn-secondary', '.cssをダウンロード');
      dl.addEventListener('click', onDownload);
      row.appendChild(copy);
      row.appendChild(dl);
      box.appendChild(row);
      slot.appendChild(box);
    }

    return { open: open, close: close };
  }

  TS.uiExport = { mount: mount };
})();
