/**
 * TWETH/TUSDC マーケットの板情報（bid/ask各5本）を
 * SeraProtocol サブグラフ（Goldsky）から取得するスクリプト。
 * viem不使用 — fetch のみ。
 *
 * 実行: npx tsx getOrderBook.ts
 */

const SUBGRAPH_URL =
  "https://api.goldsky.com/api/public/project_cmicv6kkbhyto01u3agb155hg/subgraphs/sera-pro/1.0.9/gn";

const MARKET_ADDRESS = "0x002930b390ac7d686f07cffb9d7ce39609d082d1";

// ---------- Types ----------

interface DepthLevel {
  priceIndex: string;
  price: string;
  rawAmount: string;
}

interface OrderBookResponse {
  bids: DepthLevel[];
  asks: DepthLevel[];
}

interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

// ---------- Query ----------

const ORDER_BOOK_QUERY = `
  query GetOrderBook($market: String!, $first: Int!) {
    bids: depths(
      where: { market: $market, isBid: true, rawAmount_gt: "0" }
      orderBy: priceIndex
      orderDirection: desc
      first: $first
    ) {
      priceIndex
      price
      rawAmount
    }
    asks: depths(
      where: { market: $market, isBid: false, rawAmount_gt: "0" }
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

// ---------- Fetch helper ----------

async function querySubgraph<T>(
  query: string,
  variables: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(SUBGRAPH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  }

  const json: GraphQLResponse<T> = await res.json();

  if (json.errors?.length) {
    throw new Error(`GraphQL Error: ${json.errors[0].message}`);
  }
  if (!json.data) {
    throw new Error("GraphQL response did not include data");
  }
  return json.data;
}

// ---------- Main ----------

async function main() {
  const depth = 5;

  console.log(`Fetching order book for TWETH/TUSDC market ...`);
  console.log(`  Market : ${MARKET_ADDRESS}`);
  console.log(`  Depth  : ${depth} levels per side\n`);

  const { bids, asks } = await querySubgraph<OrderBookResponse>(
    ORDER_BOOK_QUERY,
    { market: MARKET_ADDRESS, first: depth },
  );

  console.log("=== ASKS (売り板 — 価格昇順) ===");
  console.log("priceIndex | price              | rawAmount");
  console.log("-".repeat(55));
  // 表示は価格の高い方を上にする
  for (const a of [...asks].reverse()) {
    console.log(
      `${a.priceIndex.padStart(10)} | ${a.price.padStart(18)} | ${a.rawAmount}`,
    );
  }

  console.log();

  console.log("=== BIDS (買い板 — 価格降順) ===");
  console.log("priceIndex | price              | rawAmount");
  console.log("-".repeat(55));
  for (const b of bids) {
    console.log(
      `${b.priceIndex.padStart(10)} | ${b.price.padStart(18)} | ${b.rawAmount}`,
    );
  }
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
