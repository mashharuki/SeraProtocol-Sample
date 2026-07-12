import { describe, expect, test } from "bun:test";
import type { UserRow } from "../../src/db/repositories";
import { WalletKeyService } from "../../src/services/wallet-key-service";

const user: UserRow = {
  telegramUserId: 42,
  privyUserId: null,
  walletId: "wallet-old",
  walletAddress: "0x1111111111111111111111111111111111111111",
  language: "ja",
  network: "sepolia",
};

// A real test private key (viem's well-known anvil key #0) so address
// derivation is deterministic.
const KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const ADDR = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

function build() {
  const calls = {
    imported: undefined as Record<string, unknown> | undefined,
    replaced: undefined as Record<string, unknown> | undefined,
    deletedKeysFor: undefined as number | undefined,
    exportedWalletId: undefined as string | undefined,
  };
  const signer = {
    keyTransferEnabled: true,
    exportPrivateKey: async (walletId: string) => {
      calls.exportedWalletId = walletId;
      return "0xdecryptedkey";
    },
    importPrivateKey: async (args: Record<string, unknown>) => {
      calls.imported = args;
      return { walletId: "wallet-new", address: ADDR };
    },
  };
  const users = {
    replaceWallet: async (id: number, w: Record<string, unknown>) => {
      calls.replaced = { id, ...w };
    },
  };
  const apiKeys = {
    deleteAll: async (id: number) => {
      calls.deletedKeysFor = id;
    },
  };
  const svc = new WalletKeyService(
    signer as never,
    users as never,
    apiKeys as never,
  );
  return { svc, calls };
}

describe("WalletKeyService.enabled", () => {
  test("mirrors the signer's keyTransferEnabled flag", () => {
    const { svc } = build();
    expect(svc.enabled).toBe(true);
  });
});

describe("WalletKeyService.exportKey", () => {
  test("returns the signer's decrypted key for the user's wallet", async () => {
    const { svc, calls } = build();
    const key = await svc.exportKey(user);
    expect(key).toBe("0xdecryptedkey");
    expect(calls.exportedWalletId).toBe("wallet-old");
  });
});

describe("WalletKeyService.importKey", () => {
  test("rejects an invalid private key without touching Privy or the DB", async () => {
    const { svc, calls } = build();
    const res = await svc.importKey(user, "not-a-key");
    expect(res.ok).toBe(false);
    expect(calls.imported).toBeUndefined();
    expect(calls.replaced).toBeUndefined();
  });

  test("imports, replaces the wallet, and clears the user's API keys", async () => {
    const { svc, calls } = build();
    const res = await svc.importKey(user, KEY);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.address).toBe(ADDR);
    // derived address (checksummed) was passed to Privy
    expect(calls.imported?.address).toBe(ADDR);
    expect(calls.imported?.privateKeyHex).toBe(KEY);
    expect(calls.replaced).toEqual({
      id: 42,
      walletId: "wallet-new",
      walletAddress: ADDR,
    });
    expect(calls.deletedKeysFor).toBe(42);
  });

  test("accepts a private key with no 0x prefix", async () => {
    const { svc, calls } = build();
    const res = await svc.importKey(user, KEY.slice(2));
    expect(res.ok).toBe(true);
    // normalized back to 0x-prefixed before handing to Privy
    expect(calls.imported?.privateKeyHex).toBe(KEY);
  });
});
