'use strict';
/* TS.exportMovie — 透過 ProRes 4444 .mov 書き出し（ffmpeg.wasm / 全ローカル同梱）
   PNG連番 → prores_ks / yuva444p10le。編集ソフト（Premiere/AE/CapCut/DaVinci）に
   そのまま載る唯一確実な形式（仕様書7章 Tier1）。
   注意: ffmpeg.js のUMDは classWorkerURL に開発機の絶対パスが焼き込まれた既知の罠があるため
   渡さない（自動解決で vendor/ffmpeg/814.ffmpeg.js を読む）。file:// ではWorkerが起動できない。 */
(function () {
  window.TS = window.TS || {};

  var VENDOR = 'vendor/ffmpeg/';
  // ffmpeg-core.js / .wasm は Cloudflare Pages の 25MiB 制限で同梱できないため CDN から読む。
  // バージョンは同梱物と完全一致(0.12.10, md5一致)。CDNは application/wasm + CORS(*) を返す。
  var CORE_CDN = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd/';
  var _ffmpeg = null;       // ロード済みインスタンス（使い回し）
  var _loading = null;

  function isFileProtocol() { return location.protocol === 'file:'; }

  // 進捗付き fetch → blob URL（32MBのwasmロードを可視化する）
  function fetchAsBlobURL(url, mime, onProgress) {
    return fetch(url).then(function (res) {
      if (!res.ok) throw new Error(url + ' の取得に失敗しました (' + res.status + ')');
      var total = +res.headers.get('Content-Length') || 0;
      if (!res.body || !total) {
        return res.blob().then(function (b) { return URL.createObjectURL(new Blob([b], { type: mime })); });
      }
      var reader = res.body.getReader();
      var chunks = [], got = 0;
      function pump() {
        return reader.read().then(function (r) {
          if (r.done) return URL.createObjectURL(new Blob(chunks, { type: mime }));
          chunks.push(r.value);
          got += r.value.length;
          if (onProgress) onProgress(got, total);
          return pump();
        });
      }
      return pump();
    });
  }

  // ffmpeg.wasm のロード（初回のみ。以後使い回し）
  function load(onProgress) {
    if (_ffmpeg && _ffmpeg.loaded) return Promise.resolve(_ffmpeg);
    if (_loading) return _loading;
    if (isFileProtocol()) {
      return Promise.reject(new Error('file:// ではWorkerを起動できないため動画書き出しは使えません。同梱の serve（node .claude/serve.mjs）等の http 経由で開いてください。'));
    }
    if (!window.FFmpegWASM || !window.FFmpegWASM.FFmpeg) {
      return Promise.reject(new Error('ffmpeg.js が読み込まれていません（vendor/ffmpeg/ffmpeg.js）'));
    }
    var base = CORE_CDN;   // ← 同梱(vendor)ではなくCDNから core/wasm を取得
    _loading = Promise.all([
      fetchAsBlobURL(base + 'ffmpeg-core.js', 'text/javascript', null),
      fetchAsBlobURL(base + 'ffmpeg-core.wasm', 'application/wasm', onProgress)
    ]).then(function (urls) {
      var ff = new window.FFmpegWASM.FFmpeg();
      return ff.load({ coreURL: urls[0], wasmURL: urls[1] }).then(function () {
        _ffmpeg = ff;
        _loading = null;
        return ff;
      });
    }).catch(function (e) { _loading = null; throw e; });
    return _loading;
  }

  // キャンセル: Workerごと落とす（次回は再ロード）
  function cancel() {
    if (_ffmpeg) {
      try { _ffmpeg.terminate(); } catch (e) { /* noop */ }
      _ffmpeg = null;
    }
    _loading = null;
  }

  function pad(n) { return ('0000' + n).slice(-4); }

  /* encodeProRes(blobs, opts) -> Promise<Uint8Array(.movバイト列)>
     blobs: PNG Blob配列（アルファ付き）
     opts: { fps, onPhase?: (phase)=>void, onProgress?: (0..1)=>void, signal }
     phase: 'load'(コア取得) → 'write'(フレーム転送) → 'encode' */
  function encodeProRes(blobs, opts) {
    return encodeWith(blobs, opts,
      ['-c:v', 'prores_ks', '-profile:v', '4444', '-pix_fmt', 'yuva444p10le', '-vendor', 'apl0'],
      'out.mov');
  }

  /* encodeWebM: VP9＋アルファ（yuva420p）。Web/CapCut等向けに軽量。
     -auto-alt-ref 0 はアルファ付きVP9の必須条件、CRFモードは -b:v 0 と組で使う */
  function encodeWebM(blobs, opts) {
    return encodeWith(blobs, opts,
      ['-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', '-auto-alt-ref', '0',
       '-b:v', '0', '-crf', '30', '-row-mt', '1'],
      'out.webm');
  }

  function encodeWith(blobs, opts, codecArgs, outName) {
    opts = opts || {};
    var fps = opts.fps || 30;
    var total = blobs.length;
    if (!total) return Promise.reject(new Error('フレームがありません'));
    if (opts.onPhase) opts.onPhase('load');

    return load(function (got, totalBytes) {
      if (opts.onProgress) opts.onProgress(totalBytes ? got / totalBytes : 0);
    }).then(function (ff) {
      if (opts.onPhase) opts.onPhase('write');
      // フレームをwasm FSへ
      var i = 0;
      function writeNext() {
        if (opts.signal && opts.signal.aborted) throw new DOMException('キャンセル', 'AbortError');
        if (i >= total) return Promise.resolve();
        return blobs[i].arrayBuffer().then(function (ab) {
          return ff.writeFile('f' + pad(i) + '.png', new Uint8Array(ab));
        }).then(function () {
          i++;
          if (opts.onProgress) opts.onProgress(i / total);
          return writeNext();
        });
      }
      return writeNext().then(function () {
        if (opts.onPhase) opts.onPhase('encode');
        // ログの frame= を進捗に使う（image2入力ではprogressイベントが不安定なため）
        var onLog = function (l) {
          var m = /frame=\s*(\d+)/.exec(l && l.message || '');
          if (m && opts.onProgress) opts.onProgress(Math.min(1, (+m[1]) / total));
        };
        ff.on('log', onLog);
        var args = ['-framerate', String(fps), '-i', 'f%04d.png']
          .concat(codecArgs).concat([outName]);
        return ff.exec(args).then(function (code) {
          ff.off('log', onLog);
          if (code !== 0) throw new Error('ffmpeg がエラーで終了しました (code ' + code + ')');
          return ff.readFile(outName);
        }).then(function (data) {
          // 後片付け（失敗しても致命ではない）
          var clean = [];
          for (var k = 0; k < total; k++) clean.push(ff.deleteFile('f' + pad(k) + '.png').catch(function () {}));
          clean.push(ff.deleteFile(outName).catch(function () {}));
          return Promise.all(clean).then(function () {
            return (data instanceof Uint8Array) ? data : new Uint8Array(data);
          });
        }).catch(function (e) {
          ff.off('log', onLog);
          throw e;
        });
      });
    });
  }

  TS.exportMovie = {
    load: load,
    cancel: cancel,
    encodeProRes: encodeProRes,
    encodeWebM: encodeWebM,
    available: function () { return !isFileProtocol(); }
  };
})();
