# Telopra クラウド保存 Worker（§7）

「保存履歴」タブのデータ（Scene JSON ＋ サムネ）を保存する Cloudflare Worker + KV。
**無料枠で運用可能**。デプロイしなくても保存履歴タブは「この端末のみのローカル保存」で動きます。
クラウド共有（URLを配れば知り合いも各自の履歴で使える）にしたい場合だけ、以下でデプロイしてください。

## 仕組み（B方式）
- 匿名ID方式（ログイン無し）。ブラウザが初回に匿名IDを自動発行し `localStorage` に保存。IDごとに保存領域。
- 保存上限 **150件・FIFO**（151件目でサーバ側が最古を自動削除）。
- KV レイアウト: `idx:<id>`（一覧メタ＋サムネ）/ `rec:<id>:<key>`（Scene本体・呼び出し時のみ読む）。
- **割り切り**: IDを知られると他人がそのデータを見られます（緩いセキュリティ）。ガチの個人情報は載せない前提。知り合い配布用途では許容。

## デプロイ手順
前提: Node.js が入っていること。`cd Telopra/worker`

```bash
# 1) Cloudflare にログイン
npx wrangler login

# 2) KV ネームスペースを作成（出力される id を控える）
npx wrangler kv namespace create TELOPRA_KV

# 3) wrangler.toml の id = "＜ここにKVのidを貼る＞" に、2) の id を貼る

# 4) デプロイ（成功すると https://telopra-cloud.＜サブドメイン＞.workers.dev が発行される）
npx wrangler deploy
```

## アプリ側の設定
デプロイで発行された URL を、`Telopra/js/cloud.js` の先頭 `API_BASE` に設定します。

```js
var API_BASE = 'https://telopra-cloud.＜あなたのサブドメイン＞.workers.dev';
```

設定して再デプロイ（GitHub Desktop で push → Cloudflare Pages 再ビルド）すると、保存履歴がクラウドに切り替わります。

## 課金アラート（青天井課金の防止・必須）
無料枠内で収まる想定ですが、**万一の超過に事前に気づける**よう使用量アラートを設定してください。
- Cloudflare ダッシュボード → 「Notifications」→ 「Add」→ Workers / KV の使用量系アラートを作成し、しきい値（例: 無料枠の80%）とメール通知先を設定。
- 無料枠の目安（2024年時点・変更あり得るので要確認）: Workers 10万リクエスト/日、KV 読み取り10万/日・書き込み1000/日・ストレージ1GB。個人〜知り合い数十人規模ならまず収まります。

## API（すべて POST・JSON body に `id` を含む）
- `POST /save`  … `{id, scene, thumb, name, savedAt}` → `{key}`
- `POST /list`  … `{id}` → `{items:[{key,name,savedAt,thumb}]}`
- `POST /load`  … `{id, key}` → `{scene}`
- `POST /delete`… `{id, key}` → `{ok:true}`

CORS は全オリジン許可（`*`）。file:// からは動きません（http(s) 配信時のみ）。
