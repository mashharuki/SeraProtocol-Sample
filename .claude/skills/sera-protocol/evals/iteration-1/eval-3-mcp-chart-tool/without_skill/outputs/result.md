# sera_get_chart_data ツール追加ガイド

## 概要

SeraProtocol MCPサーバーに OHLCV（ローソク足）データを返す read-only ツール `sera_get_chart_data` を追加するために、以下の4ファイルを変更する必要がある。

---

## 変更対象ファイルと変更内容

### 1. `mcp-server/src/types.ts` — OHLCVデータ型の追加

既存パターンに合わせて `OhlcvCandle` インターフェースを追加する。

```typescript
export interface OhlcvCandle {
  timestamp: string;    // Unix timestamp (秒)
  open: string;         // 始値 (raw price)
  high: string;         // 高値
  low: string;          // 安値
  close: string;        // 終値
  volume: string;       // 出来高 (raw amount)
}
```

---

### 2. `mcp-server/src/schemas/index.ts` — 入力スキーマの追加

既存の `GetOrderBookInputSchema` 等と同じパターンで Zod スキーマを追加する。

```typescript
export const GetChartDataInputSchema = z
  .object({
    market_id: MarketIdSchema,
    interval: z
      .enum(["1m", "5m", "15m", "1h", "4h", "1d"])
      .default("1h")
      .describe("Candle interval / time granularity (default: 1h)"),
    limit: z
      .number()
      .int()
      .min(1)
      .max(500)
      .default(100)
      .describe("Number of candles to return (default: 100, max: 500)"),
  })
  .strict();
```

---

### 3. `mcp-server/src/services/subgraph.ts` — Subgraph クエリ関数の追加

既存の `getOrderBook` や `getUserOrders` と同じパターンで、`querySubgraph` ヘルパーを使った関数を追加する。

```typescript
import type { MarketInfo, DepthLevel, OpenOrder, OhlcvCandle } from "../types.js";

// --- 既存の関数の後に追加 ---

export async function getChartData(
  marketId: string,
  interval: string = "1h",
  first: number = 100,
): Promise<OhlcvCandle[]> {
  // NOTE: 実際のSubgraphスキーマに合わせてエンティティ名・フィールド名を調整すること
  // Subgraph側に candles エンティティが無い場合は、trades から集約するか、
  // Subgraph に時系列集約エンティティを追加する必要がある
  const query = `
    query GetCandles($market: String!, $interval: String!, $first: Int!) {
      candles(
        where: { market: $market, interval: $interval }
        orderBy: timestamp
        orderDirection: desc
        first: $first
      ) {
        timestamp
        open
        high
        low
        close
        volume
      }
    }
  `;

  const data = await querySubgraph<{ candles: OhlcvCandle[] }>(query, {
    market: marketId.toLowerCase(),
    interval,
    first,
  });
  return data.candles;
}
```

**重要な注意点**: このクエリは Subgraph 側に `candles` エンティティが定義されていることを前提としている。Subgraph にまだ OHLCV 集約エンティティが無い場合は、以下のいずれかの対応が必要:

- Subgraph の `schema.graphql` に `Candle` エンティティを追加し、`mapping.ts` で Trade イベントから集約ロジックを実装する
- または、既存の `trades` エンティティからクライアントサイドで OHLCV を計算する（この場合はサービス層のロジックが複雑になる）

---

### 4. `mcp-server/src/tools/read-tools.ts` — ツール登録の追加

既存の `sera_get_orderbook` 等と完全に同じパターンで `registerReadTools` 関数内に追加する。

```typescript
// --- ファイル冒頭の import を更新 ---
import {
  GetMarketInputSchema,
  ListMarketsInputSchema,
  GetOrderBookInputSchema,
  GetOrdersInputSchema,
  GetTokenBalanceInputSchema,
  GetChartDataInputSchema,        // 追加
} from "../schemas/index.js";

import {
  getMarketInfo,
  listMarkets,
  getOrderBook,
  getUserOrders,
  getChartData,                    // 追加
} from "../services/subgraph.js";

// --- registerReadTools 関数内、sera_get_token_balance の前あたりに追加 ---

  // --- sera_get_chart_data ---
  server.registerTool(
    "sera_get_chart_data",
    {
      title: "Get Sera Chart Data (OHLCV)",
      description: `Get OHLCV (candlestick) chart data for a SeraProtocol market.

Returns historical price candles with open, high, low, close prices and volume.

Args:
  - market_id (string): Market contract address
  - interval (string): Candle interval - "1m", "5m", "15m", "1h", "4h", "1d" (default: "1h")
  - limit (number): Number of candles to return (default: 100, max: 500)

Returns:
  List of OHLCV candles sorted by timestamp (newest first).

Examples:
  - "Show me the price chart for TWETH/TUSDC" -> market_id: "0x002930b390ac7d686f07cffb9d7ce39609d082d1"
  - "Give me hourly candles" -> market_id: "0x...", interval: "1h"
  - "Show daily OHLCV data" -> market_id: "0x...", interval: "1d"`,
      inputSchema: GetChartDataInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params) => {
      try {
        const [candles, market] = await Promise.all([
          getChartData(params.market_id, params.interval, params.limit),
          getMarketInfo(params.market_id),
        ]);

        if (candles.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: `No chart data found for market \`${params.market_id}\` with interval ${params.interval}.`,
              },
            ],
          };
        }

        const lines = [
          `# Chart Data: ${market.baseToken.symbol}/${market.quoteToken.symbol}`,
          `**Interval**: ${params.interval} | **Candles**: ${candles.length}`,
          "",
          "| Timestamp | Open | High | Low | Close | Volume |",
          "|-----------|------|------|-----|-------|--------|",
        ];

        for (const c of candles) {
          const date = new Date(Number(c.timestamp) * 1000).toISOString();
          lines.push(
            `| ${date} | ${formatPrice(c.open)} | ${formatPrice(c.high)} | ${formatPrice(c.low)} | ${formatPrice(c.close)} | ${c.volume} |`,
          );
        }

        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Error fetching chart data: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    },
  );
```

---

## 変更ファイルまとめ

| # | ファイルパス | 変更内容 |
|---|-------------|---------|
| 1 | `mcp-server/src/types.ts` | `OhlcvCandle` インターフェース追加 |
| 2 | `mcp-server/src/schemas/index.ts` | `GetChartDataInputSchema` (Zod) 追加 |
| 3 | `mcp-server/src/services/subgraph.ts` | `getChartData()` クエリ関数追加 |
| 4 | `mcp-server/src/tools/read-tools.ts` | `sera_get_chart_data` ツール登録追加 + import 更新 |

## 前提条件・注意事項

- **Subgraph 側の対応が必須**: 上記の実装は Subgraph に `Candle` エンティティ（`timestamp`, `open`, `high`, `low`, `close`, `volume`, `market`, `interval` フィールド）が存在することを前提としている。Subgraph にこのエンティティが未定義であれば、先に Subgraph の `schema.graphql` と mapping を更新してデプロイする必要がある。
- **annotations**: 既存の read-only ツールと同様に `readOnlyHint: true`, `destructiveHint: false`, `idempotentHint: true` を設定している。OHLCVデータはブロックチェーン外データであり冪等。
- **formatPrice の再利用**: 既存の `formatPrice` ユーティリティを使って価格をフォーマットしている。Subgraph から返る price の形式が既存と異なる場合は調整が必要。
