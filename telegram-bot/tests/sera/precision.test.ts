import { describe, expect, test } from "bun:test";
import {
  formatDisplayAmount,
  fromRawUnits,
  toRawUnits,
  validateAmount,
} from "../../src/sera/precision";

describe("validateAmount", () => {
  test("accepts plain and decimal numbers within precision", () => {
    expect(validateAmount("100", 6).ok).toBe(true);
    expect(validateAmount("25.5", 6).ok).toBe(true);
    expect(validateAmount("1,000.25", 6).ok).toBe(true);
  });

  test("rejects non-numbers, negatives, zero, extra precision", () => {
    expect(validateAmount("abc", 6).reason).toBe("not_a_number");
    expect(validateAmount("-5", 6).reason).toBe("not_a_number");
    expect(validateAmount("0", 6).reason).toBe("not_positive");
    expect(validateAmount("1.1234567", 6).reason).toBe("too_many_decimals");
    expect(validateAmount("1.05", 1).reason).toBe("too_many_decimals");
  });
});

describe("toRawUnits (reject_extra_precision)", () => {
  test("USDC (6 decimals)", () => {
    expect(toRawUnits("25.5", 6)).toBe(25_500_000n);
    expect(toRawUnits("100", 6)).toBe(100_000_000n);
  });

  test("JPYC (18 decimals)", () => {
    expect(toRawUnits("1", 18)).toBe(10n ** 18n);
    expect(toRawUnits("0.000000000000000001", 18)).toBe(1n);
  });

  test("rejects extra precision instead of rounding", () => {
    expect(() => toRawUnits("1.1234567", 6)).toThrow();
  });
});

describe("fromRawUnits", () => {
  test("inverse of toRawUnits", () => {
    expect(fromRawUnits(25_500_000n, 6)).toBe("25.5");
    expect(fromRawUnits("100000000", 6)).toBe("100");
    expect(fromRawUnits(1n, 18)).toBe("0.000000000000000001");
    expect(fromRawUnits(0n, 6)).toBe("0");
  });
});

describe("formatDisplayAmount", () => {
  test("caps shown decimals without touching the integer part", () => {
    expect(formatDisplayAmount("123.456789123", 6)).toBe("123.456789");
    expect(formatDisplayAmount("123.4500000", 6)).toBe("123.45");
    expect(formatDisplayAmount("123", 6)).toBe("123");
  });
});
