import { describe, expect, test } from "bun:test";
import { normalizeTxForPrivy } from "../services/deposit-service";
import { extractErrorCode } from "./client";
import { SeraApiError, toUserMessageKey } from "./errors";

describe("extractErrorCode (live formats)", () => {
  test("top-level error_code", () => {
    expect(extractErrorCode({ error_code: "QUOTE_STALE", detail: "x" })).toBe(
      "QUOTE_STALE",
    );
  });

  test("nested lowercase detail.error (observed on /swap/quote)", () => {
    expect(
      extractErrorCode({ detail: { success: false, error: "no_liquidity" } }),
    ).toBe("NO_LIQUIDITY");
  });

  test("bare code string in detail (observed on /orders/preview)", () => {
    expect(extractErrorCode({ detail: "PAIR_INACTIVE" })).toBe("PAIR_INACTIVE");
  });

  test("prose detail matching a known code (observed on /swap/quote)", () => {
    expect(extractErrorCode({ detail: "No liquidity" })).toBe("NO_LIQUIDITY");
    expect(extractErrorCode({ detail: "quote stale" })).toBe("QUOTE_STALE");
  });

  test("human-readable detail is not mistaken for a code", () => {
    expect(extractErrorCode({ detail: "Invalid request" })).toBeUndefined();
    expect(
      extractErrorCode({ detail: "Something went wrong" }),
    ).toBeUndefined();
  });

  test("codes map to helpful user messages, not errorGeneric", () => {
    const noLiquidity = new SeraApiError(
      400,
      "NO_LIQUIDITY",
      "x",
      "/swap/quote",
    );
    expect(toUserMessageKey(noLiquidity)).toBe("errNoLiquidity");
    const inactive = new SeraApiError(
      400,
      "PAIR_INACTIVE",
      "x",
      "/orders/preview",
    );
    expect(toUserMessageKey(inactive)).toBe("errPairInactive");
  });
});

describe("normalizeTxForPrivy", () => {
  test("converts builder tx (live shape) to Privy field names and types", () => {
    const built = {
      to: "0x965d",
      data: "0x095e",
      value: "0x0",
      chainId: "0xaa36a7",
      nonce: "0x1",
      gas: "0xdb4f",
      type: "0x2",
      maxFeePerGas: "0x8769",
      maxPriorityFeePerGas: "0x59682f00",
      from: undefined,
    };
    const out = normalizeTxForPrivy(built);
    expect(out.chain_id).toBe("0xaa36a7");
    expect(out.gas_limit).toBe("0xdb4f");
    expect(out.max_fee_per_gas).toBe("0x8769");
    expect(out.max_priority_fee_per_gas).toBe("0x59682f00");
    expect(out.type).toBe(2); // number, not "0x2"
    expect("from" in out).toBe(false);
    expect(out.gas).toBeUndefined();
  });
});
