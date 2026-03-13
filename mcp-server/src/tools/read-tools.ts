import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  GetMarketInputSchema,
  ListMarketsInputSchema,
  GetOrderBookInputSchema,
  GetOrdersInputSchema,
  GetTokenBalanceInputSchema,
} from "../schemas/index.js";
import {
  getMarketInfo,
  listMarkets,
  getOrderBook,
  getUserOrders,
} from "../services/subgraph.js";
import {
  getTokenBalance,
  getConfiguredAddress,
} from "../services/blockchain.js";
import {
  formatPrice,
  formatAmount,
  formatTokenAmount,
} from "../services/format.js";
import type { Address } from "viem";

export function registerReadTools(server: McpServer): void {
  // --- sera_get_market ---
  server.registerTool(
    "sera_get_market",
    {
      title: "Get Sera Market Info",
      description: `Get detailed information about a SeraProtocol trading market.

Returns market details including trading pair tokens, fees, price range, and latest price.

Args:
  - market_id (string): Market contract address

Returns:
  Market details with quote/base token info, fees, price data, and tick spacing.

Examples:
  - "What's the current price on the TWETH/TUSDC market?" -> market_id: "0x002930b390ac7d686f07cffb9d7ce39609d082d1"
  - "Show me market info" -> market_id: "0x002930b390ac7d686f07cffb9d7ce39609d082d1"`,
      inputSchema: GetMarketInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params) => {
      try {
        const market = await getMarketInfo(params.market_id);
        const latestPriceFormatted = formatPrice(market.latestPrice);

        const lines = [
          `# Market: ${market.baseToken.symbol}/${market.quoteToken.symbol}`,
          "",
          `**Market Address**: \`${market.id}\``,
          "",
          "## Tokens",
          `- **Base Token**: ${market.baseToken.symbol} (\`${market.baseToken.id}\`, ${market.baseToken.decimals} decimals)`,
          `- **Quote Token**: ${market.quoteToken.symbol} (\`${market.quoteToken.id}\`, ${market.quoteToken.decimals} decimals)`,
          "",
          "## Trading Parameters",
          `- **Latest Price**: ${latestPriceFormatted} ${market.quoteToken.symbol}`,
          `- **Latest Price Index**: ${market.latestPriceIndex ?? "N/A"}`,
          `- **Quote Unit**: ${market.quoteUnit}`,
          `- **Min Price**: ${formatPrice(market.minPrice)}`,
          `- **Tick Space**: ${market.tickSpace}`,
          "",
          "## Fees",
          `- **Maker Fee**: ${market.makerFee}`,
          `- **Taker Fee**: ${market.takerFee}`,
        ];

        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Error fetching market info: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    },
  );

  // --- sera_list_markets ---
  server.registerTool(
    "sera_list_markets",
    {
      title: "List Sera Markets",
      description: `List all available trading markets on SeraProtocol.

Returns a list of markets with their trading pairs and latest prices.

Args:
  - limit (number): Maximum number of markets to return (default: 10, max: 100)

Examples:
  - "What markets are available?" -> default params
  - "Show me all trading pairs" -> default params`,
      inputSchema: ListMarketsInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params) => {
      try {
        const markets = await listMarkets(params.limit);

        if (markets.length === 0) {
          return { content: [{ type: "text", text: "No markets found." }] };
        }

        const lines = [`# SeraProtocol Markets (${markets.length} found)`, ""];

        for (const market of markets) {
          const price = formatPrice(market.latestPrice);
          lines.push(
            `## ${market.baseToken.symbol}/${market.quoteToken.symbol}`,
          );
          lines.push(`- **Address**: \`${market.id}\``);
          lines.push(
            `- **Latest Price**: ${price} ${market.quoteToken.symbol}`,
          );
          lines.push(
            `- **Maker/Taker Fee**: ${market.makerFee}/${market.takerFee}`,
          );
          lines.push("");
        }

        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Error listing markets: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    },
  );

  // --- sera_get_orderbook ---
  server.registerTool(
    "sera_get_orderbook",
    {
      title: "Get Sera Order Book",
      description: `Get the order book (bid/ask depth) for a SeraProtocol market.

Returns the top bid and ask price levels with amounts, providing a view of current market liquidity.

Args:
  - market_id (string): Market contract address
  - depth (number): Number of price levels per side (default: 10, max: 50)

Returns:
  Bid and ask depth levels with price index, price, and amount at each level.

Examples:
  - "Show me the order book" -> market_id: "0x002930b390ac7d686f07cffb9d7ce39609d082d1"
  - "What's the current bid/ask spread?" -> same market_id`,
      inputSchema: GetOrderBookInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params) => {
      try {
        const [orderBook, market] = await Promise.all([
          getOrderBook(params.market_id, params.depth),
          getMarketInfo(params.market_id),
        ]);

        const lines = [
          `# Order Book: ${market.baseToken.symbol}/${market.quoteToken.symbol}`,
          "",
        ];

        // Asks (sell orders) - show in reverse so lowest ask is at bottom
        lines.push("## Asks (Sell Orders)");
        if (orderBook.asks.length === 0) {
          lines.push("_No asks available_");
        } else {
          lines.push("| Price Index | Price | Amount |");
          lines.push("|------------|-------|--------|");
          for (const ask of [...orderBook.asks].reverse()) {
            lines.push(
              `| ${ask.priceIndex} | ${formatPrice(ask.price)} | ${formatAmount(ask.rawAmount, market.quoteUnit)} |`,
            );
          }
        }
        lines.push("");

        // Spread
        if (orderBook.bids.length > 0 && orderBook.asks.length > 0) {
          const bestBid = BigInt(orderBook.bids[0].price);
          const bestAsk = BigInt(orderBook.asks[0].price);
          const spread = bestAsk - bestBid;
          lines.push(
            `**Spread**: ${formatPrice(spread.toString())} | Best Bid Index: ${orderBook.bids[0].priceIndex} | Best Ask Index: ${orderBook.asks[0].priceIndex}`,
          );
          lines.push("");
        }

        // Bids (buy orders)
        lines.push("## Bids (Buy Orders)");
        if (orderBook.bids.length === 0) {
          lines.push("_No bids available_");
        } else {
          lines.push("| Price Index | Price | Amount |");
          lines.push("|------------|-------|--------|");
          for (const bid of orderBook.bids) {
            lines.push(
              `| ${bid.priceIndex} | ${formatPrice(bid.price)} | ${formatAmount(bid.rawAmount, market.quoteUnit)} |`,
            );
          }
        }

        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Error fetching order book: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    },
  );

  // --- sera_get_orders ---
  server.registerTool(
    "sera_get_orders",
    {
      title: "Get User Orders",
      description: `Get a user's open orders on a SeraProtocol market.

Returns all orders for a given user address on a specific market, including status, fill amount, and claimable proceeds.

Args:
  - user_address (string): User's Ethereum wallet address
  - market_id (string): Market contract address
  - limit (number): Max orders to return (default: 50)

Returns:
  List of orders with status (open/partial/filled/claimed), amounts, and claim eligibility.

Examples:
  - "Show my orders" -> user_address: "0x...", market_id: "0x002930b390ac7d686f07cffb9d7ce39609d082d1"
  - "Do I have any filled orders to claim?" -> same params`,
      inputSchema: GetOrdersInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params) => {
      try {
        const [orders, market] = await Promise.all([
          getUserOrders(params.user_address, params.market_id, params.limit),
          getMarketInfo(params.market_id),
        ]);

        if (orders.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: `No orders found for \`${params.user_address}\` on market \`${params.market_id}\`.`,
              },
            ],
          };
        }

        const lines = [
          `# Orders for \`${params.user_address.slice(0, 6)}...${params.user_address.slice(-4)}\``,
          `**Market**: ${market.baseToken.symbol}/${market.quoteToken.symbol}`,
          `**Total Orders**: ${orders.length}`,
          "",
          "| # | Side | Price Index | Amount | Filled | Claimable | Status |",
          "|---|------|------------|--------|--------|-----------|--------|",
        ];

        for (let i = 0; i < orders.length; i++) {
          const o = orders[i];
          const side = o.isBid ? "BID" : "ASK";
          const amount = formatAmount(o.rawAmount, market.quoteUnit);
          const filled = formatAmount(o.rawFilledAmount, market.quoteUnit);
          const claimable = formatAmount(o.claimableAmount, market.quoteUnit);
          const status = o.status.toUpperCase();
          lines.push(
            `| ${i + 1} | ${side} | ${o.priceIndex} | ${amount} | ${filled} | ${claimable} | ${status} |`,
          );
        }

        // Summary of claimable orders
        const claimableOrders = orders.filter(
          (o) => BigInt(o.claimableAmount) > 0n,
        );
        if (claimableOrders.length > 0) {
          lines.push("");
          lines.push(
            `**${claimableOrders.length} order(s) have claimable proceeds.** Use \`sera_claim_order\` to claim.`,
          );
          for (const o of claimableOrders) {
            lines.push(
              `- Order at price index ${o.priceIndex}, order index ${o.orderIndex} (${o.isBid ? "bid" : "ask"})`,
            );
          }
        }

        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Error fetching orders: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    },
  );

  // --- sera_get_token_balance ---
  server.registerTool(
    "sera_get_token_balance",
    {
      title: "Get Token Balance",
      description: `Check the ERC20 token balance for a wallet address on Sepolia testnet.

Returns the token balance, symbol, and decimals.

Args:
  - token_address (string): ERC20 token contract address
  - account_address (string, optional): Wallet address to check. Uses configured PRIVATE_KEY wallet if omitted.

Examples:
  - "How much TUSDC do I have?" -> token_address from market info
  - "Check my token balance" -> needs token_address`,
      inputSchema: GetTokenBalanceInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params) => {
      try {
        let accountAddr = params.account_address as Address | undefined;
        if (!accountAddr) {
          const configured = getConfiguredAddress();
          if (!configured) {
            return {
              isError: true,
              content: [
                {
                  type: "text",
                  text: "No account_address provided and PRIVATE_KEY is not configured. Please provide an account_address.",
                },
              ],
            };
          }
          accountAddr = configured;
        }

        const { balance, symbol, decimals } = await getTokenBalance(
          params.token_address as Address,
          accountAddr,
        );

        const formatted = formatTokenAmount(balance, decimals);

        return {
          content: [
            {
              type: "text",
              text: [
                `# Token Balance`,
                "",
                `- **Token**: ${symbol} (\`${params.token_address}\`)`,
                `- **Account**: \`${accountAddr}\``,
                `- **Balance**: ${formatted} ${symbol}`,
                `- **Raw Balance**: ${balance.toString()}`,
                `- **Decimals**: ${decimals}`,
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
              text: `Error checking balance: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    },
  );
}
