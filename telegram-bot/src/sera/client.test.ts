import { describe, expect, test } from "bun:test";
import { SeraClient } from "./client";

function stubFetch(
  handler: (
    url: string,
    init?: RequestInit,
  ) => { status: number; body: unknown },
): typeof fetch {
  return (async (input: URL | RequestInfo, init?: RequestInit) => {
    const url = String(input);
    const res = handler(url, init);
    return new Response(JSON.stringify(res.body), {
      status: res.status,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
}

describe("SeraClient.getBalances", () => {
  test("parses the live array shape {balances: [{symbol, decimals, ...}]}", async () => {
    // Shape observed live on api-testnet.sera.cx (2026-07-09)
    const client = new SeraClient({
      baseUrl: "https://sera.test/api/v1",
      apiKey: { key: "k", secret: "s" },
      fetchImpl: stubFetch(() => ({
        status: 200,
        body: {
          owner_address: "0xabc",
          balances: [
            {
              symbol: "USDC",
              address: "0xa0b8",
              decimals: 6,
              wallet_balance: "25500000",
              vault_available: "1000000",
              vault_frozen: "0",
            },
          ],
          updated_at: "2026-07-09T00:00:00+00:00",
          wallet_balance_available: true,
        },
      })),
    });
    const rows = await client.getBalances("0xABC");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.symbol).toBe("USDC");
    expect(rows[0]?.decimals).toBe(6);
    expect(rows[0]?.wallet_balance).toBe("25500000");
  });

  test("lowercases owner_address in the query", async () => {
    let seenUrl = "";
    const client = new SeraClient({
      baseUrl: "https://sera.test/api/v1",
      apiKey: { key: "k", secret: "s" },
      fetchImpl: stubFetch((url) => {
        seenUrl = url;
        return { status: 200, body: { balances: [] } };
      }),
    });
    await client.getBalances("0xAbCdEf1111111111111111111111111111111111");
    expect(seenUrl).toContain(
      "owner_address=0xabcdef1111111111111111111111111111111111",
    );
  });
});

describe("SeraClient.createApiKey", () => {
  test("sends exactly {owner_address, action, timestamp, signature}", async () => {
    // Body shape verified live: `owner`/`label` fields cause HTTP 422
    let seenBody: Record<string, unknown> = {};
    const client = new SeraClient({
      baseUrl: "https://sera.test/api/v1",
      fetchImpl: stubFetch((_url, init) => {
        seenBody = JSON.parse(String(init?.body));
        return { status: 200, body: { api_key: "k", api_secret: "s" } };
      }),
    });
    await client.createApiKey({
      owner_address: "0x1111111111111111111111111111111111111111",
      action: "create",
      timestamp: 1234,
      signature: "0xsig",
    });
    expect(Object.keys(seenBody).sort()).toEqual([
      "action",
      "owner_address",
      "signature",
      "timestamp",
    ]);
  });
});
