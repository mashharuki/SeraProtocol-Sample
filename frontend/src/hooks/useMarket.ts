import { useState, useEffect } from "react";
import { querySubgraph } from "../lib/subgraph";
import type { Market } from "../types";

const MARKET_QUERY = `
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
    }
  }
`;

export function useMarket(marketId: string) {
  const [market, setMarket] = useState<Market | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetch() {
      setLoading(true);
      setError(null);
      try {
        const data = await querySubgraph<{ market: Market }>(MARKET_QUERY, {
          id: marketId.toLowerCase(),
        });
        if (!cancelled) setMarket(data.market);
      } catch (err) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : "Failed to fetch market");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetch();
    return () => { cancelled = true; };
  }, [marketId]);

  return { market, loading, error };
}
