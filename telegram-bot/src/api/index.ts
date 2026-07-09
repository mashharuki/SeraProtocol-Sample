import { swaggerUI } from "@hono/swagger-ui";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import type { Network } from "../config";
import type { Services } from "../services";

/**
 * Documented read-only HTTP API (+ Swagger UI at /docs).
 *
 * Exposes only public Sera data (tokens / markets / FX rates) through the
 * same service layer the bot uses — handy for smoke-testing connectivity
 * per network without opening Telegram. Deliberately NOT exposed here:
 * anything user-scoped (balances, orders) or fund-moving, and the Telegram
 * webhook (secret-protected, documented out of band).
 */

const networkQuery = z
  .enum(["mainnet", "sepolia"])
  .optional()
  .openapi({
    param: { name: "network", in: "query" },
    example: "sepolia",
    description: "Target network (defaults to DEFAULT_NETWORK)",
  });

const errorSchema = z
  .object({
    error: z.string().openapi({ example: "upstream error" }),
  })
  .openapi("Error");

const healthSchema = z
  .object({
    status: z.string().openapi({ example: "ok" }),
  })
  .openapi("Health");

const tokenSchema = z
  .object({
    symbol: z.string().openapi({ example: "USDC" }),
    address: z
      .string()
      .openapi({ example: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48" }),
    decimals: z.number().openapi({ example: 6 }),
    currency: z.string().nullable().openapi({ example: "USD" }),
  })
  .openapi("Token");

const tokensResponseSchema = z
  .object({
    network: z.string().openapi({ example: "sepolia" }),
    tokens: z.array(tokenSchema),
  })
  .openapi("TokensResponse");

const marketSchema = z
  .object({
    symbol: z.string().openapi({ example: "EURC/USDC" }),
    base: z.string().openapi({ example: "EURC" }),
    quote: z.string().openapi({ example: "USDC" }),
    tickPrecision: z.number().openapi({ example: 4 }),
    quantityPrecision: z.number().openapi({ example: 2 }),
  })
  .openapi("Market");

const marketsResponseSchema = z
  .object({
    network: z.string().openapi({ example: "sepolia" }),
    markets: z.array(marketSchema),
  })
  .openapi("MarketsResponse");

const rateResponseSchema = z
  .object({
    network: z.string().openapi({ example: "sepolia" }),
    pair: z.string().openapi({ example: "USD/EUR" }),
    rate: z.string().openapi({ example: "0.921500" }),
    inverse: z.string().openapi({ example: "1.085187" }),
    change24hPct: z.string().nullable().openapi({ example: "+0.123" }),
  })
  .openapi("RateResponse");

const healthRoute = createRoute({
  method: "get",
  path: "/health",
  tags: ["system"],
  summary: "Liveness check",
  responses: {
    200: {
      content: { "application/json": { schema: healthSchema } },
      description: "Service is up",
    },
  },
});

const tokensRoute = createRoute({
  method: "get",
  path: "/api/tokens",
  tags: ["sera"],
  summary: "List tradable stablecoins",
  request: { query: z.object({ network: networkQuery }) },
  responses: {
    200: {
      content: { "application/json": { schema: tokensResponseSchema } },
      description: "Tokens available on the network",
    },
    502: {
      content: { "application/json": { schema: errorSchema } },
      description: "Sera API unreachable",
    },
  },
});

const marketsRoute = createRoute({
  method: "get",
  path: "/api/markets",
  tags: ["sera"],
  summary: "List order-book markets",
  request: { query: z.object({ network: networkQuery }) },
  responses: {
    200: {
      content: { "application/json": { schema: marketsResponseSchema } },
      description: "Markets with precision rules",
    },
    502: {
      content: { "application/json": { schema: errorSchema } },
      description: "Sera API unreachable",
    },
  },
});

const rateRoute = createRoute({
  method: "get",
  path: "/api/rate",
  tags: ["sera"],
  summary: "Live FX rate for a pair",
  request: {
    query: z.object({
      base: z
        .string()
        .min(1)
        .openapi({
          param: { name: "base", in: "query" },
          example: "USD",
          description: "Base currency code or token symbol",
        }),
      quote: z
        .string()
        .min(1)
        .openapi({
          param: { name: "quote", in: "query" },
          example: "EUR",
          description: "Quote currency code or token symbol",
        }),
      network: networkQuery,
    }),
  },
  responses: {
    200: {
      content: { "application/json": { schema: rateResponseSchema } },
      description: "Current rate with 24h change",
    },
    502: {
      content: { "application/json": { schema: errorSchema } },
      description: "Rate unavailable or Sera API unreachable",
    },
  },
});

export function createApiApp(services: Services): OpenAPIHono {
  const app = new OpenAPIHono({
    defaultHook: (result, c) => {
      if (!result.success) {
        return c.json({ error: "invalid request parameters" }, 400);
      }
    },
  });

  const resolveNetwork = (network?: Network): Network =>
    network ?? services.config.defaultNetwork;

  app.openapi(healthRoute, (c) => c.json({ status: "ok" }, 200));

  app.openapi(tokensRoute, async (c) => {
    const network = resolveNetwork(c.req.valid("query").network);
    try {
      const tokens = await services.rates.getTokens(network);
      return c.json(
        {
          network,
          tokens: tokens.map((t) => ({
            symbol: t.symbol,
            address: t.address,
            decimals: t.decimals,
            currency: t.currency ?? null,
          })),
        },
        200,
      );
    } catch (err) {
      console.error("GET /api/tokens failed:", err);
      return c.json({ error: "Sera API unreachable" }, 502);
    }
  });

  app.openapi(marketsRoute, async (c) => {
    const network = resolveNetwork(c.req.valid("query").network);
    try {
      const markets = await services.rates.getMarkets(network);
      return c.json(
        {
          network,
          markets: markets.map((m) => ({
            symbol: m.symbol,
            base: m.base_symbol,
            quote: m.quote_symbol,
            tickPrecision: m.tick_precision,
            quantityPrecision: m.quantity_precision,
          })),
        },
        200,
      );
    } catch (err) {
      console.error("GET /api/markets failed:", err);
      return c.json({ error: "Sera API unreachable" }, 502);
    }
  });

  app.openapi(rateRoute, async (c) => {
    const { base, quote, network: rawNetwork } = c.req.valid("query");
    const network = resolveNetwork(rawNetwork);
    try {
      // Accept token symbols too: resolve to fiat currency codes when known.
      const [baseToken, quoteToken] = await Promise.all([
        services.rates.findToken(network, base),
        services.rates.findToken(network, quote),
      ]);
      const fx = await services.rates.getFxRate(
        network,
        baseToken?.currency ?? base,
        quoteToken?.currency ?? quote,
      );
      const rate = Number(fx.rate);
      return c.json(
        {
          network,
          pair: fx.pair,
          rate: rate.toFixed(6),
          inverse: rate > 0 ? (1 / rate).toFixed(6) : "0",
          change24hPct:
            fx.change_pct !== null && fx.change_pct !== undefined
              ? String(fx.change_pct)
              : null,
        },
        200,
      );
    } catch (err) {
      console.error("GET /api/rate failed:", err);
      return c.json({ error: "rate unavailable" }, 502);
    }
  });

  app.doc("/openapi.json", {
    openapi: "3.0.0",
    info: {
      title: "Sera FX Bot API",
      version: "1.0.0",
      description:
        "Read-only companion API of the Sera FX Telegram bot. " +
        "Public Sera data only — user-scoped and fund-moving operations are Telegram-exclusive. " +
        "The Telegram webhook (POST /telegram/webhook) is intentionally undocumented here; it is protected by a secret token.",
    },
    tags: [
      { name: "system", description: "Liveness / diagnostics" },
      { name: "sera", description: "Public Sera Protocol data" },
    ],
  });

  app.get("/docs", swaggerUI({ url: "/openapi.json" }));

  return app;
}
