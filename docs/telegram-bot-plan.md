# Sera Protocol オンチェーンFX Telegram Bot 実装計画

## Context

`telegram-bot/`（現状は Mastra weather スターター）を、Sera Protocol をフル活用したオンチェーンFX特化の Telegram bot に作り変える。ターゲットは FX・オンチェーン金融・ステーブルコイン初心者。Privy サーバーウォレットでシードフレーズ不要のオンボーディングを実現し、日英2言語対応、Ethereum mainnet / Sepolia 両対応、Cloud Run にデプロイする。

**ユーザー確認済みの決定事項:**
- 取引範囲: 即時スワップ + 指値注文 + 送金付き両替（国際送金）
- UX: コマンド + インラインキーボード（定型操作）+ Mastra AI チャット（自由入力・初心者Q&A）
- 永続化: LibSQL（ローカル `file:`、本番 Turso）
- LLM: Anthropic claude-sonnet-4-5（scaffold 踏襲）

**調査で確定した技術判断:**
- **Sera REST API v2 を直接利用**（`https://api.sera.cx/api/v1` / `https://api-testnet.sera.cx/api/v1`）。v1 GraphQL/Router は使わない。sera-mcp は組み込まない — 1プロセス1ネットワーク制約がありライブラリとして公開されていないため、薄い型付き REST クライアントを自作する方がマルチネットワーク対応に適する。
- **Privy は EIP-712 署名エンジンとして使う**: swap の `Intent`、指値の `Order`、`CancelOrder`、`ManageApiKey` を `eth_signTypedData_v4` で署名。swap はガス代込み quote（`gas_mode: receive_less`）なのでユーザーは ETH 不要。
- **Sera API キーはユーザーウォレットごとに発行**: オンボーディング時に Privy ウォレットで `ManageApiKey` を署名 → `POST /api-keys` → key/secret をネットワーク別に DB 保存（残高照会・tx ビルダーに必要）。
- **Sera はスポット専用**（fx-trading-features skill のガードレール）: レバレッジ・証拠金・逆指値は存在しない。bot の文言でもそう説明する。

## アーキテクチャ

```
Telegram ──webhook──> Hono (POST /telegram/webhook)
                        │
                  grammY Bot（コマンド・インラインキーボード・セッション）
                        │                    │
              ┌─────────┴─────────┐    自由入力テキスト
              │  Service layer     │◄── Mastra Agent (claude-sonnet-4-5)
              │ （両フロント共用） │    read ツール + prepare ツールのみ
              └────────┬──────────┘
        ┌──────────┬───┴──────┬──────────┐
     SeraClient  PrivySigner  DB(libsql)  viem publicClient
     (REST v2)   (EIP-712/    users/orders (ネイティブETH残高)
      network別)  rawTx署名)   pending_actions
```

**設計原則:**
1. **サービス層は1つ、フロントは2つ** — 全機能（レート/残高/quote/swap/注文）は `src/services/*` に置き、grammY ハンドラと Mastra ツールの両方から呼ぶ。挙動の乖離を構造的に防ぐ。
2. **エージェントは署名しない** — Mastra の実行系ツールは `pending_actions` 行を作って止まる（prepare のみ）。bot 層がインラインキーボードの確認カード（金額・レート・手数料・宛先・ネットワーク・quote 期限を表示）を出し、ボタンタップ（callback_query）だけが PrivySigner → Sera 送信に到達する。資金移動の唯一のチョークポイント。
3. **署名ペイロードは Sera レスポンスをそのまま署名** — `route_params` / `/orders/preview` の EIP-712 ペイロードをクライアント側で再構築しない。domain は `GET /config` から取得（network 別キャッシュ）。
4. **アドレスの大文字小文字**: read 系 `owner_address` は小文字、署名ペイロードは checksummed。

## ディレクトリ構成（telegram-bot/src）

