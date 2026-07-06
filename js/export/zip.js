'use strict';
// TS.exportZip — 無圧縮(STORE)ZIPライタ（PNG連番の格納用。PNGは圧縮済みのためSTOREで十分）
// ブラウザ/node 両対応・外部依存なし。ZIP64非対応（4GB / 65535件を超えたら throw）。
(function () {
  // ブラウザでは window、node では globalThis に TS を生やす
  var g = (typeof window !== 'undefined') ? window : globalThis;
  g.TS = g.TS || {};

  // ---- 定数 ----------------------------------------------------------
  var MAX_U32 = 0xFFFFFFFF;   // 4バイト長フィールドの上限（ZIP64非対応）
  var MAX_ENTRIES = 0xFFFF;   // 2バイト件数フィールドの上限
  var FLAG_UTF8 = 0x0800;     // 汎用フラグ bit11 = ファイル名はUTF-8
  var VERSION = 20;           // version needed to extract = 2.0
  // 固定日付 2026-01-01 00:00:00（DOS形式）— 出力の決定性を優先
  var DOS_DATE_FIXED = ((2026 - 1980) << 9) | (1 << 5) | 1;
  var DOS_TIME_FIXED = 0;

  // ---- CRC-32（テーブル方式・多項式 0xEDB88320） ----------------------
  var CRC_TABLE = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();

  // Uint8Array 全体の CRC-32（符号なし32bitで返す）
  function crc32(data) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < data.length; i++) {
      c = CRC_TABLE[(c ^ data[i]) & 0xFF] ^ (c >>> 8);
    }
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  // ---- ユーティリティ --------------------------------------------------
  // 文字列 → UTF-8 バイト列（環境非依存の自前実装。サロゲートペア対応）
  function utf8Bytes(str) {
    var out = [];
    for (var i = 0; i < str.length; i++) {
      var c = str.codePointAt(i);
      if (c > 0xFFFF) i++; // サロゲートペアの下位を消費
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xC0 | (c >> 6), 0x80 | (c & 63));
      else if (c < 0x10000) out.push(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
      else out.push(0xF0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
    return new Uint8Array(out);
  }

  // リトルエンディアン書き込み（16bit / 32bit）
  function u16(buf, pos, v) {
    buf[pos] = v & 255;
    buf[pos + 1] = (v >>> 8) & 255;
  }
  function u32(buf, pos, v) {
    buf[pos] = v & 255;
    buf[pos + 1] = (v >>> 8) & 255;
    buf[pos + 2] = (v >>> 16) & 255;
    buf[pos + 3] = (v >>> 24) & 255;
  }

  // Date → DOS 日付/時刻（opts.date 指定時のみ使用。ローカル時刻で解釈）
  function dosDateTime(d) {
    var y = d.getFullYear();
    if (y < 1980) return { date: (1 << 5) | 1, time: 0 }; // DOS下限にクランプ
    return {
      date: ((y - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
      time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)
    };
  }

  // ---- ZIPライタ本体 ---------------------------------------------------
  // 使い方:
  //   var w = TS.exportZip.create();
  //   w.add('frame001.png', pngBytes);      // data は Uint8Array（参照保持。finish まで変更しないこと）
  //   var zipBytes = w.finish();            // ZIP完成バイト列（Uint8Array）
  function create() {
    var chunks = [];    // 出力チャンク列（ローカルヘッダ＋データの並び）
    var entries = [];   // セントラルディレクトリ用メタ情報
    var offset = 0;     // 現在の書き込みオフセット（バイト）
    var finished = false;

    // ファイルを1件追加。name: ファイル名（文字列）、data: Uint8Array、
    // opts.date: Date（省略時は固定日付 2026-01-01 を使用）
    function add(name, data, opts) {
      if (finished) throw new Error('exportZip: finish() 済みのライタには追加できません');
      if (typeof name !== 'string' || name.length === 0) {
        throw new Error('exportZip: name は空でない文字列が必要です');
      }
      if (!(data instanceof Uint8Array)) {
        throw new Error('exportZip: data は Uint8Array が必要です');
      }
      if (entries.length >= MAX_ENTRIES) {
        throw new Error('exportZip: ファイル数が上限(65535)を超えました');
      }
      if (data.length > MAX_U32) {
        throw new Error('exportZip: ファイルサイズが4GBを超えています（ZIP64非対応）');
      }
      if (offset > MAX_U32) {
        throw new Error('exportZip: アーカイブが4GBを超えました（ZIP64非対応）');
      }

      var nameBytes = utf8Bytes(name);
      if (nameBytes.length > 0xFFFF) {
        throw new Error('exportZip: ファイル名が長すぎます');
      }

      var dt = { date: DOS_DATE_FIXED, time: DOS_TIME_FIXED };
      if (opts && opts.date instanceof Date) dt = dosDateTime(opts.date);

      var crc = crc32(data);

      // ローカルファイルヘッダ（30バイト固定部 + ファイル名）
      var lfh = new Uint8Array(30 + nameBytes.length);
      u32(lfh, 0, 0x04034B50);          // シグネチャ 'PK\x03\x04'
      u16(lfh, 4, VERSION);             // version needed to extract
      u16(lfh, 6, FLAG_UTF8);           // 汎用フラグ（bit11: UTF-8）
      u16(lfh, 8, 0);                   // 圧縮方式 0 = STORE
      u16(lfh, 10, dt.time);            // 更新時刻（DOS）
      u16(lfh, 12, dt.date);            // 更新日付（DOS）
      u32(lfh, 14, crc);                // CRC-32
      u32(lfh, 18, data.length);        // 圧縮後サイズ（STOREなので同値）
      u32(lfh, 22, data.length);        // 元サイズ
      u16(lfh, 26, nameBytes.length);   // ファイル名長
      u16(lfh, 28, 0);                  // 拡張フィールド長
      lfh.set(nameBytes, 30);

      entries.push({
        nameBytes: nameBytes,
        crc: crc,
        size: data.length,
        offset: offset,
        time: dt.time,
        date: dt.date
      });

      chunks.push(lfh);
      chunks.push(data); // 参照のみ保持（コピーしない）。finish() まで内容を変更しないこと
      offset += lfh.length + data.length;
      if (offset > MAX_U32) {
        throw new Error('exportZip: アーカイブが4GBを超えました（ZIP64非対応）');
      }
    }

    // ZIPを完成させ、全体のバイト列（Uint8Array）を返す
    function finish() {
      if (finished) throw new Error('exportZip: finish() は一度しか呼べません');
      finished = true;

      var cdOffset = offset; // セントラルディレクトリ開始位置
      var cdSize = 0;
      var i, e;

      // セントラルディレクトリレコード（46バイト固定部 + ファイル名）
      for (i = 0; i < entries.length; i++) {
        e = entries[i];
        var cdr = new Uint8Array(46 + e.nameBytes.length);
        u32(cdr, 0, 0x02014B50);          // シグネチャ 'PK\x01\x02'
        u16(cdr, 4, VERSION);             // version made by
        u16(cdr, 6, VERSION);             // version needed to extract
        u16(cdr, 8, FLAG_UTF8);           // 汎用フラグ（bit11: UTF-8）
        u16(cdr, 10, 0);                  // 圧縮方式 0 = STORE
        u16(cdr, 12, e.time);             // 更新時刻（DOS）
        u16(cdr, 14, e.date);             // 更新日付（DOS）
        u32(cdr, 16, e.crc);              // CRC-32
        u32(cdr, 20, e.size);             // 圧縮後サイズ
        u32(cdr, 24, e.size);             // 元サイズ
        u16(cdr, 28, e.nameBytes.length); // ファイル名長
        u16(cdr, 30, 0);                  // 拡張フィールド長
        u16(cdr, 32, 0);                  // コメント長
        u16(cdr, 34, 0);                  // 開始ディスク番号
        u16(cdr, 36, 0);                  // 内部属性
        u32(cdr, 38, 0);                  // 外部属性
        u32(cdr, 42, e.offset);           // ローカルヘッダのオフセット
        cdr.set(e.nameBytes, 46);
        chunks.push(cdr);
        cdSize += cdr.length;
      }

      // EOCD（セントラルディレクトリ終端レコード・22バイト）
      var eocd = new Uint8Array(22);
      u32(eocd, 0, 0x06054B50);          // シグネチャ 'PK\x05\x06'
      u16(eocd, 4, 0);                   // このディスク番号
      u16(eocd, 6, 0);                   // セントラルディレクトリ開始ディスク
      u16(eocd, 8, entries.length);      // このディスク上のエントリ数
      u16(eocd, 10, entries.length);     // 総エントリ数
      u32(eocd, 12, cdSize);             // セントラルディレクトリのサイズ
      u32(eocd, 16, cdOffset);           // セントラルディレクトリのオフセット
      u16(eocd, 20, 0);                  // コメント長
      chunks.push(eocd);

      var total = cdOffset + cdSize + 22;
      if (total > MAX_U32) {
        throw new Error('exportZip: アーカイブが4GBを超えました（ZIP64非対応）');
      }

      // 全チャンクを連結して1本の Uint8Array にする
      var out = new Uint8Array(total);
      var pos = 0;
      for (i = 0; i < chunks.length; i++) {
        out.set(chunks[i], pos);
        pos += chunks[i].length;
      }
      chunks = null; // 参照解放
      return out;
    }

    return { add: add, finish: finish };
  }

  g.TS.exportZip = {
    create: create,
    crc32: crc32 // テスト・検証用に公開
  };
})();
