# SeraProtocol MCP Server

SeraProtocol の分散型オーダーブック取引プロトコルを **自然言語** で操作できる [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) サーバーです。

Claude Code や Claude Desktop などの MCP 対応クライアントに接続すると、「板情報を見せて」「買い注文を出して」といった会話だけで、オンチェーンのオーダーブックを読み書きできます。

---

## 概要

```
┌──────────────────────┐      stdio / JSON-RPC       ┌──────────────────────┐
│                      │ ◄──────────────────────────► │                      │
│   MCP Client         │                              │  sera-mcp-server     │
│   (Claude Code,      │                              │                      │
│    Claude Desktop)   │                              │  ┌────────────────┐  │
│                      │                              │  │ Subgraph API   │──┼──► GraphQL (読み取り)
│   自然言語で指示     │                              │  └────────────────┘  │
│   "板情報を見せて"   │                              │  ┌────────────────┐  │
│                      │                              │  │ viem + RPC     │──┼──► Ethereum Sepolia (書き込み)
└──────────────────────┘                              │  └────────────────┘  │
                                                      └──────────────────────┘
```

### 特徴

- **読み取り操作はウォレット不要** — マーケット情報、板情報、注文一覧はサブグラフ経由で即座に取得
- **書き込み操作はトランザクション送信前にシミュレーション** — 失敗しそうな注文を事前に検出
- **Zod によるスキーマバリデーション** — 不正なパラメータは MCP 側でブロック
- **Etherscan リンク付きレスポンス** — トランザクション結果をすぐに確認可能

---

## ツール一覧

### 読み取り専用ツール（PRIVATE_KEY 不要）

| ツール | 説明 | 主な用途 |
|--------|------|----------|
| `sera_get_market` | マーケット情報の取得 | トークンペア、手数料、最新価格の確認 |
| `sera_list_markets` | 利用可能なマーケット一覧 | どのマーケットがあるか調べる |
| `sera_get_orderbook` | オーダーブック（板情報）の取得 | bid/ask の価格と数量を確認 |
| `sera_get_orders` | ユーザーの注文一覧 | 自分の注文状況・クレーム可能な注文を確認 |
| `sera_get_token_balance` | トークン残高の確認 | ウォレットの ERC20 残高を確認 |

### 書き込みツール（PRIVATE_KEY 必要）

| ツール | 説明 | 主な用途 |
|--------|------|----------|
| `sera_place_order` | リミットオーダーの発注 | 指値での買い/売り注文 |
| `sera_claim_order` | 約定済み注文の請求 | フィルされた注文のトークンを回収 |
| `sera_approve_token` | トークン承認 | Router コントラクトへの ERC20 approve |

---

## セットアップ

### 前提条件

- Node.js >= 24
- npm

### 1. ビルド

```bash
cd mcp-server
npm install
npm run build
```

### 2. 環境変数

| 変数 | 必須 | 説明 |
|------|------|------|
| `PRIVATE_KEY` | 書き込み操作のみ | `0x` + 64文字の16進数。読み取り専用なら不要 |
| `SEPOLIA_RPC_URL` | いいえ | カスタム RPC URL（デフォルト: `https://0xrpc.io/sep`） |

> **注意**: PRIVATE_KEY はテストネット用のキーのみを使用してください。メインネットの秘密鍵は絶対に設定しないでください。

---

## クライアント設定

### Claude Code

プロジェクトの `.claude/settings.local.json` に追加:

```json
{
  "mcpServers": {
    "sera": {
      "command": "node",
      "args": ["./mcp-server/dist/index.js"],
      "env": {
        "PRIVATE_KEY": "0x...",
        "SEPOLIA_RPC_URL": "https://0xrpc.io/sep"
      }
    }
  }
}
```

### Claude Desktop

`~/Library/Application Support/Claude/claude_desktop_config.json` (macOS):

```json
{
  "mcpServers": {
    "sera": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-server/dist/index.js"],
      "env": {
        "PRIVATE_KEY": "0x..."
      }
    }
  }
}
```

---

## 使い方

