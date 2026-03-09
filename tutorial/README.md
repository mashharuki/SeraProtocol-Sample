# Sera Protocol Tutorial (Bun + TypeScript + viem)

Python版チュートリアルを `bun + TypeScript + viem` へ移植した、Sera Protocolの注文ライフサイクル実行スクリプトです。

このREADMEは、実装だけでなく実行時に遭遇しやすいポイントまで含めて整理しています。

## 機能

- マーケット情報取得（Subgraph）
- Base/Quote 2トークン残高表示
- 板情報（best bid / best ask）取得
- `postOnly` 安全化付き `limitBid` 発注
- 注文状態ポーリング
- 自動 `claim`（claimableがある場合）
- `claim-only` モード（後から単独で claim 可能）

## ファイル構成

- `src/index.ts`: 実行フロー（オーケストレーション）
- `src/lib/viem.ts`: viemクライアント生成、approve/place/claim、simulate
- `src/utils/constants.ts`: アドレス、ABI、RPC、chain
- `src/utils/helpers.ts`: CLIパース、GraphQL取得、価格補正などの共通ヘルパー

## セットアップ

```bash
bun install
cp .env.example .env
```

`.env` 例:

```bash
PRIVATE_KEY=0x...
SEPOLIA_RPC_URL=https://0xrpc.io/sep
```

## 実行方法

通常実行:

```bash
bun run start
```

注文パラメータ指定:

```bash
bun run start -- --price-index 12000 --raw-amount 1000
```

## CLIオプション

- `--price-index <uint16>`: 注文価格インデックス
- `--raw-amount <uint64>`: `limitBid` に渡す `rawAmount`（公式チュートリアル準拠）
- `--claim-only`: 発注をスキップし、claim処理のみ実行
- `--claim-price-index <uint16>`: claim対象注文の `priceIndex`
- `--claim-order-index <uint256>`: claim対象注文の `orderIndex`
- `--claim-is-bid <true|false>`: claim対象注文の side（省略時 `true`）
- `--help`: ヘルプ表示

## Claim-Onlyモード

注文監視ログには、次のようにキーが出ます。

```text
key={isBid:true,priceIndex:20260,orderIndex:123}
```

このキーを使って後から claim だけ実行できます。

```bash
bun run start -- --claim-only --claim-price-index 20260 --claim-order-index 123 --claim-is-bid true
```

`--claim-price-index` と `--claim-order-index` を省略した場合は、`claimableAmount > 0` の最初の注文を自動で対象にします。

## ログの見方

- `Adjusted priceIndex for postOnly safety ...`:
	入力価格が板条件に対して unsafe な場合に補正されたことを示します。
- `key={isBid:...,priceIndex:...,orderIndex:...}`:
	後から claim-only 実行するための注文キーです。
- `Claim-only command: ...`:
	そのまま実行できる claim-only コマンド例です。

## トラブルシュート

- `eth_sendTransaction does not exist`:
	未署名送信経路になっている可能性があります。現在の実装は `PrivateKeyAccount` でローカル署名送信です。
- `limitBid simulation failed ... 0xe450d38c`:
	`ERC20InsufficientBalance(address,uint256,uint256)`。
	注文に必要な quote token が不足しています。
- `limitBid` が常に revert する:
	ABI不一致の可能性があります。`claimBounty` は `uint32` です。

## 開発コマンド

型チェック:

```bash
bun run check
```

## 注意

- テストネットでも実トランザクションを送信します。
- `PRIVATE_KEY` は絶対にGitへコミットしないでください。
