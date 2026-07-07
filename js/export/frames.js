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

  /* トリミング用: 全フレームの「不透明画素（α>閾値）」を覆う共通クロップ矩形を求める。
     モーションで文字が動くため、タイムライン上を等間隔サンプリングした和集合（union）を取る。
     背景は敷かず必ず透過で描く（＝コンテンツ境界を検出するため）。何も描かれなければ null。 */
  function computeCropRect(ctx, canvas, scene, o) {
    var w = o.w, h = o.h;
    var samples = Math.max(1, Math.min(o.count, 16));
    var minX = w, minY = h, maxX = -1, maxY = -1;
    var TH = 8;   // アルファ閾値
    for (var s = 0; s < samples; s++) {
      if (o.signal && o.signal.aborted) break;
      var frac = samples <= 1 ? 0 : s / (samples - 1);
      var t = (frac * (o.count - 1) / o.fps) * o.speed;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.clearRect(0, 0, w, h);
      TS.renderCanvas.render(ctx, scene, { t: t, scale: o.scale });
      var d = ctx.getImageData(0, 0, w, h).data;
      for (var y = 0; y < h; y++) {
        var rowoff = y * w * 4 + 3;
        for (var x = 0; x < w; x++) {
          if (d[rowoff + x * 4] > TH) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }
    }
    if (maxX < minX || maxY < minY) return null;   // 何も描かれない
    var pad = 2;
    minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad);
    maxX = Math.min(w - 1, maxX + pad); maxY = Math.min(h - 1, maxY + pad);
    // 幅・高さを偶数に（透過WebMの yuva420p は2の倍数必須。可能なら外側へ、無理なら内側へ拡張）
    if ((maxX - minX + 1) % 2) { if (maxX + 1 <= w - 1) maxX++; else if (minX - 1 >= 0) minX--; }
    if ((maxY - minY + 1) % 2) { if (maxY + 1 <= h - 1) maxY++; else if (minY - 1 >= 0) minY--; }
    return { x: minX, y: minY, w: (maxX - minX + 1), h: (maxY - minY + 1) };
  }

  /* run(scene, opts) -> Promise<{ frames, width, height, fps, count }>
     opts:
       fps        : 出力fps（既定 scene.canvas.fps || 30）
       duration   : 秒。既定 = ループ周期 × loops（＝シーン時間の尺）
       loops      : 周期の繰り返し回数（既定1。durationを直接渡したら無視）
       scale      : 解像度倍率（scene.canvas.w/h に対する。既定1）
       speed      : モーション速度倍率（§3-6。既定1。2.5なら2.5倍速で尺が1/2.5に）
       trim       : true でトリミング（文字ぴったりにクロップ・透過余白なし。§1）
       background : null=透過 / '#rrggbb' 等のCSS色（下に敷く。trim時は透過推奨）
       format     : 'png'（Blob配列）| 'rgba'（Uint8ClampedArray配列。GIF/APNG用）
       onProgress : (done, total) => void
       signal     : AbortSignal（キャンセル）
  */
  function run(scene, opts) {
    opts = opts || {};
    var fps = opts.fps || (scene.canvas && scene.canvas.fps) || 30;
    // P2: 尺の既定はモーションタイムライン全長 D（in+hold+out。TS.motion が唯一の時間定義）
    var D = (TS.motion && TS.motion.timeline) ? TS.motion.timeline(scene).D
      : ((scene.motion && scene.motion.loop && scene.motion.loop[0] && scene.motion.loop[0].period) || 3);
    var speed = (opts.speed && opts.speed > 0) ? opts.speed : 1;
    var sceneDur = opts.duration != null ? opts.duration : D * (opts.loops || 1);
    var scale = opts.scale == null ? 1 : opts.scale;
    var format = opts.format || 'png';
    var trim = !!opts.trim;
    // 速度倍率: 同じシーン尺 sceneDur を sceneDur/speed 秒で再生（フレーム時刻 t=(i/fps)*speed）
    var count = Math.max(1, Math.round((sceneDur / speed) * fps));

    var w = Math.max(1, Math.round(scene.canvas.w * scale));
    var h = Math.max(1, Math.round(scene.canvas.h * scale));
    var canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    var ctx = canvas.getContext('2d', { willReadFrequently: (format === 'rgba' || trim) });

    return TS.fonts.ensure(scene.text.font, scene.text.weight).then(function () {
      // トリミング: 先に共通クロップ矩形を確定（全フレーム同一寸法で出す）
      var crop = trim ? computeCropRect(ctx, canvas, scene,
        { w: w, h: h, scale: scale, count: count, fps: fps, speed: speed, signal: opts.signal }) : null;
      var outW = crop ? crop.w : w, outH = crop ? crop.h : h;
      var cropCanvas = null, cctx = null;
      if (crop && format !== 'rgba') {
        cropCanvas = document.createElement('canvas');
        cropCanvas.width = crop.w; cropCanvas.height = crop.h;
        cctx = cropCanvas.getContext('2d');
      }

      var frames = [];
      var i = 0;
      function step() {
        if (opts.signal && opts.signal.aborted) {
          return Promise.reject(new DOMException('書き出しをキャンセルしました', 'AbortError'));
        }
        if (i >= count) return Promise.resolve({ frames: frames, width: outW, height: outH, fps: fps, count: count });
        var t = (i / fps) * speed;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = 1;
        ctx.clearRect(0, 0, w, h);
        if (opts.background) {
          ctx.fillStyle = opts.background;
          ctx.fillRect(0, 0, w, h);
        }
        TS.renderCanvas.render(ctx, scene, { t: t, scale: scale });
        var got;
        if (format === 'rgba') {
          var data = crop ? ctx.getImageData(crop.x, crop.y, crop.w, crop.h).data
                          : ctx.getImageData(0, 0, w, h).data;
          got = Promise.resolve({ data: data, width: outW, height: outH });
        } else if (crop) {
          cctx.clearRect(0, 0, crop.w, crop.h);
          cctx.drawImage(canvas, -crop.x, -crop.y);
          got = toBlob(cropCanvas);
        } else {
          got = toBlob(canvas);
        }
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
