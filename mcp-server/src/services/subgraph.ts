import { SUBGRAPH_URL } from "../constants.js";
import type { MarketInfo, DepthLevel, OpenOrder } from "../types.js";

async function querySubgraph<T>(
  query: string,
  variables: Record<string, unknown> = {},
): Promise<T> {
  const res = await fetch(SUBGRAPH_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    throw new Error(`GraphQL request failed (${res.status} ${res.statusText})`);
  }

  const json = (await res.json()) as {
    data?: T;
    errors?: Array<{ message: string }>;
  };

  if (json.errors?.length) {
    throw new Error(`GraphQL Error: ${json.errors[0]?.message ?? "unknown"}`);
  }
  if (!json.data) {
    throw new Error("GraphQL response did not include data");
  }
  return json.data;
}

export async function getMarketInfo(marketId: string): Promise<MarketInfo> {
  const query = `
    query GetMarket($id: ID!) {
      market(id: $id) {
        id
        quoteToken { id symbol decimals }
        baseToken { id symbol decimals }
        quoteUnit
        makerFee
        takerFee
        minPrice
        tickSpace
        latestPrice
        latestPriceIndex
      }
    }
  `;

  const data = await querySubgraph<{ market: MarketInfo | null }>(query, {
    id: marketId.toLowerCase(),
  });

  if (!data.market) {
    throw new Error(`Market not found: ${marketId}`);
  }
  return data.market;
}

export async function listMarkets(first: number = 10): Promise<MarketInfo[]> {
  const query = `
    query ListMarkets($first: Int!) {
      markets(first: $first) {
        id
        quoteToken { id symbol decimals }
        baseToken { id symbol decimals }
        quoteUnit
        makerFee
        takerFee
        minPrice
        tickSpace
        latestPrice
        latestPriceIndex
      }
    }
  `;

  const data = await querySubgraph<{ markets: MarketInfo[] }>(query, { first });
  return data.markets;
}

export async function getOrderBook(
  marketId: string,
  depth: number = 10,
): Promise<{ bids: DepthLevel[]; asks: DepthLevel[] }> {
  const query = `
    query GetDepth($market: String!, $first: Int!) {
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

  return querySubgraph<{ bids: DepthLevel[]; asks: DepthLevel[] }>(query, {
    market: marketId.toLowerCase(),
    first: depth,
  });
}

export async function getUserOrders(
  userAddress: string,
  marketId: string,
  first: number = 50,
): Promise<OpenOrder[]> {
  const query = `
    query GetOrders($user: String!, $market: String!, $first: Int!) {
      openOrders(
        where: { user: $user, market: $market }
        orderBy: createdAt
        orderDirection: desc
        first: $first
      ) {
        id
        market { id }
        priceIndex
        orderIndex
        isBid
        rawAmount
        rawFilledAmount
        claimableAmount
        status
      }
    }
  `;

  const data = await querySubgraph<{ openOrders: OpenOrder[] }>(query, {
    user: userAddress.toLowerCase(),
    market: marketId.toLowerCase(),
    first,
  });
  return data.openOrders;
}