```
src/
├── index.ts              # 起動: config → migrate → bot → Hono（webhook）or bot.start()（polling）
├── config.ts             # zod で env 検証; NETWORKS: {mainnet, sepolia} → {seraBaseUrl, rpcUrl, chainId, explorer}
├── bot/
│   ├── bot.ts            # createBot(deps); middleware: session → user-load → i18n → handlers; bot.catch
│   ├── context.ts        # MyContext = Context & {user, t, services}
│   ├── commands/         # start / wallet / balance / rate / swap / send / order / orders / deposit / network / language / help
│   ├── callbacks.ts      # callback_query ルーター（"act:confirm:<id>" 等、64byte 制限内）
│   ├── keyboards.ts      # トークン選択・確認・注文一覧・言語・ネットワークの各キーボード
│   ├── flows.ts          # 複数ステップフローの session state machine（swap/order のドラフト）
│   ├── agent-bridge.ts   # message:text → agent.stream(resourceId=tg:<uid>, threadId=tg:<uid>:<network>); prepare 結果を確認カード化
│   └── format.ts         # 金額整形・アドレス短縮・MarkdownV2 エスケープ
├── i18n/
│   ├── messages.ts       # MessageKey = keyof typeof en; makeTranslator(lang)
│   └── en.ts / ja.ts     # 型付きカタログ（ja: Record<MessageKey,…> でコンパイル時に網羅性保証）
├── sera/
│   ├── client.ts         # SeraClient(baseUrl, apiKey?): getTokens/getMarkets/getConfig/getFxRate/getBalances/
│   │                     #   swapQuote/submitSwap/previewOrder/submitOrder/getOrder/listOrders/cancelOrder/
│   │                     #   buildApprove/buildDeposit/sendTx/createApiKey/getSystemTime/verifySignature
│   ├── types.ts          # 全レスポンスの zod schema; SeraErrorCode union
│   ├── errors.ts         # SeraApiError {code,status}; toUserMessageKey(code) → i18n キー
│   ├── uuid-int.ts       # encodeUuidInt(orderId): [255:252]executor|[251:124]id|[123:12]group|[11:0]leg
│   │                     #   （standalone: group=id>>16, leg=0）— API が不一致を reject するため要正確
│   └── precision.ts      # quantizeAmount（tick/quantity_precision 準拠、reject_extra_precision 対応）
├── privy/
│   ├── client.ts         # PrivyClient({appId, appSecret})
│   └── signer.ts         # PrivySigner: signTypedData(walletId, typedData) / signTransaction(walletId, tx) /
│                         #   createWallet(idempotencyKey=telegram_user_id 由来)
├── services/
│   ├── index.ts          # buildServices(config, db): DI コンテナ; seraFor(user) で network 別クライアント解決
│   ├── user-service.ts   # getOrCreateUser / setLanguage / setNetwork / ensureWallet / ensureApiKey
│   ├── account-service.ts# サマリー: address + viem ETH 残高 + Sera /balances（10^decimals 換算）
│   ├── rate-service.ts   # /fx/rate, /markets
│   ├── swap-service.ts   # prepareSwap（quote→pending_action）/ executeSwap（署名→POST /swap、409/410 は再quote）
│   ├── order-service.ts  # prepareLimitOrder（time sync→preview→uuid_int）/ executeOrder / listOrders /
│   │                     #   prepareCancel / executeCancel（5分クールダウンの 429 を丁寧に案内）/ refreshOrderStatus
│   ├── deposit-service.ts# permit 経路（USDC/EURC/EURT の ERC-2612）or approve+deposit（ガスETH必要と明示警告）
│   └── pending-actions.ts# 単回使用・TTL=quote expires_at
├── db/
│   ├── client.ts / migrate.ts / repositories.ts  # @libsql/client 直（ORM なし、パラメタライズド SQL）
│   └── migrations/001_init.sql
└── mastra/
    ├── index.ts          # seraFxAgent 登録; LibSQLStore の URL を DATABASE_URL に統一
    ├── agents/sera-fx-agent.ts
    └── tools/            # read: get-fx-rate / get-balances / list-markets / list-orders / explain
                          # prepare: prepare-swap / prepare-send / prepare-limit-order / prepare-cancel
```

