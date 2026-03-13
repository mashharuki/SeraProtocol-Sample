import { z } from "zod";

const addressPattern = /^0x[0-9a-fA-F]{40}$/;

export const AddressSchema = z
  .string()
  .regex(addressPattern, "Must be a valid Ethereum address (0x + 40 hex chars)")
  .describe("Ethereum address (0x-prefixed)");

export const MarketIdSchema = AddressSchema.describe(
  "Market contract address. Default: 0x002930b390ac7d686f07cffb9d7ce39609d082d1 (TWETH/TUSDC on Sepolia)",
);

export const GetMarketInputSchema = z
  .object({
    market_id: MarketIdSchema,
  })
  .strict();

export const ListMarketsInputSchema = z
  .object({
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .default(10)
      .describe("Maximum number of markets to return (default: 10)"),
  })
  .strict();

export const GetOrderBookInputSchema = z
  .object({
    market_id: MarketIdSchema,
    depth: z
      .number()
      .int()
      .min(1)
      .max(50)
      .default(10)
      .describe("Number of price levels to return per side (default: 10)"),
  })
  .strict();

export const GetOrdersInputSchema = z
  .object({
    user_address: AddressSchema.describe("User's Ethereum wallet address"),
    market_id: MarketIdSchema,
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .default(50)
      .describe("Maximum number of orders to return (default: 50)"),
  })
  .strict();

export const GetTokenBalanceInputSchema = z
  .object({
    token_address: AddressSchema.describe("ERC20 token contract address"),
    account_address: AddressSchema.describe(
      "Wallet address to check balance for. If omitted and PRIVATE_KEY is set, uses the configured wallet.",
    ).optional(),
  })
  .strict();

export const PlaceOrderInputSchema = z
  .object({
    market_id: MarketIdSchema,
    price_index: z
      .number()
      .int()
      .min(0)
      .max(65535)
      .describe("Price level index in the order book (uint16, 0-65535)"),
    raw_amount: z
      .string()
      .regex(/^\d+$/, "Must be a positive integer string")
      .describe(
        "Order amount in raw units (smallest token unit). Example: '1000000' for 1 TUSDC",
      ),
    is_bid: z
      .boolean()
      .describe("true = buy order (bid), false = sell order (ask)"),
    post_only: z
      .boolean()
      .default(true)
      .describe(
        "If true, order will only be placed as maker (no immediate fill). Default: true",
      ),
  })
  .strict();

export const ClaimOrderInputSchema = z
  .object({
    market_id: MarketIdSchema,
    is_bid: z.boolean().describe("Whether the original order was a bid (buy)"),
    price_index: z
      .number()
      .int()
      .min(0)
      .max(65535)
      .describe("Price index of the order to claim"),
    order_index: z
      .string()
      .regex(/^\d+$/, "Must be a positive integer string")
      .describe("Order index within the price level"),
  })
  .strict();

export const ApproveTokenInputSchema = z
  .object({
    token_address: AddressSchema.describe(
      "ERC20 token contract address to approve",
    ),
    amount: z
      .string()
      .regex(/^\d+$/, "Must be a positive integer string")
      .describe(
        "Amount to approve in raw units. Use a large value for unlimited approval.",
      ),
    spender: AddressSchema.default(
      "0x82bfe1b31b6c1c3d201a0256416a18d93331d99e",
    ).describe("Spender address (default: SeraProtocol Router)"),
  })
  .strict();
