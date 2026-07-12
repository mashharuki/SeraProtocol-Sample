import { describe, expect, test } from "bun:test";
import {
  bigIntToUuid,
  decodeUuidInt,
  encodeUuidInt,
  uuidToBigInt,
} from "../../src/sera/uuid-int";

describe("uuid-int encoding", () => {
  test("round-trips a UUID through encode/decode", () => {
    const orderId = "01234567-89ab-4def-8123-456789abcdef";
    const encoded = encodeUuidInt(orderId);
    const decoded = decodeUuidInt(encoded);
    expect(decoded.orderId).toBe(uuidToBigInt(orderId));
    expect(bigIntToUuid(decoded.orderId)).toBe(orderId);
    expect(decoded.executor).toBe(0n);
    expect(decoded.legId).toBe(0n);
  });

  test("standalone group id is orderId >> 16 (masked to 112 bits)", () => {
    const orderId = crypto.randomUUID();
    const id = uuidToBigInt(orderId);
    const decoded = decodeUuidInt(encodeUuidInt(orderId));
    expect(decoded.groupId).toBe((id >> 16n) & ((1n << 112n) - 1n));
  });

  test("bit layout matches [255:252]exec | [251:124]id | [123:12]group | [11:0]leg", () => {
    // All-ones UUID makes the boundaries visible.
    const orderId = "ffffffff-ffff-ffff-ffff-ffffffffffff";
    const id = (1n << 128n) - 1n;
    const encoded = encodeUuidInt(orderId, {
      executor: 0xan,
      groupId: 0x123n,
      legId: 0x456n,
    });
    expect(encoded >> 252n).toBe(0xan);
    expect((encoded >> 124n) & ((1n << 128n) - 1n)).toBe(id);
    expect((encoded >> 12n) & ((1n << 112n) - 1n)).toBe(0x123n);
    expect(encoded & ((1n << 12n) - 1n)).toBe(0x456n);
  });

  test("fits in uint256", () => {
    const encoded = encodeUuidInt("ffffffff-ffff-ffff-ffff-ffffffffffff", {
      executor: 0xfn,
      groupId: (1n << 112n) - 1n,
      legId: (1n << 12n) - 1n,
    });
    expect(encoded < 1n << 256n).toBe(true);
  });

  test("rejects malformed UUIDs and oversized executor", () => {
    expect(() => uuidToBigInt("not-a-uuid")).toThrow();
    expect(() =>
      encodeUuidInt(crypto.randomUUID(), { executor: 16n }),
    ).toThrow();
  });

  test("random UUIDs survive many round-trips", () => {
    for (let i = 0; i < 100; i++) {
      const orderId = crypto.randomUUID();
      const decoded = decodeUuidInt(encodeUuidInt(orderId));
      expect(bigIntToUuid(decoded.orderId)).toBe(orderId);
    }
  });
});
