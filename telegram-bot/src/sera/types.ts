import { z } from "zod";

/**
 * Zod schemas for the Sera REST API v2 responses we consume.
 * Schemas are intentionally loose (`passthrough`-style optional fields)
 * so additive API changes don't break parsing; required fields are the
 * ones our code actually reads.
 */

export const healthSchema = z.object({
  status: z.string(),
  version: z.string().optional(),
  timestamp: z.union([z.string(), z.number()]).optional(),
});

export const systemTimeSchema = z.object({
  timestamp: z.union([z.string(), z.number()]),
});

export const tokenSchema = z.object({
  currency: z.string().optional(),
  symbol: z.string(),
  address: z.string(),
  decimals: z.number(),
  min_trade_amount_raw: z.string().optional(),
  min_trade_amount: z.union([z.string(), z.number()]).optional(),
});
export const tokensSchema = z.object({ tokens: z.array(tokenSchema) });
export type SeraToken = z.infer<typeof tokenSchema>;

export const marketSchema = z.object({
  symbol: z.string(),
  base_symbol: z.string(),
  quote_symbol: z.string(),
  base_address: z.string(),
  quote_address: z.string(),
  tick_precision: z.number(),
  quantity_precision: z.number(),
  rounding_mode: z.string().optional(),
  base_decimals: z.number().optional(),
  quote_decimals: z.number().optional(),
  min_ask_amount: z.union([z.string(), z.number()]).optional(),
  min_bid_quote_amount: z.union([z.string(), z.number()]).optional(),
});
export const marketsSchema = z.object({ markets: z.array(marketSchema) });
export type SeraMarket = z.infer<typeof marketSchema>;

export const fxRateSchema = z.object({
  pair: z.string(),
  rate: z.union([z.string(), z.number()]),
  as_of: z.union([z.string(), z.number()]).optional(),
  rate_24h_ago: z.union([z.string(), z.number()]).nullable().optional(),
  change_pct: z.union([z.string(), z.number()]).nullable().optional(),
});
export type SeraFxRate = z.infer<typeof fxRateSchema>;

export const eip712DomainSchema = z.object({
  name: z.string(),
  version: z.string(),
  chainId: z.union([z.string(), z.number()]),
  verifyingContract: z.string(),
});

export const configSchema = z.object({
  chain_id: z.union([z.string(), z.number()]),
  sera_address: z.string(),
  vault_address: z.string(),
  sor_address: z.string().optional(),
  eip712_domain: eip712DomainSchema,
});
export type SeraConfig = z.infer<typeof configSchema>;

// Live shape (verified on api-testnet.sera.cx 2026-07-09):
// {owner_address, balances: [BalanceRow], updated_at, wallet_balance_available}
export const balanceRowSchema = z.object({
  symbol: z.string(),
  address: z.string().optional(),
  decimals: z.number(),
  wallet_balance: z.string(),
  vault_available: z.string(),
  vault_frozen: z.string(),
  vault_total: z.string().optional(),
  total: z.string().optional(),
});
export type SeraBalanceRow = z.infer<typeof balanceRowSchema>;
export const balancesResponseSchema = z.object({
  balances: z.array(balanceRowSchema),
});

/** EIP-712 typed data as returned verbatim by Sera (route_params / preview). */
export const typedDataSchema = z.object({
  domain: z.record(z.string(), z.unknown()),
  types: z.record(z.string(), z.unknown()),
  primaryType: z.string().optional(),
  message: z.record(z.string(), z.unknown()),
});
export type SeraTypedData = z.infer<typeof typedDataSchema>;

export const swapQuoteSchema = z.object({
  uuid: z.string(),
  route_params: z.record(z.string(), z.unknown()),
  quote_breakdown: z.record(z.string(), z.unknown()).optional(),
  permit: z.record(z.string(), z.unknown()).nullable().optional(),
  expires_at: z.union([z.string(), z.number()]).optional(),
});
export type SeraSwapQuote = z.infer<typeof swapQuoteSchema>;

export const swapResultSchema = z.object({
  success: z.boolean().optional(),
  trade_id: z.string().optional(),
  status: z.string().optional(),
  fee_breakdown: z.record(z.string(), z.unknown()).optional(),
});
export type SeraSwapResult = z.infer<typeof swapResultSchema>;

export const orderPreviewSchema = z.record(z.string(), z.unknown());
export type SeraOrderPreview = z.infer<typeof orderPreviewSchema>;

export const orderSubmitResultSchema = z.object({
  order_id: z.string(),
});

export const orderStatusSchema = z.object({
  order_id: z.string().optional(),
  status: z.string(),
  filled_base_amount: z.union([z.string(), z.number()]).optional(),
  filled_quote_amount: z.union([z.string(), z.number()]).optional(),
  remaining_amount: z.union([z.string(), z.number()]).optional(),
  error_code: z.string().nullable().optional(),
});
export type SeraOrderStatus = z.infer<typeof orderStatusSchema>;

export const apiKeyCreateSchema = z.object({
  api_key: z.string(),
  api_secret: z.string(),
});

export const unsignedTxSchema = z.object({
  tx: z.record(z.string(), z.unknown()),
});
export type SeraUnsignedTx = z.infer<typeof unsignedTxSchema>;

export const txSendResultSchema = z.object({
  tx_hash: z.string(),
});

export interface SwapQuoteRequest {
  from_token: string;
  to_token: string;
  from_amount: string;
  owner_address: string;
  recipient: string;
  expiration: number;
  gas_mode?: "receive_less" | "pay_more";
}

export interface OrderPreviewRequest {
  owner_address: string;
  side: "bid" | "ask";
  amount: string;
  price: string;
  order_type: "limit";
  from_address: string;
  to_address: string;
  order_id: string;
  uuid_int: string;
  expiration: number;
}

export type OrderSubmitRequest = OrderPreviewRequest & { signature: string };
