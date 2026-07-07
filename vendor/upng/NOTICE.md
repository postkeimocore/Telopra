# vendor/upng — サードパーティライブラリ（APNG書き出し用）

APNG（動くPNG）書き出しのためにローカル同梱している。CDNではなくvendor同梱にしている理由は、
Telopra の自己完結要件（`file://` でも動く / 初回からオフラインで書き出せる）を満たすため。
どちらも軽量（合計約63KB）で Cloudflare Pages の 25MiB 制限には無関係。

## UPNG.js v2.1.0 — `UPNG.min.js`
- ライセンス: MIT
- 出典: https://github.com/photopea/UPNG.js （npm: upng-js@2.1.0）
- 用途: `UPNG.encode(imgs, w, h, 0, dels)` で RGBAフレーム列 → APNG（ロスレス・フルカラー＋8bitα）

## pako v2.1.0 — `pako.min.js`
- ライセンス: MIT AND Zlib
- 出典: https://github.com/nodeca/pako （npm: pako@2.1.0）
- 用途: UPNG が内部で使う deflate 圧縮。**UPNG より先に読み込むこと**（UPNGはロード時にpako参照を確定するため）。
