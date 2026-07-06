'use strict';
/* TS.exportFrames — 共通シーンモデル → フレーム列（PNG Blob / RGBA）生成
   書き出し全形式の土台。DOMスクショは使わず TS.renderCanvas で決定的に再描画する（契約書§3）。
   UIを固めないため、フレームごとにイベントループへ譲る。 */
(function () {
  window.TS = window.TS || {};

  // canvas.toBlob の Promise 化
  function toBlob(canvas) {
    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (b) {
        if (b) resolve(b);
        else reject(new Error('PNGエンコードに失敗しました'));
      }, 'image/png');
    });
  }

  function yieldToUI() {
    return new Promise(function (r) { setTimeout(r, 0); });
  }

  /* run(scene, opts) -> Promise<{ frames, width, height, fps, count }>
     opts:
       fps        : 出力fps（既定 scene.canvas.fps || 30）
       duration   : 秒。既定 = ループ周期 × loops
       loops      : 周期の繰り返し回数（既定1。durationを直接渡したら無視）
       scale      : 解像度倍率（scene.canvas.w/h に対する。既定1）
       background : null=透過 / '#rrggbb' 等のCSS色（下に敷く）
       format     : 'png'（Blob配列）| 'rgba'（Uint8ClampedArray配列。GIF用）
       onProgress : (done, total) => void
       signal     : AbortSignal（キャンセル）
  */
  function run(scene, opts) {
    opts = opts || {};
    var fps = opts.fps || (scene.canvas && scene.canvas.fps) || 30;
    // P2: 尺の既定はモーションタイムライン全長 D（in+hold+out。TS.motion が唯一の時間定義）
    var D = (TS.motion && TS.motion.timeline) ? TS.motion.timeline(scene).D
      : ((scene.motion && scene.motion.loop && scene.motion.loop[0] && scene.motion.loop[0].period) || 3);
    var duration = opts.duration != null ? opts.duration : D * (opts.loops || 1);
    var scale = opts.scale == null ? 1 : opts.scale;
    var format = opts.format || 'png';
    var count = Math.max(1, Math.round(duration * fps));

    var w = Math.max(1, Math.round(scene.canvas.w * scale));
    var h = Math.max(1, Math.round(scene.canvas.h * scale));
    var canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    var ctx = canvas.getContext('2d', { willReadFrequently: format === 'rgba' });

    return TS.fonts.ensure(scene.text.font, scene.text.weight).then(function () {
      var frames = [];
      var i = 0;
      function step() {
        if (opts.signal && opts.signal.aborted) {
          return Promise.reject(new DOMException('書き出しをキャンセルしました', 'AbortError'));
        }
        if (i >= count) return Promise.resolve({ frames: frames, width: w, height: h, fps: fps, count: count });
        var t = i / fps;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = 1;
        ctx.clearRect(0, 0, w, h);
        if (opts.background) {
          ctx.fillStyle = opts.background;
          ctx.fillRect(0, 0, w, h);
        }
        TS.renderCanvas.render(ctx, scene, { t: t, scale: scale });
        var got = (format === 'rgba')
          ? Promise.resolve({ data: ctx.getImageData(0, 0, w, h).data, width: w, height: h })
          : toBlob(canvas);
        return got.then(function (fr) {
          frames.push(fr);
          i++;
          if (opts.onProgress) opts.onProgress(i, count);
          return yieldToUI().then(step);
        });
      }
      return step();
    });
  }

  TS.exportFrames = { run: run };
})();