weather-agent / weather-tool / weather-workflow は削除（AGENTS.md に従い登録も `src/mastra/index.ts` から除去）。

## 主要フロー

- **`/start` オンボーディング**: 言語選択（`from.language_code` からデフォルト）→「ウォレット作成」ボタン → Privy ウォレット作成（idempotency key 付き）→ ManageApiKey 署名で Sera API キー発行 → イントロカード。再実行はサマリー表示（冪等）。
- **`/swap`**: from トークン → to トークン → 金額（quantizeAmount で検証）→ `POST /swap/quote`（`gas_mode: receive_less`、ETH 不要）→ 確認カード（min_output・手数料・期限）→ Confirm → `route_params` をそのまま署名 → `POST /swap`。`QUOTE_STALE`/409/410 は自動で再 quote して新カード提示。
- **`/send`（国際送金）**: `/swap` + 宛先ステップ（viem `isAddress` 検証、外部アドレス警告、二重確認）。recipient に第三者アドレスを指定した swap として実行。
- **`/order` 指値**: ペア → 売買 → 価格（tick_precision）→ 数量（quantity_precision）→ Vault 残高プリチェック（不足なら `/deposit` 誘導）→ `GET /system/time` 同期 → `/orders/preview`（client UUID4 + encodeUuidInt）→ 確認 → 署名 → `POST /orders` → DB 保存。`order_id` と `uuid_int` は両方永続化、リトライは同じ order_id を再送（サーバー側 dedupe で冪等）。
- **`/orders`**: DB の注文を `GET /orders/{id}` で更新表示。キャンセルは CancelOrder 署名 → `/orders/cancel`（発注後5分クールダウンは「あとN分」表示）。
- **`/deposit`**: permit 対応トークンは permit、他は approve+deposit の unsigned tx を API で構築 → `eth_signTransaction` → `POST /tx/send`。**deposit はガス ETH が必要**な旨を ETH 残高チェック付きで警告。
- **`/network`**: mainnet ⇔ Sepolia 切替（per-user）。切替時に新ネットワークの API キーを遅延発行。mainnet 切替には実資金警告。残高・注文表示・エージェント threadId は network 別。
- **自由入力** → Mastra `seraFxAgent`: 初心者向け FX/ステーブルコイン/Sera チュータ + ツール呼び出し。runtimeContext に `{userId, network, language, walletAddress}` を注入し、ツールはモデル指定の identity を信用しない。prepare 系ツールの結果は agent-bridge が確認カード（コマンドフローと同一の confirm 経路）として別メッセージで送出。instructions で「スポット専用・レバレッジ/逆指値なし」「残高やレートは必ずツールで取得」「実行は不可、prepare のみ」を明記。

## DB スキーマ（001_init.sql）

