'use strict';
// TS.exportGif — GIF89a アニメーションエンコーダ（完全自前実装・外部依存なし）
// テロップ動画のGIF書き出し用。グローバルパレット（メディアンカット量子化）＋自前LZW＋1bit透過。
// ブラウザ／Node 両対応（window が無い環境では globalThis に TS を生やす）。
(function () {
  var root = (typeof window !== 'undefined') ? window : globalThis;
  root.TS = root.TS || {};

  // ============================================================
  // ユーティリティ
  // ============================================================

  // '#rgb' / '#rrggbb' → {r,g,b}（0..255）
  function hexToRgb(hex) {
    var h = String(hex).trim().replace(/^#/, '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h.slice(0, 6), 16);
    if (isNaN(n)) n = 0;
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  // 伸長可能なバイトバッファ（GIFバイナリの組み立てに使用）
  function ByteWriter() {
    this.buf = new Uint8Array(1 << 16);
    this.len = 0;
  }
  ByteWriter.prototype._grow = function (need) {
    if (this.len + need <= this.buf.length) return;
    var cap = this.buf.length;
    while (cap < this.len + need) cap *= 2;
    var nb = new Uint8Array(cap);
    nb.set(this.buf.subarray(0, this.len));
    this.buf = nb;
  };
  // 1バイト追加
  ByteWriter.prototype.push = function (b) {
    this._grow(1);
    this.buf[this.len++] = b & 255;
  };
  // リトルエンディアン16bit追加
  ByteWriter.prototype.pushU16 = function (v) {
    this._grow(2);
    this.buf[this.len++] = v & 255;
    this.buf[this.len++] = (v >> 8) & 255;
  };
  // バイト列の先頭 n バイトを追加
  ByteWriter.prototype.pushBytes = function (arr, n) {
    this._grow(n);
    for (var i = 0; i < n; i++) this.buf[this.len + i] = arr[i];
    this.len += n;
  };
  // ASCII文字列を追加
  ByteWriter.prototype.pushString = function (s) {
    this._grow(s.length);
    for (var i = 0; i < s.length; i++) this.buf[this.len + i] = s.charCodeAt(i) & 255;
    this.len += s.length;
  };
  // 確定したバイト列（コピー）を返す
  ByteWriter.prototype.result = function () {
    return this.buf.slice(0, this.len);
  };

  // ============================================================
  // 色量子化 — メディアンカット法（RGB空間）
  // ============================================================

  // samples: 0xRRGGBB でパックした Int32Array（先頭 count 件が有効。配列は並べ替えられる）
  // maxColors 色以下のパレット [[r,g,b], ...] を返す
  function medianCut(samples, count, maxColors) {
    if (count === 0) return [[0, 0, 0]];

    // ボックス（サンプル列の区間 [start, end)）の統計を計算
    function makeBox(start, end) {
      var rmin = 255, rmax = 0, gmin = 255, gmax = 0, bmin = 255, bmax = 0;
      for (var i = start; i < end; i++) {
        var v = samples[i];
        var r = (v >> 16) & 255, g = (v >> 8) & 255, b = v & 255;
        if (r < rmin) rmin = r; if (r > rmax) rmax = r;
        if (g < gmin) gmin = g; if (g > gmax) gmax = g;
        if (b < bmin) bmin = b; if (b > bmax) bmax = b;
      }
      var rr = rmax - rmin, gr = gmax - gmin, br = bmax - bmin;
      var shift, range;
      // 分割チャネル＝レンジ最大のもの（同率なら視感度の高い緑を優先）
      if (gr >= rr && gr >= br) { shift = 8; range = gr; }
      else if (rr >= br) { shift = 16; range = rr; }
      else { shift = 0; range = br; }
      return {
        start: start, end: end, shift: shift, range: range,
        priority: (end - start) * range // 分割優先度 = 画素数×レンジ
      };
    }

    var boxes = [makeBox(0, count)];
    while (boxes.length < maxColors) {
      // 優先度最大のボックスを選ぶ（レンジ0＝単色は分割不可）
      var bi = -1, best = 0;
      for (var i = 0; i < boxes.length; i++) {
        if (boxes[i].range > 0 && boxes[i].priority > best) {
          best = boxes[i].priority;
          bi = i;
        }
      }
      if (bi < 0) break; // すべて単色 → 終了
      var box = boxes[bi];

      // 分割チャネルのヒストグラムから中央値のしきい値 T を決める
      var hist = new Int32Array(256);
      for (i = box.start; i < box.end; i++) hist[(samples[i] >> box.shift) & 255]++;
      var total = box.end - box.start;
      var half = total >> 1;
      var acc = 0, T = 0;
      for (T = 0; T < 255; T++) {
        acc += hist[T];
        if (acc >= half && acc > 0) break;
      }
      // 右側（値 > T）が空にならないよう調整
      while (acc >= total && T > 0) { acc -= hist[T]; T--; }

      // 値 <= T を左に寄せるインプレース分割
      var lo = box.start, hi = box.end - 1;
      while (lo <= hi) {
        if (((samples[lo] >> box.shift) & 255) <= T) {
          lo++;
        } else {
          var tmp = samples[lo]; samples[lo] = samples[hi]; samples[hi] = tmp;
          hi--;
        }
      }
      boxes[bi] = makeBox(box.start, lo);
      boxes.push(makeBox(lo, box.end));
    }

    // 各ボックスの平均色をパレット色とする
    var pal = [];
    for (i = 0; i < boxes.length; i++) {
      var bx = boxes[i], n = bx.end - bx.start;
      if (n <= 0) continue;
      var sr = 0, sg = 0, sb = 0;
      for (var j = bx.start; j < bx.end; j++) {
        var v2 = samples[j];
        sr += (v2 >> 16) & 255; sg += (v2 >> 8) & 255; sb += v2 & 255;
      }
      pal.push([Math.round(sr / n), Math.round(sg / n), Math.round(sb / n)]);
    }
    return pal;
  }

  // パレットから最も近い色のインデックスを線形探索で返す（LUTのセル埋め時のみ使用）
  function nearestIndex(r, g, b, palR, palG, palB, n) {
    var best = 0, bestD = 0x7fffffff;
    for (var i = 0; i < n; i++) {
      var dr = r - palR[i], dg = g - palG[i], db = b - palB[i];
      // 視感度による簡易重み付き距離（R:2 G:4 B:3）
      var d = dr * dr * 2 + dg * dg * 4 + db * db * 3;
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  // ============================================================
  // LZW圧縮（GIF仕様の可変コード長・辞書4096でクリア）
  // ============================================================

  // indices: パレットインデックス列（先頭 n 件が有効）
  // dict: 呼び出し側で確保した Int32Array(4096 << 8)（再利用のため引数渡し）
  // out には「LZW最小コードサイズ1バイト＋サブブロック列＋終端0」を書き込む
  function lzwEncode(indices, n, minCodeSize, dict, out) {
    out.push(minCodeSize);

    var clearCode = 1 << minCodeSize;
    var eoiCode = clearCode + 1;
    var nextCode = eoiCode + 1;
    var codeSize = minCodeSize + 1;

    // 辞書: キー = (プレフィックスコード << 8) | 次のバイト、値 = コード+1（0は未登録）
    dict.fill(0);

    // ビットバッファ（GIFはLSBファーストでコードを詰める）
    var acc = 0, accBits = 0;
    // 255バイト以下のサブブロック単位で出力
    var block = new Uint8Array(255), blockLen = 0;

    function flushBlock() {
      if (blockLen > 0) {
        out.push(blockLen);
        out.pushBytes(block, blockLen);
        blockLen = 0;
      }
    }
    function emit(code) {
      acc |= code << accBits;
      accBits += codeSize;
      while (accBits >= 8) {
        block[blockLen++] = acc & 255;
        if (blockLen === 255) flushBlock();
        acc >>>= 8;
        accBits -= 8;
      }
    }

    emit(clearCode);
    var prefix = indices[0];
    for (var i = 1; i < n; i++) {
      var k = indices[i];
      var key = (prefix << 8) | k;
      var hit = dict[key];
      if (hit !== 0) {
        // 既知の系列 → 伸長して継続
        prefix = hit - 1;
      } else {
        emit(prefix);
        if (nextCode === 4096) {
          // 辞書が満杯 → クリアコードを送出して辞書をリセット
          emit(clearCode);
          dict.fill(0);
          nextCode = eoiCode + 1;
          codeSize = minCodeSize + 1;
        } else {
          // 次コードが現コード幅に収まらなくなる時点でコード幅を1増やす
          if (nextCode >= (1 << codeSize)) codeSize++;
          dict[key] = nextCode + 1;
          nextCode++;
        }
        prefix = k;
      }
    }
    emit(prefix);
    emit(eoiCode);
    // 端数ビットを吐き出す（最終バイトは0詰め）
    while (accBits > 0) {
      block[blockLen++] = acc & 255;
      if (blockLen === 255) flushBlock();
      acc >>>= 8;
      accBits -= 8;
    }
    flushBlock();
    out.push(0); // 画像データブロックの終端
  }

  // ============================================================
  // メインAPI
  // ============================================================

  // frames: [{ data: Uint8ClampedArray(RGBA), width, height }]（全フレーム同寸）
  // opts: { fps, loop, transparent, background, maxColors, onProgress }
  // 戻り値: GIF89a バイナリの Uint8Array
  function encode(frames, opts) {
    opts = opts || {};

    // ---- 入力検証 ----
    if (!frames || !frames.length) {
      throw new Error('TS.exportGif.encode: frames は1件以上の配列が必要です');
    }
    var w = frames[0].width | 0;
    var h = frames[0].height | 0;
    if (w <= 0 || h <= 0) {
      throw new Error('TS.exportGif.encode: フレーム寸法が不正です (' + w + 'x' + h + ')');
    }
    if (w > 65535 || h > 65535) {
      throw new Error('TS.exportGif.encode: GIFの上限(65535px)を超える寸法です');
    }
    var frameCount = frames.length;
    var pxCount = w * h;
    for (var f = 0; f < frameCount; f++) {
      var fr = frames[f];
      if (!fr || (fr.width | 0) !== w || (fr.height | 0) !== h) {
        throw new Error('TS.exportGif.encode: フレーム' + f + ' の寸法が一致しません');
      }
      if (!fr.data || fr.data.length !== pxCount * 4) {
        throw new Error('TS.exportGif.encode: フレーム' + f + ' の data 長が不正です（RGBAで width*height*4 必要）');
      }
    }

    // ---- オプション ----
    var fps = (Number(opts.fps) > 0) ? Number(opts.fps) : 30;
    var loop = Math.max(0, Math.min(65535, opts.loop | 0)); // 0 = 無限ループ
    var transparent = (opts.transparent !== false);          // 既定 true
    var bg = (opts.background != null) ? hexToRgb(opts.background) : null;
    var maxColors = ((opts.maxColors | 0) > 0) ? (opts.maxColors | 0) : 255;
    var capColors = transparent ? 255 : 256; // 透過使用時は1枠を透過インデックスに確保
    if (maxColors > capColors) maxColors = capColors;
    if (maxColors < 2) maxColors = 2;
    var onProgress = (typeof opts.onProgress === 'function') ? opts.onProgress : null;
    // 遅延（1/100秒単位、fpsから丸め。0は再生系で無視されがちなので最低1）
    var delayCs = Math.max(1, Math.round(100 / fps));

    // ---- パレット用サンプリング（全フレームから最大約50万px、等間隔間引き）----
    var SAMPLE_MAX = 500000;
    var totalPx = pxCount * frameCount;
    var step = Math.ceil(totalPx / SAMPLE_MAX);
    if (step < 1) step = 1;
    if (step > 1 && (step & 1) === 0) step++; // 偶数だと画像の周期と同期しやすいので奇数化
    var samples = new Int32Array(Math.floor(totalPx / step) + 2);
    var sampleCount = 0;
    var pos = 0; // フレームをまたいで連続するグローバル画素位置
    for (f = 0; f < frameCount; f++) {
      var data = frames[f].data;
      var base = f * pxCount;
      var local = pos - base;
      while (local < pxCount) {
        var p = local * 4;
        var r = data[p], g = data[p + 1], b = data[p + 2], a = data[p + 3];
        var keep = true;
        if (transparent && a < 128) {
          keep = false; // 透過画素はパレットに寄与させない
        } else if (bg !== null && a < 255) {
          // 背景色へアルファ合成（マット処理）
          r = ((r * a + bg.r * (255 - a) + 127) / 255) | 0;
          g = ((g * a + bg.g * (255 - a) + 127) / 255) | 0;
          b = ((b * a + bg.b * (255 - a) + 127) / 255) | 0;
        }
        if (keep) samples[sampleCount++] = (r << 16) | (g << 8) | b;
        local += step;
      }
      pos = base + local;
    }

    // ---- グローバルパレット構築 ----
    var palette = medianCut(samples, sampleCount, maxColors);
    var palCount = palette.length;
    var palR = new Int32Array(palCount);
    var palG = new Int32Array(palCount);
    var palB = new Int32Array(palCount);
    for (var i = 0; i < palCount; i++) {
      palR[i] = palette[i][0];
      palG[i] = palette[i][1];
      palB[i] = palette[i][2];
    }
    var transIndex = transparent ? palCount : -1; // 透過枠はパレット末尾に追加
    var tableCount = palCount + (transparent ? 1 : 0);
    // GIFのカラーテーブルサイズは 2^n（n=1..8）
    var tableBits = 1;
    while ((1 << tableBits) < tableCount) tableBits++;
    var tableSize = 1 << tableBits;
    var minCodeSize = Math.max(2, tableBits);

    // ---- 最近傍パレット検索用 3D LUT（RGB各5bit = 32^3 セル、遅延充填）----
    var lut = new Int16Array(32768);
    lut.fill(-1);

    // ---- GIFヘッダ ----
    var out = new ByteWriter();
    out.pushString('GIF89a');
    // 論理スクリーン記述子
    out.pushU16(w);
    out.pushU16(h);
    // パック: GCTあり(1) / カラー解像度7(8bit) / ソートなし(0) / GCTサイズ(2^(n+1))
    out.push(0x80 | (7 << 4) | (tableBits - 1));
    out.push(transparent ? transIndex : 0); // 背景色インデックス
    out.push(0); // ピクセルアスペクト比（未指定）
    // グローバルカラーテーブル（透過枠と余りは黒で埋める）
    for (i = 0; i < tableSize; i++) {
      if (i < palCount) {
        out.push(palR[i]); out.push(palG[i]); out.push(palB[i]);
      } else {
        out.push(0); out.push(0); out.push(0);
      }
    }
    // NETSCAPE2.0 拡張（アニメーションのループ回数。0 = 無限）
    out.push(0x21); out.push(0xFF); out.push(11);
    out.pushString('NETSCAPE2.0');
    out.push(3); out.push(1);
    out.pushU16(loop);
    out.push(0);

    // ---- 各フレームのエンコード ----
    var indices = new Uint8Array(pxCount);       // フレーム間で再利用
    var dict = new Int32Array(4096 << 8);        // LZW辞書（再利用）
    // 処分方法: 透過あり=2（背景に復元）／なし=1（そのまま）
    var disposal = transparent ? 2 : 1;
    var gcePacked = (disposal << 2) | (transparent ? 1 : 0);

    for (f = 0; f < frameCount; f++) {
      data = frames[f].data;
      // RGBA → パレットインデックス変換
      for (i = 0, p = 0; i < pxCount; i++, p += 4) {
        r = data[p]; g = data[p + 1]; b = data[p + 2]; a = data[p + 3];
        if (transparent && a < 128) {
          indices[i] = transIndex;
          continue;
        }
        if (bg !== null && a < 255) {
          // サンプリング時と同じマット合成
          r = ((r * a + bg.r * (255 - a) + 127) / 255) | 0;
          g = ((g * a + bg.g * (255 - a) + 127) / 255) | 0;
          b = ((b * a + bg.b * (255 - a) + 127) / 255) | 0;
        }
        var key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
        var idx = lut[key];
        if (idx < 0) {
          // 未計算セル → セル中心の色で最近傍を求めてキャッシュ
          idx = nearestIndex(
            ((key >> 10) << 3) + 4,
            (((key >> 5) & 31) << 3) + 4,
            ((key & 31) << 3) + 4,
            palR, palG, palB, palCount
          );
          lut[key] = idx;
        }
        indices[i] = idx;
      }

      // Graphic Control Extension
      out.push(0x21); out.push(0xF9); out.push(4);
      out.push(gcePacked);
      out.pushU16(delayCs);
      out.push(transparent ? transIndex : 0);
      out.push(0);
      // 画像記述子（全面・ローカルカラーテーブルなし・非インタレース）
      out.push(0x2C);
      out.pushU16(0); out.pushU16(0);
      out.pushU16(w); out.pushU16(h);
      out.push(0);
      // 画像データ（LZW）
      lzwEncode(indices, pxCount, minCodeSize, dict, out);

      if (onProgress) onProgress((f + 1) / frameCount);
    }

    out.push(0x3B); // トレーラ
    return out.result();
  }

  root.TS.exportGif = {
    encode: encode
  };
})();
