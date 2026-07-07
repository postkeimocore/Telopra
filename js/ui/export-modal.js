'use strict';
/* TS.uiExport — 書き出しモーダル（仕様書7章 + v2拡張）
   v2追加:
   - §5-2 「どこで使う?」用途導線（📱iPhone=APNG / 💻PC=PNG連番 / 💻Mac CapCut=WebM / 🌐Web=CSS/HTML）
   - §5-1 APNG（動くPNG。iPhone本命・GIF上位互換）
   - §5-2 ProRes(mov)は「非推奨」に格下げ（Apple環境でα黒化）
   - §1  書き出し解像度プリセット / 倍率1x2x4x / モード（フルフレーム/トリミング）
   - §3-6 モーション速度倍率
   - §3-5 設定モーダルと進捗/完了モーダルを分離
   - §3-9 README人間可読（TS.exportReadme）
   - §2  runForScene(scene,opts) を公開（バッチ書き出しが1件ずつ呼ぶ） */
(function () {
  window.TS = window.TS || {};

  // ---- 形式定義（video:true=フレーム生成が要る。deprecated=既定導線に出さない） ----
  var FORMATS = [
    { id: 'apng', name: 'APNG（動くPNG）', ext: '.png', badge: 'iPhone◎',
      desc: 'iPhoneのCapCut/Premiereアプリに「画像」として透過付きで載る。GIFの上位互換（フルカラー＋なめらか透過）。', video: true },
    { id: 'png', name: 'PNG連番', ext: '.zip',
      desc: 'アルファ付きPNGのzip。全効果保持でどのソフトでも読める最高品質。ファイル数・容量は多い。', video: true },
    { id: 'webm', name: '透過WebM', ext: '.webm',
      desc: 'VP9＋アルファ。Mac版CapCut・Web埋め込み向けに軽量・透過。Premiere/AEは非対応。', video: true },
    { id: 'gif', name: 'GIFアニメ', ext: '.gif',
      desc: '超レガシー環境用の保険。動くが透過は1bitで縁がギザつき・256色でグラデにバンディング。APNGが使えるならAPNGを。', video: true },
    { id: 'lottie', name: 'Lottie', ext: '.json',
      desc: '軽量・AEで編集可（テキストレイヤー）。ただし近似: 塗りは単色化・縁1本・ブロック単位の動きのみ。', video: false },
    { id: 'css', name: 'CSS', ext: '.css',
      desc: 'Webにコピペで貼れる（HTML片＋@keyframes）。ブラウザ上は完全再現。編集ソフトには読めない。', video: false },
    { id: 'html', name: 'HTML（1ファイル）', ext: '.html',
      desc: '単体で開ける自己完結ファイル。確認・納品・Web埋め込みに。ブラウザ上は完全再現。', video: false },
    { id: 'mov', name: '透過ムービー（ProRes）', ext: '.mov', deprecated: true,
      desc: '⚠️非推奨: Apple Silicon＋macOS14.4以降でアルファが黒背景化する不具合あり（OSレベル）。透過WebMかPNG連番を推奨。', video: true }
  ];

  // §5-2 用途導線（迷わせず「使う場所」で最適形式を決める）
  var USECASES = [
    { id: 'iphone', icon: 'smartphone', label: 'iPhoneで編集', sub: 'CapCut / Premiereアプリ', rec: 'apng', note: '動く・透過○・高画質' },
    { id: 'pc', icon: 'monitor', label: 'PCで編集', sub: 'Premiere / AE / Resolve', rec: 'png', note: '最高品質・完全透過' },
    { id: 'capcut', icon: 'film', label: 'Mac版CapCut', sub: '', rec: 'webm', note: '高品質・透過○・軽量' },
    { id: 'web', icon: 'globe', label: 'Web / サイト埋め込み', sub: '', rec: 'css', note: 'コードで完全再現' }
  ];

  // §1 解像度プリセット（w/h=null は現在のプレビュー解像度を使う）
  var RES_PRESETS = [
    { key: 'scene', label: 'プレビューと同じ', w: null, h: null },
    { key: 'v916', label: '縦9:16 1080×1920', w: 1080, h: 1920 },
    { key: 'v916_4k', label: '縦9:16 4K 2160×3840', w: 2160, h: 3840 },
    { key: 'h169', label: '横16:9 1920×1080', w: 1920, h: 1080 },
    { key: 'h169_4k', label: '横16:9 4K 3840×2160', w: 3840, h: 2160 },
    { key: 'sq', label: '正方1:1 1080×1080', w: 1080, h: 1080 },
    { key: 'v45', label: '縦4:5 1080×1350', w: 1080, h: 1350 }
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
  // テキストをファイル名に使える形へ（日本語は保持・記号や空白は_・最大16字）
  function slugText(s) {
    return (s || '').replace(/[\s\/\\:*?"<>|.]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '').slice(0, 16) || 'telop';
  }
  // 書き出しごとに固有のベース名（複数テロップをPremiere等で別クリップとして読み込むため）
  function pngBase(scene) {
    var rnd = Math.random().toString(36).slice(2, 6);
    return slugText(scene && scene.text && scene.text.content) + '_' + stamp() + '_' + rnd;
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
    if (TS.motion && TS.motion.timeline) {
      try { return TS.motion.timeline(scene).D; } catch (e) { /* fallthrough */ }
    }
    return (scene.motion && scene.motion.loop && scene.motion.loop[0] &&
            scene.motion.loop[0].period) || 3;
  }
  // opts.bg('transparent'|'custom'|'#hex') → 実際の背景色（null=透過）。trim時は常に透過。
  function bgValue(opts) {
    if (opts.mode === 'trim') return null;
    if (opts.bg === 'transparent') return null;
    return opts.bg === 'custom' ? opts.bgColor : opts.bg;
  }
  // 書き出し用シーン（解像度上書き。§1）。元シーンは壊さない。
  function exportScene(scene, opts) {
    var s = TS.scene.clone(scene);
    if (opts.resW && opts.resH) { s.canvas.w = opts.resW; s.canvas.h = opts.resH; }
    s.canvas.fps = opts.fps || s.canvas.fps || 30;
    return s;
  }

  /* runForScene(scene, opts) -> Promise<{ message, size }>
     1シーンを指定形式で書き出して download する純関数（§2バッチが1件ずつ呼ぶ）。
     opts: { format, fps, loops, resW, resH, scaleMult, mode('full'|'trim'), speed,
             bg('transparent'|'custom'|'#hex'), bgColor, signal, onProgress(ratio,label), onPhase(label) }
     ※ フレーム描画は decisive Canvas経路（TS.exportFrames.run→TS.renderCanvas）のみ。 */
  function runForScene(scene, opts) {
    opts = opts || {};
    var fmt = opts.format;
    var prog = opts.onProgress || function () {};
    var scn = exportScene(scene, opts);

    // ---- 即時系（フレーム生成なし） ----
    if (fmt === 'css') {
      var css = TS.exportCSS.cssText(scn);
      var html = TS.exportCSS.markupHTML(scn);
      var sz = download(css + '\n/* ---- HTML片（bodyに貼る） ---- */\n' + html, 'text/css', pngBase(scn) + '.css');
      return Promise.resolve({ message: 'CSS＋HTML片をダウンロードしました（' + fmtBytes(sz) + '）', size: sz });
    }
    if (fmt === 'html') {
      var doc = TS.exportCSS.htmlDocument(scn);
      var sz2 = download(doc, 'text/html', pngBase(scn) + '.html');
      return Promise.resolve({ message: 'HTMLをダウンロードしました（' + fmtBytes(sz2) + '）。ダブルクリックで開けます。', size: sz2 });
    }
    if (fmt === 'lottie') {
      var lr = TS.exportLottie.build(scn);
      var sz3 = download(JSON.stringify(lr.json), 'application/json', pngBase(scn) + '.json');
      return Promise.resolve({ message: 'Lottie JSONをダウンロードしました（' + fmtBytes(sz3) + '）' +
        (lr.notes && lr.notes.length ? '\n近似: ' + lr.notes.join(' / ') : ''), size: sz3 });
    }

    // ---- 動画系（フレーム生成あり） ----
    var framesFmt = (fmt === 'apng' || fmt === 'gif') ? 'rgba' : 'png';
    var isMovie = (fmt === 'mov' || fmt === 'webm');
    // 進捗の全体マッピング（mov/webmはエンコードが重いのでフレーム描画を前半に寄せる）
    var FRAME_TOP = isMovie ? 0.35 : (fmt === 'apng' ? 0.7 : 0.6);

    var frameOpts = {
      fps: opts.fps,
      loops: opts.loops || 1,
      scale: opts.scaleMult || 1,
      speed: opts.speed || 1,
      trim: opts.mode === 'trim',
      background: bgValue(opts),
      format: framesFmt,
      signal: opts.signal,
      onProgress: function (done, total) { prog(done / total * FRAME_TOP, 'フレームを描画中 ' + done + ' / ' + total); }
    };

    return TS.exportFrames.run(scn, frameOpts).then(function (res) {
      if (fmt === 'apng') {
        prog(0.85, 'APNGに結合中…');
        if (!TS.exportApng || !TS.exportApng.available()) {
          throw new Error('APNGエンコーダを読み込めませんでした（vendor/upng）');
        }
        var bytes = TS.exportApng.encode(res.frames, { fps: res.fps });
        if (opts.signal && opts.signal.aborted) throw new DOMException('キャンセルしました', 'AbortError');
        var size = download(bytes, 'image/png', pngBase(scn) + '.png');
        return { message: 'APNGをダウンロードしました（' + fmtBytes(size) + '・' + res.width + '×' + res.height + '・' +
          res.fps + 'fps・' + res.count + '枚）。iPhoneのCapCut等に画像として読み込めます。', size: size };
      }
      if (fmt === 'png') {
        prog(0.85, 'zipを作成中…');
        var zw = TS.exportZip.create();
        var pbase = pngBase(scn);
        return Promise.all(res.frames.map(function (b) { return b.arrayBuffer(); })).then(function (bufs) {
          bufs.forEach(function (ab, i) {
            zw.add(pbase + '/' + pbase + '_' + ('0000' + i).slice(-4) + '.png', new Uint8Array(ab));
          });
          var readme = (TS.exportReadme && TS.exportReadme.buildReadme)
            ? TS.exportReadme.buildReadme(scn) : '';
          zw.add(pbase + '/README.txt', new TextEncoder().encode(
            readme + '\n' +
            '― 書き出し情報 ―\n' +
            res.width + '×' + res.height + ' / ' + res.fps + 'fps / ' + res.count + '枚（アルファ付き）\n' +
            'Premiere: ファイル→読み込み→ ' + pbase + '_0000.png を選び「画像シーケンス」にチェック\n' +
            '※フォルダ名・ファイル名は書き出しごとに固有。複数テロップを別クリップとして重ねられます\n'));
          if (opts.signal && opts.signal.aborted) throw new DOMException('キャンセルしました', 'AbortError');
          var zip = zw.finish();
          var size = download(zip, 'application/zip', pbase + '.zip');
          return { message: 'PNG連番zipをダウンロードしました（' + fmtBytes(size) + '）', size: size };
        });
      }
      if (fmt === 'gif') {
        prog(0.65, 'GIFにエンコード中…');
        return new Promise(function (r) { setTimeout(r, 0); }).then(function () {
          var gif = TS.exportGif.encode(res.frames, {
            fps: res.fps, loop: 0,
            transparent: bgValue(opts) == null,
            background: bgValue(opts),
            onProgress: function (r2) {
              if (opts.signal && opts.signal.aborted) return;
              prog(0.6 + r2 * 0.4, 'GIFにエンコード中 ' + Math.round(r2 * 100) + '%');
            }
          });
          if (opts.signal && opts.signal.aborted) throw new DOMException('キャンセルしました', 'AbortError');
          var size = download(gif, 'image/gif', pngBase(scn) + '.gif');
          return { message: 'GIFをダウンロードしました（' + fmtBytes(size) + '）', size: size };
        });
      }
      // mov / webm
      var isWebm = (fmt === 'webm');
      var PHASE_RANGE = { load: [0.35, 0.5], write: [0.5, 0.6], encode: [0.6, 1.0] };
      var curPhase = 'load';
      var encOpts = {
        fps: res.fps, signal: opts.signal,
        onPhase: function (ph) {
          curPhase = ph;
          var map = { load: 'エンコーダを準備中（初回のみ約31MB）…', write: 'フレームを転送中…',
                      encode: (isWebm ? 'VP9(WebM)' : 'ProRes 4444') + ' にエンコード中…' };
          if (opts.onPhase) opts.onPhase(map[ph] || ph);
          var rg = PHASE_RANGE[ph];
          prog(rg ? rg[0] : FRAME_TOP, map[ph] || ph);
        },
        onProgress: function (r3) {
          if (r3 == null) return;
          var rg = PHASE_RANGE[curPhase] || [0.35, 1];
          prog(rg[0] + Math.max(0, Math.min(1, r3)) * (rg[1] - rg[0]), null);
        }
      };
      if (isWebm) {
        return TS.exportMovie.encodeWebM(res.frames, encOpts).then(function (bytes) {
          var size = download(bytes, 'video/webm', pngBase(scn) + '.webm');
          return { message: '透過WebMをダウンロードしました（' + fmtBytes(size) + '）。Web/Mac版CapCutへ。', size: size };
        });
      }
      return TS.exportMovie.encodeProRes(res.frames, encOpts).then(function (bytes) {
        var size = download(bytes, 'video/quicktime', pngBase(scn) + '.mov');
        return { message: '透過movをダウンロードしました（' + fmtBytes(size) + '）。⚠️Apple環境ではα黒化に注意。', size: size };
      });
    });
  }

  // ---- 進捗/完了モーダル（§3-5: 設定モーダルとは別枠） ----
  function progressModal() {
    var running = null;   // { abort }
    var modal = el('div', 'app-modal export-modal');
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    var backdrop = el('div', 'app-modal-backdrop');
    var content = el('div', 'app-modal-content export-modal-content');
    var head = el('div', 'app-modal-head');
    head.appendChild(el('h3', 'app-modal-title', '書き出し'));
    var x = btn('app-modal-close');
    x.innerHTML = TS.ui.icon('x');
    x.setAttribute('aria-label', '閉じる');
    head.appendChild(x);
    var body = el('div', 'app-modal-body export-body');
    var slot = el('div', 'export-progress-slot');
    body.appendChild(slot);
    content.appendChild(head);
    content.appendChild(body);
    modal.appendChild(backdrop);
    modal.appendChild(content);

    function close() {
      if (running) return;
      if (modal.parentNode) modal.parentNode.removeChild(modal);
      document.removeEventListener('keydown', onKey, true);
    }
    function onKey(e) { if (e.key === 'Escape') { e.stopPropagation(); if (!running) close(); } }
    x.addEventListener('click', close);
    backdrop.addEventListener('click', close);
    document.body.appendChild(modal);
    document.addEventListener('keydown', onKey, true);

    // 進捗UI
    var pbox = el('div', 'export-progress');
    var label = el('div', 'export-progress-label', '準備中…');
    var barWrap = el('div', 'export-progress-bar');
    var bar = el('div', 'export-progress-fill');
    barWrap.appendChild(bar);
    var cancel = btn('app-modal-btn app-modal-btn-secondary', 'キャンセル');
    pbox.appendChild(label); pbox.appendChild(barWrap); pbox.appendChild(cancel);
    slot.appendChild(pbox);

    // ボタンは「実行中＝キャンセル / 完了・失敗後＝閉じる」を1つのリスナで振り分け（付け替えないため誤動作しない）
    var cancelHandler = null;
    cancel.addEventListener('click', function () {
      if (running && cancelHandler) cancelHandler();
      else close();
    });

    var ui = {
      setRunning: function (r) { running = r; },
      set: function (msg, ratio) {
        if (msg != null) label.textContent = msg;
        if (ratio != null) bar.style.width = Math.round(ratio * 100) + '%';
      },
      done: function (msg) { pbox.classList.add('done'); label.textContent = msg; bar.style.width = '100%'; cancel.textContent = '閉じる'; running = null; },
      fail: function (msg) { pbox.classList.add('fail'); label.textContent = msg; cancel.textContent = '閉じる'; running = null; },
      onCancel: function (fn) { cancelHandler = fn; },
      close: close, slot: slot
    };
    return ui;
  }

  function mount() {
    // UIローカル状態
    var st = {
      usecase: null, format: 'apng', fps: 30, loops: 1,
      resKey: 'scene', scaleMult: 1, mode: 'full', speed: 1,
      bg: 'transparent', bgColor: '#00ff00', scope: 'all', showFormats: false
    };
    var settingsModal = null;
    function isProject() { return !!(TS.project && TS.project.active() && TS.project.count() > 1); }

    function closeSettings() {
      if (settingsModal && settingsModal.parentNode) settingsModal.parentNode.removeChild(settingsModal);
      settingsModal = null;
      document.removeEventListener('keydown', onKey, true);
    }
    function onKey(e) { if (e.key === 'Escape') { e.stopPropagation(); closeSettings(); } }

    function open() {
      if (settingsModal) return;
      settingsModal = el('div', 'app-modal export-modal');
      settingsModal.setAttribute('role', 'dialog');
      settingsModal.setAttribute('aria-modal', 'true');
      var backdrop = el('div', 'app-modal-backdrop');
      backdrop.addEventListener('click', closeSettings);
      var content = el('div', 'app-modal-content export-modal-content');
      var head = el('div', 'app-modal-head');
      head.appendChild(el('h3', 'app-modal-title', '書き出し設定'));
      var x = btn('app-modal-close');
      x.innerHTML = TS.ui.icon('x');
      x.setAttribute('aria-label', '閉じる');
      x.addEventListener('click', closeSettings);
      head.appendChild(x);
      var body = el('div', 'app-modal-body export-body');
      content.appendChild(head);
      content.appendChild(body);
      settingsModal.appendChild(backdrop);
      settingsModal.appendChild(content);
      document.body.appendChild(settingsModal);
      document.addEventListener('keydown', onKey, true);
      renderBody(body);
    }

    function segRow(label, node) {
      var r = el('div', 'seg-row');
      r.appendChild(el('span', 'seg-row-label', label));
      r.appendChild(node);
      return r;
    }

    function renderBody(body) {
      body.innerHTML = '';
      var scene = TS.store.get();

      // ---- 書き出し対象（プロジェクト時のみ: 編集中テロップ / 全部） ----
      if (isProject()) {
        var scopeRow = el('div', 'export-scope');
        scopeRow.appendChild(el('span', 'seg-row-label', '対象'));
        scopeRow.appendChild(TS.ui.segment({
          options: [{ value: 'current', label: 'このテロップ' }, { value: 'all', label: '全部（' + TS.project.count() + '件）' }],
          value: st.scope, onChange: function (v) { st.scope = v; renderBody(body); }
        }));
        body.appendChild(scopeRow);
      }

      // ---- §5-2 「どこで使う?」用途導線 ----
      body.appendChild(el('div', 'export-section-label', 'どこで使う?'));
      var uc = el('div', 'export-usecases');
      USECASES.forEach(function (u) {
        var c = btn('export-usecase' + (st.usecase === u.id ? ' active' : ''));
        var ic = el('span', 'export-usecase-ic'); ic.innerHTML = TS.ui.icon(u.icon); c.appendChild(ic);
        var tx = el('div', 'export-usecase-tx');
        tx.appendChild(el('div', 'export-usecase-label', u.label + (u.sub ? '（' + u.sub + '）' : '')));
        tx.appendChild(el('div', 'export-usecase-note', '→ ' + fmtName(u.rec) + '：' + u.note));
        c.appendChild(tx);
        c.addEventListener('click', function () { st.usecase = u.id; st.format = u.rec; renderBody(body); });
        uc.appendChild(c);
      });
      body.appendChild(uc);

      var fdef = FORMATS.filter(function (f) { return f.id === st.format; })[0];

      // ---- 形式（既定は上の用途導線で決まる。詳しく選びたい人だけ折り畳みを開く＝§2.4 主役1つ/§1.5 まず引く） ----
      var disc = btn('export-disclosure' + (st.showFormats ? ' open' : ''));
      disc.setAttribute('aria-expanded', st.showFormats ? 'true' : 'false');
      var dl = el('span', 'export-disclosure-label');
      dl.appendChild(el('span', 'export-disclosure-key', '形式'));
      dl.appendChild(el('span', 'export-disclosure-val', fdef.name + ' ' + fdef.ext));
      disc.appendChild(dl);
      var chev = el('span', 'export-disclosure-chev'); chev.innerHTML = TS.ui.icon('chevron-down'); disc.appendChild(chev);
      disc.addEventListener('click', function () { st.showFormats = !st.showFormats; renderBody(body); });
      body.appendChild(disc);

      if (st.showFormats) {
        var cards = el('div', 'export-cards');
        FORMATS.forEach(function (f) {
          var c = btn('export-card' + (st.format === f.id ? ' active' : '') + (f.deprecated ? ' export-card-deprecated' : ''));
          c.setAttribute('aria-pressed', st.format === f.id ? 'true' : 'false');
          var ch = el('div', 'export-card-head');
          ch.appendChild(el('span', 'export-card-name', f.name));
          ch.appendChild(el('span', 'export-card-ext', f.ext));
          if (f.badge) ch.appendChild(el('span', 'export-card-badge', f.badge));
          c.appendChild(ch);
          c.appendChild(el('div', 'export-card-desc', f.desc));
          if ((f.id === 'mov' || f.id === 'webm') && TS.exportMovie && !TS.exportMovie.available()) {
            c.disabled = true;
            c.appendChild(el('div', 'export-card-note', 'file:// では書き出せません。http（node .claude/serve.mjs 等）で開くと有効。'));
          }
          if (f.id === 'apng' && TS.exportApng && !TS.exportApng.available()) {
            c.disabled = true;
            c.appendChild(el('div', 'export-card-note', 'APNGエンコーダ（vendor/upng）を読み込めませんでした。'));
          }
          c.addEventListener('click', function () { if (c.disabled) return; st.format = f.id; renderBody(body); });
          cards.appendChild(c);
        });
        body.appendChild(cards);
      }

      // ---- 設定（動画系のみ） ----
      if (fdef.video) {
        var set = el('div', 'export-settings');

        // 解像度プリセット（7択なので横並びセグメントでなくドロップダウン＝はみ出し防止・アプリ既定作法）
        var resSel = document.createElement('select');
        resSel.className = 'batch-select export-res-select';
        RES_PRESETS.forEach(function (r) { var o = document.createElement('option'); o.value = r.key; o.textContent = r.label; resSel.appendChild(o); });
        resSel.value = st.resKey;
        resSel.setAttribute('aria-label', '解像度');
        resSel.addEventListener('change', function () { st.resKey = resSel.value; renderBody(body); });
        set.appendChild(segRow('解像度', resSel));
        // 倍率
        set.appendChild(segRow('倍率', TS.ui.segment({
          options: [{ value: 1, label: '1x' }, { value: 2, label: '2x' }, { value: 4, label: '4x' }],
          value: st.scaleMult,
          onChange: function (v) { st.scaleMult = +v; renderBody(body); }
        })));
        // モード（フルフレーム / トリミング）
        set.appendChild(segRow('モード', TS.ui.segment({
          options: [{ value: 'full', label: 'フルフレーム' }, { value: 'trim', label: 'トリミング' }],
          value: st.mode,
          onChange: function (v) { st.mode = v; renderBody(body); }
        })));
        // fps
        set.appendChild(segRow('fps', TS.ui.segment({
          options: [{ value: 24, label: '24' }, { value: 30, label: '30' }, { value: 60, label: '60' }],
          value: st.fps,
          onChange: function (v) { st.fps = +v; renderBody(body); }
        })));
        // 速度倍率（§3-6）
        set.appendChild(segRow('速度', TS.ui.segment({
          options: [{ value: 0.5, label: '0.5×' }, { value: 1, label: '1×' }, { value: 1.5, label: '1.5×' },
                    { value: 2, label: '2×' }, { value: 2.5, label: '2.5×' }],
          value: st.speed,
          onChange: function (v) { st.speed = +v; renderBody(body); }
        })));
        // ループ
        set.appendChild(segRow('ループ', TS.ui.segment({
          options: [{ value: 1, label: '1回' }, { value: 2, label: '2回' }, { value: 3, label: '3回' }],
          value: st.loops,
          onChange: function (v) { st.loops = +v; renderBody(body); }
        })));
        // 背景（トリミング時は透過固定）
        if (st.mode !== 'trim') {
          var bgOpts = [{ value: 'transparent', label: '透過' }, { value: '#000000', label: '黒' },
                        { value: '#ffffff', label: '白' }, { value: 'custom', label: '指定色' }];
          set.appendChild(segRow('背景', TS.ui.segment({
            options: bgOpts, value: st.bg,
            onChange: function (v) { st.bg = v; renderBody(body); }
          })));
          if (st.bg === 'custom') {
            set.appendChild(segRow('背景色', TS.ui.colorInput({
              value: st.bgColor,
              onInput: function (v) { st.bgColor = v; },
              onCommit: function (v) { st.bgColor = v; }
            })));
          }
        } else {
          set.appendChild(el('div', 'export-info-note', 'トリミングは文字ぴったりに切り抜くため常に透過です。'));
        }

        // サマリー
        var res = resolveRes(scene, st);
        var per = period(scene);
        var outDur = per * st.loops / st.speed;
        var frames = Math.max(1, Math.round(outDur * st.fps));
        var fw = res.w * st.scaleMult, fh = res.h * st.scaleMult;
        var summary = (st.mode === 'trim' ? '最大 ' : '') + fw + '×' + fh + ' / ' +
          (Math.round(outDur * 100) / 100) + '秒 / ' + frames + '枚 / ' + st.fps + 'fps';
        if (st.format === 'gif' && st.bg === 'transparent' && st.mode !== 'trim') summary += '（GIF透過は1bit）';
        if (fw * fh > 3840 * 2160 && (st.format === 'apng' || st.format === 'gif')) {
          summary += '\n⚠️ 高解像度×多フレームはメモリを大量消費します（倍率や尺を下げると安全）';
        }
        var sumEl = el('div', 'export-summary'); sumEl.textContent = summary; sumEl.style.whiteSpace = 'pre-line';
        set.appendChild(sumEl);
        body.appendChild(set);
      }

      // ---- 実行（書き出しは出力のみに純化。制作の入口はヘッダー「まとめて作る」へ＝IA_fix） ----
      var actions = el('div', 'export-actions');
      var runLabel = fdef.video ? '書き出す' : (st.format === 'css' ? 'CSSを生成' : st.format === 'html' ? 'HTMLを生成' : '生成');
      if (isProject() && st.scope === 'all') runLabel = '全部書き出す（' + TS.project.count() + '件）';
      var run = btn('export-run', runLabel);
      run.addEventListener('click', function () { execute(); });
      actions.appendChild(run);
      body.appendChild(actions);
    }

    function optsFor(scene) {
      var res = resolveRes(scene, st);
      return {
        format: st.format, fps: st.fps, loops: st.loops,
        resW: res.w, resH: res.h, scaleMult: st.scaleMult, mode: st.mode, speed: st.speed,
        bg: st.bg, bgColor: st.bgColor
      };
    }
    function execute() {
      var isMovie = (st.format === 'mov' || st.format === 'webm');
      var projectAll = isProject() && st.scope === 'all';
      closeSettings();                    // §3-5: 設定を閉じてから
      var pm = progressModal();           // 進捗/完了モーダルを開く
      var abort = new AbortController();
      pm.setRunning({ abort: abort });
      pm.onCancel(function () {
        abort.abort();
        if (isMovie && TS.exportMovie) TS.exportMovie.cancel();
        pm.setRunning(null);
        pm.fail('キャンセルしました');
      });

      // 単発（編集中テロップ1件）
      if (!projectAll) {
        var scene = TS.scene.clone(TS.store.get());
        var opts = optsFor(scene);
        opts.signal = abort.signal;
        opts.onProgress = function (ratio, label) { pm.set(label, ratio); };
        runForScene(scene, opts).then(function (r) { pm.done(r.message); })
          .catch(function (e) { if (e && e.name === 'AbortError') return; console.error(e); pm.fail('失敗: ' + (e && e.message || e)); });
        return;
      }

      // プロジェクト全件（現在の編集を保存してから全Sceneを逐次書き出し。pngBaseで各件ユニーク命名）
      if (TS.project.saveCurrent) TS.project.saveCurrent();
      var list = TS.project.scenes().map(function (s) { return TS.scene.clone(s); });
      var total = list.length, i = 0, ok = 0;
      function next() {
        if (abort.signal.aborted) return;
        if (i >= total) { pm.done(ok + ' / ' + total + ' 件を書き出しました'); return; }
        var opts = optsFor(list[i]);
        opts.signal = abort.signal;
        opts.onProgress = function (ratio, label) { pm.set('(' + (i + 1) + '/' + total + ') ' + (label || ''), (i + ratio) / total); };
        runForScene(list[i], opts).then(function () { ok++; i++; return new Promise(function (r) { setTimeout(r, 120); }); })
          .then(next)
          .catch(function (e) { if (e && e.name === 'AbortError') return; console.error(e); i++; next(); });
      }
      next();
    }

    return { open: open, close: closeSettings };
  }

  // 現在の解像度を解決（resKey→w/h。'scene'は現在のcanvas）
  function resolveRes(scene, st) {
    var p = RES_PRESETS.filter(function (r) { return r.key === st.resKey; })[0];
    if (p && p.w && p.h) return { w: p.w, h: p.h };
    return { w: scene.canvas.w, h: scene.canvas.h };
  }
  function fmtName(id) {
    var f = FORMATS.filter(function (x) { return x.id === id; })[0];
    return f ? f.name : id;
  }

  TS.uiExport = { mount: mount, runForScene: runForScene };
})();
