/**
 * TWETH/TUSDC マーケットの板情報（bid/ask 各5本）を
 * Sera Protocol サブグラフから取得するスクリプト
 *
 * 実行: npx tsx getOrderBook.ts  (または bun run getOrderBook.ts)
 * 依存: なし (fetch のみ使用)
 */

// ── 定数 ──────────────────────────────────────────────
const SUBGRAPH_URL =
  "https://api.goldsky.com/api/public/project_cmicv6kkbhyto01u3agb155hg/subgraphs/sera-pro/1.0.9/gn";

/** TWETH/TUSDC デフォルトマーケットアドレス (Sepolia) */
const MARKET_ID = "0x002930b390ac7d686f07cffb9d7ce39609d082d1";

/** 板の片側あたりの取得本数 */
const DEPTH_LEVELS = 5;

// ── 型定義 ─────────────────────────────────────────────
interface DepthLevel {
  priceIndex: string;
  price: string;
  rawAmount: string;
}

interface MarketInfo {
  id: string;
  quoteToken: { symbol: string; decimals: string };
  baseToken: { symbol: string; decimals: string };
  quoteUnit: string;
  minPrice: string;
  tickSpace: string;
  latestPrice: string;
  latestPriceIndex: string;
}

interface OrderBookResponse {
  market: MarketInfo;
  bids: DepthLevel[];
  asks: DepthLevel[];
}

// ── サブグラフクエリ関数 ──────────────────────────────────
async function querySubgraph<T>(
  query: string,
  variables: Record<string, unknown> = {},
): Promise<T> {
  const response = await fetch(SUBGRAPH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });

  const json = (await response.json()) as {
    data?: T;
    errors?: unknown[];
  };

  if (json.errors) {
    throw new Error(`Subgraph query error: ${JSON.stringify(json.errors)}`);
  }
  return json.data as T;
}

// ── メインクエリ ──────────────────────────────────────────
async function getOrderBook(): Promise<OrderBookResponse> {
  const query = `
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
  `;

  return querySubgraph<OrderBookResponse>(query, {
    market: MARKET_ID,
    marketStr: MARKET_ID,
    first: DEPTH_LEVELS,
  });
}

// ── 表示用ユーティリティ ──────────────────────────────────
/**
 * rawAmount を人間が読みやすい数値に変換する。
 * quoteUnit を使い、quote トークンの decimals で割る。
 *   quoteAmount = rawAmount * quoteUnit
 *   humanAmount = quoteAmount / 10^quoteDecimals
 */
function formatQuoteAmount(
  rawAmount: string,
  quoteUnit: string,
  quoteDecimals: number,
): string {
  const raw = BigInt(rawAmount);
  const unit = BigInt(quoteUnit);
  const quoteAmount = raw * unit;
  const divisor = 10n ** BigInt(quoteDecimals);
  const whole = quoteAmount / divisor;
  const frac = quoteAmount % divisor;
  const fracStr = frac.toString().padStart(quoteDecimals, "0").replace(/0+$/, "");
  return fracStr ? `${whole}.${fracStr}` : whole.toString();
}

/**
 * price (18 decimals 整数文字列) を人間が読みやすい小数に変換する。
 */
function formatPrice(priceRaw: string, displayDecimals = 6): string {
  const p = BigInt(priceRaw);
  const divisor = 10n ** 18n;
  const whole = p / divisor;
  const frac = p % divisor;
  const fracStr = frac.toString().padStart(18, "0").slice(0, displayDecimals);
  return `${whole}.${fracStr}`;
}

// ── エントリーポイント ────────────────────────────────────
async function main() {
  console.log("Fetching TWETH/TUSDC order book from Sera Protocol subgraph...\n");

  const data = await getOrderBook();
  const { market, bids, asks } = data;

  const quoteDecimals = Number(market.quoteToken.decimals);

  console.log(`Market: ${market.baseToken.symbol}/${market.quoteToken.symbol}`);
  console.log(`Market Address: ${market.id}`);
  console.log(`Latest Price: ${formatPrice(market.latestPrice)} (index: ${market.latestPriceIndex})`);
  console.log(`Quote Unit: ${market.quoteUnit}`);
  console.log("");

  // ── Asks (売り板) — 安い順に並んでいるので、表示時は逆順にして高い方を上に ──
  console.log("=== ORDER BOOK ===");
  console.log("--- Asks (売り) ---");
  console.log(
    "  Price Index | Price              | Raw Amount         | Quote Amount",
  );

  const asksReversed = [...asks].reverse();
  for (const ask of asksReversed) {
    const quoteAmt = formatQuoteAmount(ask.rawAmount, market.quoteUnit, quoteDecimals);
    console.log(
      `  ${ask.priceIndex.padStart(11)} | ${formatPrice(ask.price).padStart(18)} | ${ask.rawAmount.padStart(18)} | ${quoteAmt}`,
    );
  }

  console.log("  --------------|--------------------|--------------------|------------");

  // ── Bids (買い板) — 高い順に並んでいるのでそのまま ──
  console.log("--- Bids (買い) ---");
  for (const bid of bids) {
    const quoteAmt = formatQuoteAmount(bid.rawAmount, market.quoteUnit, quoteDecimals);
    console.log(
      `  ${bid.priceIndex.padStart(11)} | ${formatPrice(bid.price).padStart(18)} | ${bid.rawAmount.padStart(18)} | ${quoteAmt}`,
    );
  }

  console.log("\n=== RAW JSON ===");
  console.log(JSON.stringify({ bids, asks }, null, 2));
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
