'use strict';
/* Telopra Service Worker — アプリシェルの事前キャッシュ＋ランタイムキャッシュ（PWA/オフライン）
   方針:
   - アプリ本体（HTML/CSS/JS/アイコン）: install時に事前キャッシュ。ネット優先→失敗時キャッシュ
     （開発中の更新が即反映されるよう network-first）。
   - vendor（ffmpeg 約31MB）と Google Fonts: 初回アクセス時にキャッシュ（cache-first。以後オフラインでも書き出し可）。
   バージョンを上げると旧キャッシュは activate で破棄される。 */

var VERSION = 'ts-v7';   // core/wasm を CDN(jsDelivr)化。旧キャッシュ破棄のため上げる   // ← リリース時に上げる
var SHELL = 'shell-' + VERSION;
var RUNTIME = 'runtime-' + VERSION;

var SHELL_FILES = [
  './',
  'index.html',
  'manifest.json',
  'css/app.css',
  'assets/icon-192.png',
  'assets/icon-512.png',
  'assets/logo.svg', 'assets/favicon.svg', 'assets/apple-touch-icon.png',
  'js/color.js', 'js/anim.js', 'js/motion.js', 'js/scene.js', 'js/layout.js', 'js/store.js',
  'js/data/fonts.js', 'js/data/presets.js', 'js/data/motion-presets.js',
  'js/render-dom.js', 'js/render-canvas.js',
  'js/ui/controls.js', 'js/ui/preview.js', 'js/ui/panel-text.js', 'js/ui/panel-design.js',
  'js/ui/panel-presets.js', 'js/ui/panel-motion.js', 'js/ui/panel-my.js',
  'js/export/zip.js', 'js/export/gif.js', 'js/export/frames.js', 'js/export/movie.js', 'js/export/css.js',
  'js/export/lottie.js',
  'js/ui/export-modal.js', 'js/app.js',
  'vendor/ffmpeg/ffmpeg.js', 'vendor/ffmpeg/814.ffmpeg.js'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(SHELL).then(function (c) { return c.addAll(SHELL_FILES); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k !== SHELL && k !== RUNTIME) return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);

  // 大物・外部（ffmpeg-core / Google Fonts）: cache-first（不変とみなす）
  var cacheFirst =
    url.pathname.indexOf('/vendor/ffmpeg/ffmpeg-core') >= 0 ||
    (url.hostname === 'cdn.jsdelivr.net' && url.pathname.indexOf('@ffmpeg/core') >= 0) ||
    url.hostname === 'fonts.googleapis.com' ||
    url.hostname === 'fonts.gstatic.com';
  if (cacheFirst) {
    e.respondWith(
      caches.open(RUNTIME).then(function (c) {
        return c.match(req).then(function (hit) {
          if (hit) return hit;
          return fetch(req).then(function (res) {
            if (res && res.status === 200) c.put(req, res.clone());
            return res;
          });
        });
      })
    );
    return;
  }

  // 同一オリジンのシェル: network-first（更新即反映）→ 失敗時キャッシュ（オフライン）
  if (url.origin === location.origin) {
    e.respondWith(
      fetch(req).then(function (res) {
        var copy = res.clone();
        caches.open(SHELL).then(function (c) { c.put(req, copy); });
        return res;
      }).catch(function () {
        return caches.match(req, { ignoreSearch: true });
      })
    );
  }
});
