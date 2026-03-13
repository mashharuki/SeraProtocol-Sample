# eval-1: GraphQL Orderbook (without skill)

## 概要

SeraProtocol サブグラフ（Goldsky）から TWETH/TUSDC マーケットの板情報（bid/ask 各5本）を取得する TypeScript スクリプトを作成した。viem は使用せず `fetch` のみで実装。

## 調査内容

### サブグラフエンドポイント

既存コードベースから以下の Goldsky エンドポイントを特定:

```
https://api.goldsky.com/api/public/project_cmicv6kkbhyto01u3agb155hg/subgraphs/sera-pro/1.0.9/gn
```

- ソース: `mcp-server/src/constants.ts` および `frontend/src/config/constants.ts`

### マーケットアドレス

```
0x002930b390ac7d686f07cffb9d7ce39609d082d1
```

### GraphQL スキーマ（板情報）

既存実装 (`mcp-server/src/services/subgraph.ts`, `frontend/src/hooks/useDepths.ts`) から、板情報は `depths` エンティティで管理されていることを確認:

- フィルタ: `market`, `isBid` (true=買い/false=売り), `rawAmount_gt: "0"`
- ソート: `priceIndex` (bids は desc、asks は asc)
- フィールド: `priceIndex`, `price`, `rawAmount`

## 成果物

| ファイル | 説明 |
|---|---|
| `getOrderBook.ts` | 板情報取得スクリプト（TypeScript, fetch のみ） |

## 実行方法

```bash
npx tsx getOrderBook.ts
```

## 出力例

```
Fetching order book for TWETH/TUSDC market ...
  Market : 0x002930b390ac7d686f07cffb9d7ce39609d082d1
  Depth  : 5 levels per side

=== ASKS (売り板 -- 価格昇順) ===
priceIndex | price              | rawAmount
-------------------------------------------------------
      ...  |              ...   | ...

=== BIDS (買い板 -- 価格降順) ===
priceIndex | price              | rawAmount
-------------------------------------------------------
      ...  |              ...   | ...
```

## 技術的なポイント

1. **viem 不使用**: `fetch` API のみでサブグラフへ POST リクエストを送信
2. **GraphQL クエリ**: `depths` エンティティに対して `isBid` でフィルタし、bid/ask を分離取得
3. **表示順**: asks は価格の高い方を上に（板の見た目として自然な並び）、bids は価格の高い方を上に表示
4. **エラーハンドリング**: HTTP エラー、GraphQL エラー、データ欠落の3段階でチェック
