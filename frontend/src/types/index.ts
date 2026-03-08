export interface Token {
  id: string;
  symbol: string;
  name?: string;
  decimals: string;
}

export interface Market {
  id: string;
  quoteToken: Token;
  baseToken: Token;
  quoteUnit: string;
  makerFee: string;
  takerFee: string;
  minPrice: string;
  tickSpace: string;
  latestPrice: string;
}

export interface Depth {
  priceIndex: string;
  price: string;
  rawAmount: string;
}

export type OrderStatus =
  | "open"
  | "partial"
  | "filled"
  | "cancelled"
  | "claimed"
  | "pending";

export interface OpenOrder {
  id: string;
  market: { id: string };
  priceIndex: string;
  orderIndex: string;
  isBid: boolean;
  rawAmount: string;
  rawFilledAmount: string;
  claimableAmount: string;
  status: OrderStatus;
}
