import { useState, useEffect, useCallback } from "react";
import { querySubgraph } from "../lib/subgraph";
import type { Depth } from "../types";

const DEPTHS_QUERY = `
  query GetDepth($market: String!) {
    bids: depths(
      where: { market: $market, isBid: true, rawAmount_gt: "0" }
      orderBy: priceIndex
      orderDirection: desc
      first: 10
    ) {
      priceIndex
      price
      rawAmount
    }
    asks: depths(
      where: { market: $market, isBid: false, rawAmount_gt: "0" }
      orderBy: priceIndex
      orderDirection: asc
      first: 10
    ) {
      priceIndex
      price
      rawAmount
    }
  }
`;

export function useDepths(marketId: string) {
  const [bids, setBids] = useState<Depth[]>([]);
  const [asks, setAsks] = useState<Depth[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDepths = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await querySubgraph<{ bids: Depth[]; asks: Depth[] }>(
        DEPTHS_QUERY,
        { market: marketId.toLowerCase() },
      );
      setBids(data.bids);
      setAsks(data.asks);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch depths");
    } finally {
      setLoading(false);
    }
  }, [marketId]);

  useEffect(() => {
    fetchDepths();
    const interval = setInterval(fetchDepths, 15_000);
    return () => clearInterval(interval);
  }, [fetchDepths]);

  return { bids, asks, loading, error, refetch: fetchDepths };
}
