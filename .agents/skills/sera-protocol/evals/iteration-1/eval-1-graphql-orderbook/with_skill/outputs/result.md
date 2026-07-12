# TWETH/TUSDC マーケットの板情報取得スクリプト

## 使用スキル

**sera-protocol** スキル (`references/graphql-api.md`) を参照し、サブグラフのエンドポイント・クエリ構文・型情報を取得した上で実装しました。

## 概要

Sera Protocol のサブグラフ (Goldsky) から、TWETH/TUSDC マーケットの板情報 (bid 5本 / ask 5本) を `fetch` のみで取得する TypeScript スクリプトです。viem は使用していません。

## 実行方法

```bash
# npx tsx で実行
npx tsx getOrderBook.ts

# または Bun で実行
bun run getOrderBook.ts
```

外部依存パッケージは不要です（Node.js 18+ または Bun のグローバル `fetch` を使用）。

## 技術的なポイント

### サブグラフエンドポイント

```
POST https://api.goldsky.com/api/public/project_cmicv6kkbhyto01u3agb155hg/subgraphs/sera-pro/1.0.9/gn
```

認証不要。レートリミットは 50 クエリ / 10 秒。

### GraphQL クエリ設計

1 回のリクエストで以下を同時取得しています:

- **market**: マーケット情報（quoteUnit, minPrice, tickSpace, latestPrice など）
- **bids**: `depths` エンティティから `isBid: true, rawAmount_gt: "0"` で絞り込み、`priceIndex desc` で最良 bid から 5 本
- **asks**: `depths` エンティティから `isBid: false, rawAmount_gt: "0"` で絞り込み、`priceIndex asc` で最良 ask から 5 本

```graphql
query GetOrderBook($market: ID!, $marketStr: String!, $first: Int!) {
  market(id: $market) {
    id
    quoteToken { symbol decimals }
    baseToken  { symbol decimals }
    quoteUnit
    minPrice
    tickSpace
    latestPrice
    latestPriceIndex
  }
  bids: depths(
    where: { market: $marketStr, isBid: true, rawAmount_gt: "0" }
    orderBy: priceIndex
    orderDirection: desc
    first: $first
  ) {
    priceIndex
    price
    rawAmount
  }
  asks: depths(
    where: { market: $marketStr, isBid: false, rawAmount_gt: "0" }
    orderBy: priceIndex
    orderDirection: asc
    first: $first
  ) {
    priceIndex
    price
    rawAmount
  }
}
```

### マーケットアドレス

TWETH/TUSDC (Sepolia テストネット): `0x002930b390ac7d686f07cffb9d7ce39609d082d1`

### 金額変換

- `price` は 18 桁精度の整数文字列。表示時に `10^18` で割って人間が読める数値にする。
- `rawAmount` から quote トークン単位への変換: `quoteAmount = rawAmount * quoteUnit`。さらに `quoteToken.decimals` で割って表示用にする。

## 出力例

```
Market: TWETH/TUSDC
Market Address: 0x002930b390ac7d686f07cffb9d7ce39609d082d1
Latest Price: 2500.123456 (index: 12345)
Quote Unit: 1000000

=== ORDER BOOK ===
--- Asks (売り) ---
  Price Index | Price              | Raw Amount         | Quote Amount
        12350 |      2500.623456   |           500      | 500.000000
        12349 |      2500.523456   |           300      | 300.000000
        ...
--- Bids (買い) ---
        12344 |      2499.923456   |           400      | 400.000000
        ...

=== RAW JSON ===
{ "bids": [...], "asks": [...] }
```

（実際の値はサブグラフの現在の状態に依存します）

## コード

TypeScript コードは同ディレクトリの `getOrderBook.ts` にあります。
