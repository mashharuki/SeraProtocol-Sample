import { describe, expect, test } from "bun:test";
import { orderMinBase } from "./flows";

describe("orderMinBase", () => {
  test("ask uses min_ask_amount directly, trimming trailing zeros", () => {
    expect(
      orderMinBase({
        side: "ask",
        minAskAmount: "8.800000",
        quantityPrecision: 6,
      }),
    ).toBe("8.8");
  });

  test("bid converts min_bid_quote_amount via price, rounding UP", () => {
    // 8.8 / 0.007 = 1257.142857142... → ceil at 6 dp so it passes the API
    const min = orderMinBase({
      side: "bid",
      price: "0.007",
      minBidQuoteAmount: "8.800000",
      quantityPrecision: 6,
    });
    expect(min).toBe("1257.142858");
    expect(Number(min) * 0.007).toBeGreaterThanOrEqual(8.8);
  });

  test("exact divisions are not inflated by float noise", () => {
    // 8.8 / 10 = 0.8800000000000001 in FP; must show 0.88, not 0.880001
    expect(
      orderMinBase({
        side: "bid",
        price: "10",
        minBidQuoteAmount: "8.800000",
        quantityPrecision: 6,
      }),
    ).toBe("0.88");
  });

  test("returns null when no minimum applies or price is missing", () => {
    expect(orderMinBase({ side: "ask", quantityPrecision: 6 })).toBeNull();
    expect(
      orderMinBase({
        side: "bid",
        minBidQuoteAmount: "8.8",
        quantityPrecision: 6,
      }),
    ).toBeNull();
    expect(
      orderMinBase({
        side: "ask",
        minAskAmount: "0",
        quantityPrecision: 6,
      }),
    ).toBeNull();
  });
});
