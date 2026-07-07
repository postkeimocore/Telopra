'use strict';
/* TS.exportApng — APNG（動くPNG）書き出し。iPhone の CapCut/Premiere アプリで
   「画像」として透過付きで載せられる＝GIFの上位互換（フルカラー24bit＋8bitアルファ）。
   既存 PNG連番（TS.exportFrames の RGBA バッファ）を UPNG.js で1本の APNG に結合する。

   依存（vendor/upng に同梱・index.html で pako → UPNG の順に読込。順序厳守＝UPNGは
   ロード時に pako 参照を確定するため、pako が後だと encode で deflate 参照に失敗する）。 */
(function () {
  window.TS = window.TS || {};

  // UPNG と pako が両方ロード済みか
  function available() {
    return typeof window.UPNG !== 'undefined' &&
      typeof window.UPNG.encode === 'function' &&
      typeof window.pako !== 'undefined';
  }

  // rgbaFrames: TS.exportFrames.run(scene,{format:'rgba'}) の frames（{data:Uint8ClampedArray,width,height}）
  // opts: { fps }（各フレームの表示msの算出に使用）
  // 戻り: Uint8Array（APNGバイト列）。cnum=0 → 量子化なし（24bit色＋8bitα保持＝ロスレス）。
  function encode(rgbaFrames, opts) {
    opts = opts || {};
    if (!rgbaFrames || !rgbaFrames.length) throw new Error('フレームがありません');
    if (!available()) throw new Error('APNGエンコーダ（UPNG.js / pako）が読み込まれていません');
    var w = rgbaFrames[0].width, h = rgbaFrames[0].height;
    var fps = opts.fps || 30;
    var bufs = rgbaFrames.map(function (fr) {
      var d = (fr && fr.data) ? fr.data : fr;   // {data,...} でも生の TypedArray でも可
      // UPNG は「ちょうど w*h*4 バイトの ArrayBuffer」を要求。byteOffset を含む view は詰め直す。
      if (d.buffer && d.byteOffset === 0 && d.byteLength === w * h * 4) return d.buffer;
      return new Uint8Array(d).buffer;
    });
    var delay = Math.max(10, Math.round(1000 / fps));   // ms/フレーム（PNG連番の1/fpsと同尺）
    var dels = bufs.map(function () { return delay; });
    var ab = window.UPNG.encode(bufs, w, h, 0, dels);
    return new Uint8Array(ab);
  }

  TS.exportApng = { available: available, encode: encode };
})();
