import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  PlaceOrderInputSchema,
  ClaimOrderInputSchema,
  ApproveTokenInputSchema,
} from "../schemas/index.js";
import {
  placeLimitOrder,
  claimOrder,
  approveToken,
} from "../services/blockchain.js";
import { getMarketInfo } from "../services/subgraph.js";
import { formatPrice } from "../services/format.js";
import type { Address } from "viem";

export function registerWriteTools(server: McpServer): void {
  // --- sera_place_order ---
  server.registerTool(
    "sera_place_order",
    {
      title: "Place Limit Order",
      description: `Place a limit order (bid or ask) on a SeraProtocol market.

Submits a limit order to the on-chain order book. Requires PRIVATE_KEY env var to be set.
The transaction is simulated before submission to catch errors early.

**IMPORTANT**: Ensure you have sufficient token balance and have approved the Router contract to spend your tokens before placing an order. Use sera_approve_token if needed.

Args:
  - market_id (string): Market contract address
  - price_index (number): Price level index (uint16, 0-65535). Get valid values from sera_get_orderbook.
  - raw_amount (string): Amount in raw token units (e.g., "1000000" for 1 TUSDC with 6 decimals)
  - is_bid (boolean): true for buy order, false for sell order
  - post_only (boolean): If true, ensures order is maker-only (default: true)

Returns:
  Transaction hash and order details on success.

Examples:
  - "Buy 1000 TUSDC worth at price index 100" -> is_bid: true, price_index: 100, raw_amount: "1000000"
  - "Place a sell order" -> is_bid: false with appropriate price_index and raw_amount`,
      inputSchema: PlaceOrderInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (params) => {
      try {
        const market = await getMarketInfo(params.market_id);

        const result = await placeLimitOrder({
          market: params.market_id as Address,
          priceIndex: params.price_index,
          rawAmount: BigInt(params.raw_amount),
          isBid: params.is_bid,
          postOnly: params.post_only,
        });

        const side = params.is_bid ? "BID (Buy)" : "ASK (Sell)";

        return {
          content: [
            {
              type: "text",
              text: [
                `# Order Placed Successfully`,
                "",
                `- **Type**: ${side}`,
                `- **Market**: ${market.baseToken.symbol}/${market.quoteToken.symbol}`,
                `- **Price Index**: ${params.price_index}`,
                `- **Raw Amount**: ${params.raw_amount}`,
                `- **Post Only**: ${params.post_only}`,
                `- **Account**: \`${result.account}\``,
                `- **Transaction**: \`${result.txHash}\``,
                `- **Explorer**: https://sepolia.etherscan.io/tx/${result.txHash}`,
                "",
                "Use `sera_get_orders` to monitor your order status.",
              ].join("\n"),
            },
          ],
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Error placing order: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    },
  );

  // --- sera_claim_order ---
  server.registerTool(
    "sera_claim_order",
    {
      title: "Claim Order Proceeds",
      description: `Claim proceeds from a filled order on SeraProtocol.

After an order has been filled (partially or fully), use this tool to claim the proceeds back to your wallet. Requires PRIVATE_KEY env var.

Use sera_get_orders first to find orders with claimable amounts.

Args:
  - market_id (string): Market contract address
  - is_bid (boolean): Whether the original order was a bid (buy order)
  - price_index (number): Price index of the order
  - order_index (string): Order index within the price level

Returns:
  Transaction hash on success.

Examples:
  - "Claim my filled order" -> use order details from sera_get_orders`,
      inputSchema: ClaimOrderInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params) => {
      try {
        const result = await claimOrder({
          market: params.market_id as Address,
          isBid: params.is_bid,
          priceIndex: params.price_index,
          orderIndex: BigInt(params.order_index),
        });

        return {
          content: [
            {
              type: "text",
              text: [
                `# Order Claimed Successfully`,
                "",
                `- **Market**: \`${params.market_id}\``,
                `- **Order**: price_index=${params.price_index}, order_index=${params.order_index} (${params.is_bid ? "bid" : "ask"})`,
                `- **Account**: \`${result.account}\``,
                `- **Transaction**: \`${result.txHash}\``,
                `- **Explorer**: https://sepolia.etherscan.io/tx/${result.txHash}`,
              ].join("\n"),
            },
          ],
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Error claiming order: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    },
  );

  // --- sera_approve_token ---
  server.registerTool(
    "sera_approve_token",
    {
      title: "Approve Token Spending",
      description: `Approve the SeraProtocol Router to spend your ERC20 tokens.

Required before placing orders. Approves a specified amount of tokens for the Router contract to spend on your behalf.

Args:
  - token_address (string): ERC20 token contract address to approve
  - amount (string): Amount to approve in raw units. Use a large value (e.g., "115792089237316195423570985008687907853269984665640564039457584007913129639935") for max approval.
  - spender (string): Spender address (default: SeraProtocol Router)

Returns:
  Transaction hash on success.

Examples:
  - "Approve TUSDC for trading" -> token_address: quote token address from market info
  - "Give unlimited approval" -> use max uint256 for amount`,
      inputSchema: ApproveTokenInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params) => {
      try {
        const result = await approveToken(
          params.token_address as Address,
          params.spender as Address,
          BigInt(params.amount),
        );

        return {
          content: [
            {
              type: "text",
              text: [
                `# Token Approval Successful`,
                "",
                `- **Token**: \`${params.token_address}\``,
                `- **Spender**: \`${params.spender}\``,
                `- **Amount**: ${params.amount}`,
                `- **Account**: \`${result.account}\``,
                `- **Transaction**: \`${result.txHash}\``,
                `- **Explorer**: https://sepolia.etherscan.io/tx/${result.txHash}`,
              ].join("\n"),
            },
          ],
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Error approving token: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    },
  );
}
