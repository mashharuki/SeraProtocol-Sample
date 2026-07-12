# sera_get_chart_data ツール追加ガイド

## 概要

SeraProtocolのMCPサーバーに `sera_get_chart_data` (OHLCV ローソク足データ取得) を追加するには、以下の **4ファイル** を変更する。

既存パターンに完全に準拠し、read-onlyツールとして `read-tools.ts` に追加する。

---

## 変更対象ファイルと内容

### 1. `mcp-server/src/types.ts` -- 型定義の追加

`OpenOrder` インターフェースの後に `ChartLog` を追加する。

```typescript
// 既存の型定義の後に追加

export interface ChartLog {
  timestamp: string;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
  intervalType: string;
}
```

---

### 2. `mcp-server/src/schemas/index.ts` -- 入力スキーマの追加

ファイル末尾 (`ApproveTokenInputSchema` の後) に追加する。

```typescript
export const GetChartDataInputSchema = z
  .object({
    market_id: MarketIdSchema,
    interval: z
      .enum(["1m", "5m", "15m", "1h", "4h", "1d", "1w"])
      .default("1h")
      .describe(
        "Candlestick interval. Options: 1m, 5m, 15m, 1h, 4h, 1d, 1w (default: 1h)",
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(1000)
      .default(100)
      .describe("Number of candles to return (default: 100, max: 1000)"),
  })
  .strict();
```

---

### 3. `mcp-server/src/services/subgraph.ts` -- GraphQLクエリ関数の追加

ファイル先頭の型インポートに `ChartLog` を追加し、ファイル末尾に関数を追加する。

#### インポート修正 (1行目)

```typescript
// 変更前
import type { MarketInfo, DepthLevel, OpenOrder } from "../types.js";

// 変更後
import type { MarketInfo, DepthLevel, OpenOrder, ChartLog } from "../types.js";
```

#### 関数追加 (`getUserOrders` の後に追加)

```typescript
export async function getChartData(
  marketId: string,
  intervalType: string = "1h",
  first: number = 100,
): Promise<ChartLog[]> {
  const query = `
    query GetChartLogs($market: String!, $intervalType: String!, $first: Int!) {
      chartLogs(
        where: { market: $market, intervalType: $intervalType }
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
        intervalType
      }
    }
  `;

  const data = await querySubgraph<{ chartLogs: ChartLog[] }>(query, {
    market: marketId.toLowerCase(),
    intervalType,
    first,
  });
  return data.chartLogs;
}
```

---

### 4. `mcp-server/src/tools/read-tools.ts` -- ツール登録

#### インポート修正

```typescript
// 変更前
import {
  GetMarketInputSchema,
  ListMarketsInputSchema,
  GetOrderBookInputSchema,
  GetOrdersInputSchema,
  GetTokenBalanceInputSchema,
} from "../schemas/index.js";
import {
  getMarketInfo,
  listMarkets,
  getOrderBook,
  getUserOrders,
} from "../services/subgraph.js";

// 変更後
import {
  GetMarketInputSchema,
  ListMarketsInputSchema,
  GetOrderBookInputSchema,
  GetOrdersInputSchema,
  GetTokenBalanceInputSchema,
  GetChartDataInputSchema,
} from "../schemas/index.js";
import {
  getMarketInfo,
  listMarkets,
  getOrderBook,
  getUserOrders,
  getChartData,
} from "../services/subgraph.js";
```

#### ツール登録 (`sera_get_token_balance` の登録ブロックの後、関数の閉じ括弧 `}` の前に追加)

```typescript
  // --- sera_get_chart_data ---
  server.registerTool(
    "sera_get_chart_data",
    {
      title: "Get Sera Chart Data (OHLCV)",
      description: `Get OHLCV candlestick chart data for a SeraProtocol market.

Returns historical price candles with open, high, low, close prices and volume.

Args:
  - market_id (string): Market contract address
  - interval (string): Candle interval - "1m", "5m", "15m", "1h", "4h", "1d", "1w" (default: "1h")
  - limit (number): Number of candles to return (default: 100, max: 1000)

Returns:
  Array of OHLCV candles ordered by timestamp descending (most recent first).

Examples:
  - "Show me the 1-hour chart for TWETH/TUSDC" -> market_id: "0x002930b390ac7d686f07cffb9d7ce39609d082d1", interval: "1h"
  - "Get daily candles" -> market_id: "0x002930b390ac7d686f07cffb9d7ce39609d082d1", interval: "1d"
  - "Last 50 five-minute candles" -> interval: "5m", limit: 50`,
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
                text: `No chart data found for market \`${params.market_id}\` with interval "${params.interval}".`,
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

        for (const candle of candles) {
          const date = new Date(Number(candle.timestamp) * 1000).toISOString();
          lines.push(
            `| ${date} | ${formatPrice(candle.open)} | ${formatPrice(candle.high)} | ${formatPrice(candle.low)} | ${formatPrice(candle.close)} | ${candle.volume} |`,
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

## 変更サマリー

| ファイル | 変更内容 |
|---|---|
| `mcp-server/src/types.ts` | `ChartLog` インターフェース追加 |
| `mcp-server/src/schemas/index.ts` | `GetChartDataInputSchema` (Zod) 追加 |
| `mcp-server/src/services/subgraph.ts` | `getChartData()` GraphQL関数追加 + `ChartLog` インポート |
| `mcp-server/src/tools/read-tools.ts` | `sera_get_chart_data` ツール登録 + インポート追加 |

## 設計判断の根拠

1. **GraphQLクエリ**: `references/graphql-api.md` に記載されている `chartLogs` エンティティをそのまま利用。interval types は `"1m"`, `"5m"`, `"15m"`, `"1h"`, `"4h"`, `"1d"`, `"1w"` の7種類。

2. **read-onlyツール**: `PRIVATE_KEY` 不要。annotations に `readOnlyHint: true`, `destructiveHint: false` を設定（既存5ツールと同パターン）。

3. **パターン準拠**: 既存ツール (`sera_get_orderbook` など) と同じ構造を踏襲:
   - Zodスキーマ → サービス関数 → ツール登録のレイヤー分離
   - `Promise.all` で market info と chart data を並列取得
   - Markdown テーブル形式の出力
   - try/catch による統一的なエラーハンドリング

4. **価格フォーマット**: OHLCV の価格値は他の price フィールドと同じ 18 decimal 形式のため、既存の `formatPrice()` をそのまま利用。

## ビルド・テスト

```bash
cd mcp-server
npm run build          # TypeScriptコンパイル確認
npm start              # stdio モードで動作確認
# または
npx @modelcontextprotocol/inspector http://localhost:3000/mcp  # HTTP モードでUI確認
```
