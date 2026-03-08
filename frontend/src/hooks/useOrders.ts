import { useState, useEffect, useCallback } from "react";
import { querySubgraph } from "../lib/subgraph";
import type { OpenOrder } from "../types";

const ORDERS_QUERY = `
  query GetOrders($user: String!, $market: String!) {
    openOrders(
      where: { user: $user, market: $market }
      orderBy: createdAt
      orderDirection: desc
      first: 50
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

export function useOrders(userAddress: string | null, marketId: string) {
  const [orders, setOrders] = useState<OpenOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchOrders = useCallback(async () => {
    if (!userAddress) {
      setOrders([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await querySubgraph<{ openOrders: OpenOrder[] }>(
        ORDERS_QUERY,
        {
          user: userAddress.toLowerCase(),
          market: marketId.toLowerCase(),
        },
      );
      setOrders(data.openOrders);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch orders");
    } finally {
      setLoading(false);
    }
  }, [userAddress, marketId]);

  useEffect(() => {
    fetchOrders();
    const interval = setInterval(fetchOrders, 10_000);
    return () => clearInterval(interval);
  }, [fetchOrders]);

  return { orders, loading, error, refetch: fetchOrders };
}