```sql
CREATE TABLE users (
  telegram_user_id INTEGER PRIMARY KEY, privy_user_id TEXT,
  wallet_id TEXT NOT NULL, wallet_address TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'en' CHECK (language IN ('en','ja')),
  network TEXT NOT NULL DEFAULT 'sepolia' CHECK (network IN ('mainnet','sepolia')),
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);

CREATE TABLE user_api_keys (  -- Sera API キー（user × network）。secret は作成時1回のみ返却
  telegram_user_id INTEGER NOT NULL REFERENCES users(telegram_user_id),
  network TEXT NOT NULL, api_key TEXT NOT NULL, api_secret TEXT NOT NULL,
  created_at INTEGER NOT NULL, PRIMARY KEY (telegram_user_id, network));

CREATE TABLE orders (
  order_id TEXT PRIMARY KEY, uuid_int TEXT NOT NULL,
  telegram_user_id INTEGER NOT NULL REFERENCES users(telegram_user_id),
  network TEXT NOT NULL, market TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('bid','ask')),
  price TEXT NOT NULL, amount TEXT NOT NULL, status TEXT NOT NULL,
  placed_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE INDEX idx_orders_user ON orders(telegram_user_id, network, status);

CREATE TABLE pending_actions (
  id TEXT PRIMARY KEY,  -- callback_data に収まる短ランダムID
  telegram_user_id INTEGER NOT NULL, network TEXT NOT NULL,
  kind TEXT NOT NULL,   -- swap|send|limit_order|cancel_order|deposit
  payload TEXT NOT NULL,-- quote uuid + route_params / order payload を verbatim JSON 保存
  expires_at INTEGER NOT NULL, consumed_at INTEGER, created_at INTEGER NOT NULL);
```

Mastra の `LibSQLStore` も同じ `DATABASE_URL` を使う（Mastra 側テーブルは Mastra 管理）。

## 環境変数（.env.example）

```
TELEGRAM_BOT_TOKEN=              TELEGRAM_WEBHOOK_SECRET=
BOT_MODE=polling|webhook         PUBLIC_URL=            PORT=3000
ANTHROPIC_API_KEY=               PRIVY_APP_ID=          PRIVY_APP_SECRET=
DATABASE_URL=file:./data/bot.db  DATABASE_AUTH_TOKEN=   # 本番: libsql://<db>.turso.io
RPC_URL_MAINNET=                 RPC_URL_SEPOLIA=
SERA_API_URL_MAINNET=https://api.sera.cx/api/v1
SERA_API_URL_SEPOLIA=https://api-testnet.sera.cx/api/v1
DEFAULT_NETWORK=sepolia
```

## 実装フェーズ（各フェーズ単体で検証可能）

- **Phase 0 — scaffold 整理・bun 移行**: weather 3点削除、scripts を bun 化（`dev: bun --watch src/index.ts`）、`@hono/node-server`/`tsx` 削除、`grammy`/`@privy-io/node`/`@libsql/client`/`viem`/`uuid` 追加、`config.ts`、`/health`。✔ `bun run dev` + typecheck + biome クリーン。
- **Phase 1 — DB + i18n + bot 骨格**: マイグレーション、typed カタログ（en/ja）、polling モードで `/start`（言語選択のみ）/`/help`/`/language`、言語別 `setMyCommands`。✔ 言語切替が再起動後も維持。
- **Phase 2 — Sera read 層**: SeraClient 公開エンドポイント + zod + エラーマッピング、`/rate`、uuid-int / precision + テスト。✔ `bun test`、Sepolia の実レート取得。
- **Phase 3 — Privy ウォレット + オンボーディング + 残高**: PrivySigner、ensureWallet、ensureApiKey（署名→発行→認証付き `/balances` で検証）、`/wallet` `/balance`。✔ 新規アカウントが Sepolia でエンドツーエンドにオンボード、`/start` 冪等。
- **Phase 4 — スワップ + 送金付き両替**: swap-service、pending_actions、確認カード、`/swap` `/send`、stale 再quote、error_code 別 UX。✔ Sepolia で実 swap 実行、期限切れ confirm は拒否。
- **Phase 5 — 指値 + Vault 入金**: `/deposit`（permit / approve+deposit）、`/order` `/orders`、キャンセル（クールダウン対応）、状態同期。✔ Sepolia で板から離れた指値 → pending 確認 → 5分後キャンセル。
- **Phase 6 — Mastra エージェント + ブリッジ**: seraFxAgent + ツール + runtimeContext + agent-bridge。✔ 「ユーロを100ドル分買いたい」→ 説明 + prepare → 確認カード → 実行。日本語入力に日本語で応答。
- **Phase 7 — デプロイ**: Dockerfile（oven/bun:1、`tsc --noEmit` は CI のみ）、`scripts/set-webhook.ts`（secret_token + `allowed_updates: ["message","callback_query"]`）、Turso、Cloud Run（Secret Manager、**min-instances=1**（in-memory session 前提。スケールアウト時は session の libsql 化が前提条件と README に明記））。✔ `getWebhookInfo` エラー0、デプロイ先でフル動作。
- **Phase 8 — 仕上げ**: per-user スロットル（Sera rate limit: read 10/s, trade 5/s 対策）、日英コピーを fx-trading-features ガードレールで最終レビュー、README 刷新、`telegram-bot/AGENTS.md` にプロジェクト不変条件を追記（署名は verbatim / read は小文字アドレス / 資金移動はサービス層のみ）。

