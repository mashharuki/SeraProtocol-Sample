import { describe, expect, test } from "bun:test";
import { RateService } from "./rate-service";

const tokens = [
  // 1e6 min → probe amount = max(2×min, 1 unit) = 2000000
  {
    currency: "USD",
    symbol: "USDC",
    address: "0xusdc",
    decimals: 6,
    min_trade_amount_raw: "1000000",
  },
  {
    currency: "EUR",
    symbol: "EURC",
    address: "0xeurc",
    decimals: 6,
    min_trade_amount_raw: "0",
  },
  // not a major symbol — must be excluded from the probe
  {
    currency: "JPY",
    symbol: "JPYSC",
    address: "0xjpysc",
    decimals: 6,
    min_trade_amount_raw: "0",
  },
];

function buildService(
  liquidDirections: Set<string>,
  counter: { quotes: number },
) {
  const sera = {
    getTokens: async () => tokens,
    getSystemTime: async () => 1_000_000,
    swapQuote: async (req: {
      from_token: string;
      to_token: string;
      from_amount: string;
    }) => {
      counter.quotes++;
      if (liquidDirections.has(`${req.from_token}->${req.to_token}`)) {
        return { uuid: "u", route_params: {} };
      }
      throw new Error("no_liquidity");
    },
  };
  return new RateService((() => sera) as never);
}

describe("RateService.probeLiquidity", () => {
  test("returns only directed major pairs with a live quote, using min-based amounts", async () => {
    const counter = { quotes: 0 };
    const service = buildService(new Set(["0xusdc->0xeurc"]), counter);
    const probe = await service.probeLiquidity("sepolia");
    expect(probe.pairs).toEqual([["USDC", "EURC"]]);
    // 2 majors → 2 directed pairs (JPYSC excluded)
    expect(probe.checked).toBe(2);
    expect(counter.quotes).toBe(2);
  });

  test("caches the probe result briefly", async () => {
    const counter = { quotes: 0 };
    const service = buildService(new Set(), counter);
    await service.probeLiquidity("sepolia");
    await service.probeLiquidity("sepolia");
    expect(counter.quotes).toBe(2); // second call served from cache
  });
});
