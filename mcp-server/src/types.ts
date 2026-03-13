export interface MarketInfo {
  id: string;
  quoteToken: { id: string; symbol: string; decimals: string };
  baseToken: { id: string; symbol: string; decimals: string };
  quoteUnit: string;
  makerFee: string;
  takerFee: string;
  minPrice: string;
  tickSpace: string;
  latestPrice: string;
  latestPriceIndex?: string;
}

export interface DepthLevel {
  priceIndex: string;
  price: string;
  rawAmount: string;
}

export interface OpenOrder {
  id: string;
  market: { id: string };
  priceIndex: string;
  orderIndex: string;
  isBid: boolean;
  rawAmount: string;
  rawFilledAmount: string;
  claimableAmount: string;
  status: string;
}

export interface TokenInfo {
  id: string;
  symbol: string;
  decimals: string;
}
