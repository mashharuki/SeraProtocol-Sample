import { describe, expect, test } from "bun:test";
import { addressQrPng } from "../../src/bot/qr";

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe("addressQrPng", () => {
  test("returns a real PNG of a scannable size", async () => {
    const buf = await addressQrPng(
      "0x7Eb0348EbFde6C9c7094Fb921663e6a12D950BbE",
    );
    expect(buf.subarray(0, 8).equals(PNG_MAGIC)).toBe(true);
    expect(buf.length).toBeGreaterThan(500);
  });
});