MCP クライアントに接続後、自然言語で指示するだけで SeraProtocol を操作できます。

### マーケット情報を確認する

```
> マーケット情報を見せて

# Market: TWETH/TUSDC
- Latest Price: 100.0000 TUSDC
- Maker Fee: 0 / Taker Fee: 0
- Quote Unit: 1000
...
```

### 板情報を確認する

```
> TWETH/TUSDC の板情報を見せて

# Order Book: TWETH/TUSDC
## Asks (Sell Orders)
| Price Index | Price   | Amount |
|-------------|---------|--------|
| 105         | 105.00  | 500    |
...

## Bids (Buy Orders)
| Price Index | Price   | Amount |
|-------------|---------|--------|
| 99          | 99.00   | 1,000  |
...
```

### 注文を出す

```
> プライスインデックス 100 で 1000 の買い注文を出して

# Order Placed Successfully
- Type: BID (Buy)
- Price Index: 100
- Transaction: 0xabc...
- Explorer: https://sepolia.etherscan.io/tx/0xabc...
```

### 注文をクレームする

```
> 約定した注文をクレームして

# Order Claimed Successfully
- Transaction: 0xdef...
- Explorer: https://sepolia.etherscan.io/tx/0xdef...
```

### 典型的なワークフロー

```
1. sera_list_markets        → マーケットを探す
2. sera_get_market           → 詳細を確認
3. sera_get_orderbook        → 板情報で適切な価格を判断
4. sera_get_token_balance    → 残高を確認
5. sera_approve_token        → Router にトークンを承認
6. sera_place_order          → 注文を発注
7. sera_get_orders           → 注文状況を監視
8. sera_claim_order          → 約定後にクレーム
```

---

## プロジェクト構成

```
mcp-server/
├── src/
│   ├── index.ts              # エントリポイント (stdio transport)
│   ├── constants.ts          # ABI、コントラクトアドレス、チェーン設定
│   ├── types.ts              # TypeScript 型定義
│   ├── schemas/
│   │   └── index.ts          # Zod バリデーションスキーマ
│   ├── services/
│   │   ├── subgraph.ts       # GraphQL サブグラフクエリ
│   │   ├── blockchain.ts     # viem によるオンチェーン操作
│   │   └── format.ts         # 価格・金額のフォーマッター
│   └── tools/
│       ├── read-tools.ts     # 読み取り専用ツール (5個)
│       └── write-tools.ts    # 書き込みツール (3個)
├── dist/                     # ビルド出力
├── package.json
├── tsconfig.json
└── README.md
```

---

## ネットワーク情報

| 項目 | 値 |
|------|-----|
| Chain | Ethereum Sepolia Testnet |
| Chain ID | `11155111` |
| Router | `0x82bfe1b31b6c1c3d201a0256416a18d93331d99e` |
| Default Market | `0x002930b390ac7d686f07cffb9d7ce39609d082d1` (TWETH/TUSDC) |
| Subgraph | `https://api.goldsky.com/.../sera-pro/1.0.9/gn` |
| Block Explorer | `https://sepolia.etherscan.io` |

---

## 技術スタック

| 技術 | 用途 |
|------|------|
| [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk) | MCP プロトコル実装 |
| [viem](https://viem.sh/) | Ethereum クライアント (トランザクション送信・コントラクト呼び出し) |
| [Zod](https://zod.dev/) | ランタイム入力バリデーション |
| [Goldsky Subgraph](https://goldsky.com/) | GraphQL によるオンチェーンデータ取得 |

---

## 開発

```bash
# 開発モード (ファイル変更で自動リロード)
npm run dev

# ビルド
npm run build

# 実行
npm start
```

### MCP Inspector でテスト

```bash
npx @modelcontextprotocol/inspector
```

### MCPの検証例

```json
{
  "status": "ok",
  "server": "sera-mcp-server",
  "version": "1.0.0",
  "transport": "streamable-http"
}
```

---

## ライセンス

このプロジェクトは [SeraProtocol-Sample](https://github.com/SeraProtocol/SeraProtocol-Sample) リポジトリの一部です。
