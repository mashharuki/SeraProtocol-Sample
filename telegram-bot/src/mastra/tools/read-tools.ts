import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { getServices } from "../../services";
import { getIdentity, requireUser } from "./context";

/** Read-only tools. Network/identity resolve from requestContext. */

export const getFxRateTool = createTool({
  id: "get-fx-rate",
  description:
    "Get the live FX rate between two currencies or stablecoins on Sera (e.g. USD/EUR, USDC/EURC). Always use this instead of guessing rates.",
  inputSchema: z.object({
    base: z
      .string()
      .describe("Base currency or token symbol, e.g. USD or USDC"),
    quote: z
      .string()
      .describe("Quote currency or token symbol, e.g. EUR or EURC"),
  }),
  outputSchema: z.object({
    pair: z.string(),
    rate: z.string(),
    change24hPct: z.string().nullable(),
  }),
  execute: async (input, context) => {
    const services = getServices();
    const identity = getIdentity(context?.requestContext);
    const network = identity
      ? ((await services.users.find(identity.telegramUserId))?.network ??
        services.config.defaultNetwork)
      : services.config.defaultNetwork;
    const baseToken = await services.rates.findToken(network, input.base);
    const quoteToken = await services.rates.findToken(network, input.quote);
    const fx = await services.rates.getFxRate(
      network,
      baseToken?.currency ?? input.base,
      quoteToken?.currency ?? input.quote,
    );
    return {
      pair: fx.pair,
      rate: String(fx.rate),
      change24hPct:
        fx.change_pct !== null && fx.change_pct !== undefined
          ? String(fx.change_pct)
          : null,
    };
  },
});

export const listMarketsTool = createTool({
  id: "list-markets",
  description:
    "List the tradable stablecoin markets on Sera for the user's current network, with precision rules and minimum sizes.",
  inputSchema: z.object({}),
  outputSchema: z.object({
    network: z.string(),
    markets: z.array(
      z.object({
        symbol: z.string(),
        base: z.string(),
        quote: z.string(),
        tickPrecision: z.number(),
        quantityPrecision: z.number(),
      }),
    ),
  }),
  execute: async (_input, context) => {
    const services = getServices();
    const identity = getIdentity(context?.requestContext);
    const network = identity
      ? ((await services.users.find(identity.telegramUserId))?.network ??
        services.config.defaultNetwork)
      : services.config.defaultNetwork;
    const markets = await services.rates.getMarkets(network);
    return {
      network,
      markets: markets.map((m) => ({
        symbol: m.symbol,
        base: m.base_symbol,
        quote: m.quote_symbol,
        tickPrecision: m.tick_precision,
        quantityPrecision: m.quantity_precision,
      })),
    };
  },
});

export const checkLiquidityTool = createTool({
  id: "check-liquidity",
  description:
    "Check which major stablecoin pairs currently have live swap liquidity on the user's network. Use this before suggesting a swap, or when a swap fails with a liquidity error.",
  inputSchema: z.object({}),
  outputSchema: z.object({
    result: z.string(),
  }),
  execute: async (_input, context) => {
    const services = getServices();
    const identity = getIdentity(context?.requestContext);
    const network = identity
      ? ((await services.users.find(identity.telegramUserId))?.network ??
        services.config.defaultNetwork)
      : services.config.defaultNetwork;
    const probe = await services.rates.probeLiquidity(network);
    if (probe.pairs.length === 0) {
      return {
        result: `No major pair is swappable on ${network} right now (checked ${probe.checked} directions). Liquidity can be created by depositing to the vault and placing a limit order.`,
      };
    }
    return {
      result: `Swappable now on ${network} (checked ${probe.checked} directions):\n${probe.pairs
        .map(([from, to]) => `${from} -> ${to}`)
        .join("\n")}`,
    };
  },
});

export const getBalancesTool = createTool({
  id: "get-balances",
  description:
    "Get the current user's wallet address, ETH balance, and stablecoin balances (wallet + Sera vault). Always use this instead of guessing balances.",
  inputSchema: z.object({}),
  outputSchema: z.object({
    result: z.string(),
  }),
  execute: async (_input, context) => {
    const res = await requireUser(context?.requestContext);
    if ("error" in res) return { result: res.error };
    const summary = await res.services.accounts.getSummary(res.user);
    const nonZero = summary.tokens.filter((t) => !t.isZero);
    // Faucet-funded wallets hold 100+ tokens; cap the listing.
    const MAX_ROWS = 30;
    const lines = [
      `Address: ${summary.address}`,
      `Network: ${res.user.network}`,
      `ETH (gas): ${summary.eth}`,
      ...nonZero
        .slice(0, MAX_ROWS)
        .map(
          (t) =>
            `${t.symbol}: wallet=${t.wallet}, vault_available=${t.vaultAvailable}, vault_frozen=${t.vaultFrozen}`,
        ),
    ];
    if (nonZero.length > MAX_ROWS) {
      lines.push(
        `…and ${nonZero.length - MAX_ROWS} more tokens with a balance (list truncated).`,
      );
    }
    return { result: lines.join("\n") };
  },
});

export const listOrdersTool = createTool({
  id: "list-orders",
  description:
    "List the current user's recent limit orders on their current network, with status.",
  inputSchema: z.object({}),
  outputSchema: z.object({
    result: z.string(),
  }),
  execute: async (_input, context) => {
    const res = await requireUser(context?.requestContext);
    if ("error" in res) return { result: res.error };
    const orders = await res.services.orders.listOrders(res.user);
    if (orders.length === 0) return { result: "No orders on this network." };
    return {
      result: orders
        .map(
          (o) =>
            `${o.orderId}: ${o.market} ${o.side} ${o.amount} @ ${o.price} — ${o.status}`,
        )
        .join("\n"),
    };
  },
});
