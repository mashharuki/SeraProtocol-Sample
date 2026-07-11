# Sera FX Telegram Bot

Sera Protocol をフル活用した、オンチェーン・ステーブルコイン FX 特化の Telegram bot。
FX・オンチェーン金融・ステーブルコイン初心者でも、シードフレーズなし（Privy サーバーウォレット）で
安全にガイドされながら取引できます。英語・日本語対応、Ethereum Mainnet / Sepolia 両対応。

An on-chain stablecoin-FX Telegram bot built on Sera Protocol. Beginner-friendly:
seedless onboarding via Privy server wallets, guided confirmation cards for every
trade, English/Japanese, Mainnet + Sepolia.

## Demo Video

[![demo]()](https://youtu.be/qF3D--eui8o)

## Features

| Command | What it does |
|---|---|
| `/start` | 言語選択 → Privy ウォレット自動作成 → Sera API キー発行 |
| `/wallet` `/balance` | アドレス表示、ETH + ステーブルコイン残高（ウォレット/ボールト別） |
| `/rate` | ライブ為替レート（Sera `/fx/rate`） |
| `/liquidity` | いまスワップ可能な主要ペアを実測表示（`/swap/quote` を並列プローブ） |
| `/swap` | 即時両替 — ガス代込み quote（`gas_mode: receive_less`）なので **ETH 不要** |
| `/send` | 国際送金 — 両替して別通貨のまま第三者アドレスへ届ける |
| `/order` `/orders` | 板への指値注文・状況確認・キャンセル（5分クールダウン対応） |
| `/provide` | **流動性提供** — Sera Virtual Liquidity バッチで複数マーケットに1つの共有予算から気配を出す（ロックは最大1本分のみ、`/orders` から一括キャンセル） |
| `/deposit` | Sera Vault への入金（approve + deposit、こちらは要ガス ETH） |
| `/network` `/language` | Mainnet ⇄ Sepolia 切替 / EN ⇄ JA 切替 |
| 自由入力 | Mastra AI エージェント（claude-sonnet-4-5）が初心者向けに解説 + 取引を**準備** |

**セキュリティ設計**: AI エージェントは署名できません。すべての資金移動は
`pending_actions`（単回使用・TTL 付き）→ 確認カード → ユーザーのボタンタップ →
`PrivySigner` という単一経路のみを通ります。

## Architecture

```
Telegram ──webhook/polling──> Hono + grammY
                                │
                     Service layer (src/services)   ←── Mastra seraFxAgent
                        │           │        │            (read + prepare tools のみ)
                   SeraClient  PrivySigner  LibSQL
                   (REST v2)   (EIP-712)    (users/orders/pending_actions)
```

- 署名ペイロード（swap `route_params` / `/orders/preview` の EIP-712）は Sera のレスポンスを **verbatim** で署名
- read 系 `owner_address` は小文字、署名系は checksummed
- EIP-712 domain・コントラクトアドレスは `GET /config` から取得（ハードコード禁止）

## Setup (local)

```bash
cd telegram-bot
bun install
cp .env.example .env   # TELEGRAM_BOT_TOKEN / PRIVY_APP_ID / PRIVY_APP_SECRET を設定
bun run dev            # polling モードで起動
```

必須の環境変数は `.env.example` を参照。`ANTHROPIC_API_KEY` 未設定でも
コマンド操作はすべて動作します（AI チャットのみ無効）。

### Verify

```bash
bun run typecheck   # tsc --noEmit
bun test            # uuid-int / precision / i18n / pending-actions
bun run check       # biome
```

## API docs (Swagger UI)

起動中のサーバは、bot と同じサービス層を使う**読み取り専用 API** と自動生成ドキュメントを公開します:

| Path | 内容 |
|---|---|
| `/docs` | Swagger UI（ブラウザから各エンドポイントを試せます） |
| `/openapi.json` | OpenAPI 3.0 スキーマ（`@hono/zod-openapi` で zod スキーマから自動生成） |
| `GET /health` | liveness チェック |
| `GET /api/tokens?network=` | 取引可能なステーブルコイン一覧 |
| `GET /api/markets?network=` | 注文板マーケット一覧（精度ルール付き） |
| `GET /api/rate?base=USD&quote=EUR&network=` | ライブ為替レート |

```bash
bun run dev
open http://localhost:3000/docs
```

公開しているのは Sera の**パブリックデータのみ**です。ユーザー固有データ（残高・注文）や
資金移動は Telegram 専用で、この API からは一切触れません。Telegram webhook
（`POST /telegram/webhook`）もシークレットトークン保護のため意図的に非掲載です。

## Run with Docker Compose

```bash
cp .env.example .env   # 必須値を埋める（.env はそのままコンテナに自動読込される）
docker compose up --build -d
docker compose logs -f sera-fx-bot
```

- `.env` は `env_file` でコンテナの環境変数として自動読込されます
- SQLite（`data/bot.db`）は `./data` にマウントされ、コンテナを作り直しても永続化されます
- コンテナ内は常にポート 3000 で待ち受け。ホスト側の公開ポートは `.env` の `PORT` で変更できます
- デフォルトは polling モード。webhook を試す場合は `.env` で `BOT_MODE=webhook` + `PUBLIC_URL` + `TELEGRAM_WEBHOOK_SECRET` を設定し、`bun scripts/set-webhook.ts` を実行してください

## Deploy (Cloud Run)

`.env` に必須値を設定した状態で、デプロイスクリプトを実行するだけです:

```bash
./scripts/deploy.sh
```

スクリプトが自動で行うこと:

1. `.env` を読み込み、必須値（`TELEGRAM_BOT_TOKEN` / `TELEGRAM_WEBHOOK_SECRET` / `PRIVY_APP_ID` / `PRIVY_APP_SECRET`）を検証
2. 必要な GCP API（Cloud Run / Secret Manager / Cloud Build / Artifact Registry）を有効化
3. `.env` のシークレット値を Secret Manager に `sera-fx-bot-<var名>` として登録・更新し、ランタイム SA にアクセス権を付与
4. `gcloud run deploy --source .`（`min/max-instances=1`、`BOT_MODE=webhook`）
5. デプロイ先 URL で Telegram webhook を登録（`scripts/set-webhook.ts`）

プロジェクト/リージョン/サービス名は環境変数で上書きできます:

```bash
GCP_PROJECT_ID=my-project REGION=us-central1 SERVICE_NAME=my-bot ./scripts/deploy.sh
```

破棄する場合:

```bash
./scripts/destroy.sh                 # webhook 解除 + Cloud Run サービス削除（確認あり）
./scripts/destroy.sh --with-secrets  # Secret Manager のシークレットも削除
./scripts/destroy.sh --yes           # 確認プロンプトをスキップ
```

補足:

- 本番 DB は [Turso](https://turso.tech)（`DATABASE_URL=libsql://...` + `DATABASE_AUTH_TOKEN`）。
  `file:` のままだと Cloud Run の揮発 FS 上に置かれ再起動で消えます（スクリプトが警告します）
- **max-instances=1 が前提**: フロー状態（swap/order のドラフト）はインメモリセッションです。
  スケールアウトするには session を libsql 化する必要があります。

## Manual E2E checklist (Sepolia)

1. `/start` → 言語選択 → ウォレット作成（再実行して冪等性確認）
2. faucet で ETH を、Sera testnet トークン（USDC 等）をウォレットに送る
3. `/balance` で残高反映を確認
4. `/rate` → `/swap` 100 USDC → EURC → 確認カード → Confirm → `/balance` 差分確認
5. 期限切れの確認カードを押して拒否されることを確認
6. `/deposit` USDC → `/order` 板から離れた指値 → `/orders` で pending → 5分後キャンセル
7. `/send` 少額を別アドレスへ → Etherscan で着金確認
8. `/network` mainnet 切替 → 警告表示 → sepolia へ戻す
9. 自由入力「100ドル分ユーロを買いたい」→ 説明 + 確認カード（日本語入力に日本語で応答）

## Known limitations / TODO

- **CancelOrder の EIP-712 struct レイアウトは API リファレンスからの推定**（ManageApiKey は live 検証済み）
  — 実注文が存在する状態での初回キャンセル時に検証すること（`src/services/order-service.ts` の NOTE 参照）
- 同一通貨送金（例: USDC → USDC）は未対応（「準備中」表示）
- Sera API secret は平文で DB 保存（read/tx-builder 権限のみ）。AES-GCM 暗号化は fast-follow
- **Sepolia の swap 流動性はほぼゼロ**（2026-07 時点で主要ペアは XIDR→USDT のみ成立）。
  `NO_LIQUIDITY` は正しい応答。指値注文は全主要ペアで可能なので、
  `/faucet` → `/deposit` → `/order` の順で試すのが推奨ルート（自分の指値が将来の swap 流動性になる）
- `/order` `/rate` のペア選択は主要ステーブルコインペアのみ表示（Telegram のボタン数上限のため。全 6786 マーケットは AI チャット経由で利用可能）

## Example Wallet 

[Sepolia 0x7eb0348ebfde6c9c7094fb921663e6a12d950bbe](https://sepolia.etherscan.io/address/0x7eb0348ebfde6c9c7094fb921663e6a12d950bbe)