## テスト・検証

- **bun test（unit）**: uuid-int エンコード/デコード往復 + bit-layout 既知ベクトル、precision（JPYC 18 / USDC 6 decimals、extra precision reject）、i18n 網羅性（型 + キー集合一致）、pending_actions 単回使用/期限、callback_data 64byte。
- **統合（Sepolia 公開 API、資金不要）**: `/health` `/tokens` `/markets` `/config` `/fx/rate` を zod で parse — API ドリフト検知を兼ねる。
- **手動 E2E（`scripts/e2e-sepolia.ts` + README チェックリスト）**: ウォレット作成 → faucet で ETH + testnet USDC → `/rate` → `/swap` 実行 → 残高差分確認 → `/order` → キャンセル → `/send` → `/network`。
- **資金なしでは検証不可**: 実 settlement、deposit のガス経路、mainnet 全般、STP/流動性エラー分岐（→ `toUserMessageKey` の単体テストでカバー）。

## リスク・オープン事項

1. **Privy のユーザーモデル**: `@privy-io/node` 最新版で Telegram 連携ユーザーをサーバー作成できるか Phase 3 で確認。フォールバックは app-owned ウォレット + DB マッピング（`privy_user_id` 列の使い方が変わるだけ）。
2. **同一通貨送金**: Sera swap は異種トークン前提。同一トークン送金は素の ERC-20 transfer（ガス ETH 必要）にフォールバックするか Phase 4 で判断（未実装なら「準備中」表示）。
3. **API secret 平文保存**: 読取/tx ビルダー権限のみ（取引は別途 EIP-712 必須）で影響は限定的だが、`KEY_ENCRYPTION_SECRET` による AES-GCM 暗号化を fast follow 候補に。
4. **Sepolia の流動性薄**: `NO_LIQUIDITY` を第一級の UX として扱う（E2E で必ず遭遇する）。
5. **mainnet 安全策**: 後続イテレーションで per-swap 上限や「CONFIRM 入力」ステップを検討。
6. **新規 Skill/MCP/サブエージェントは作らない**: sera-protocol / privy / mastra / fx-trading-features / cloud-run-basics で全統合面をカバー済み。プロジェクト固有の不変条件は `telegram-bot/AGENTS.md` に追記する（Phase 8）。

## 実装時に参照する既存資産

- `.claude/skills/sera-protocol/references/api-reference.md` — REST v2 全エンドポイント・error_code・EIP-712 構造の一次資料
- `.claude/skills/privy/SKILL.md` — PrivyClient 初期化・idempotency・policy の注意点
- `.claude/skills/mastra/` — **コード記述前に必ず embedded docs（node_modules/@mastra/*/dist/docs/）で API 検証**（AGENTS.md の必須事項）
- `.claude/skills/fx-trading-features/references/fx-glossary.md` — 日英コピーの FX 用語正確性チェック
- `.claude/skills/cloud-run-basics` / `gcloud` — Phase 7 デプロイ手順
- 既存 scaffold の Mastra パターン（`Agent`/`createTool`/`Memory`/`Mastra` 登録）は `src/mastra/` にそのまま踏襲
