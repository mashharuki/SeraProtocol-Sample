import { describe, expect, test } from "bun:test";
import type { UserRow } from "../../src/db/repositories";
import {
  DepositService,
  normalizeTxForPrivy,
} from "../../src/services/deposit-service";

const user: UserRow = {
  telegramUserId: 1,
  privyUserId: null,
  walletId: "wallet-1",
  walletAddress: "0x7Eb0348EbFde6C9c7094Fb921663e6a12D950BbE",
  language: "ja",
  network: "sepolia",
};

describe("DepositService.executeDeposit", () => {
  test("waits for the approve receipt before building the deposit tx, and for the deposit receipt before reporting success", async () => {
    // Live 2026-07-10: POST /deposit returns 400 "Invalid request" while the
    // approve is still in the mempool — the builder checks the on-chain
    // allowance, so the approve must be mined first. The final deposit tx is
    // also awaited so "success" means mined, not merely broadcast.
    const calls: string[] = [];
    const sera = {
      getConfig: async () => ({ vault_address: "0xvault" }),
      buildApprove: async () => {
        calls.push("buildApprove");
        return { to: "0xtoken", type: "0x2" };
      },
      sendTx: async () => {
        calls.push("sendTx");
        return `0xhash${calls.length}`;
      },
      buildDeposit: async () => {
        calls.push("buildDeposit");
        return { to: "0xvault", type: "0x2" };
      },
    };
    const signer = {
      signTransaction: async () => {
        calls.push("sign");
        return "0xsigned";
      },
    };
    const service = new DepositService(
      {
        networks: {
          sepolia: { explorerBaseUrl: "https://x", rpcUrl: "http://r" },
        },
      } as never,
      null as never,
      null as never,
      null as never,
      signer as never,
      (async () => sera) as never,
      async (network, hash) => {
        calls.push(`wait:${network}:${hash}`);
      },
    );
    const res = await service.executeDeposit(user, {
      tokenSymbol: "JPYC",
      tokenAddress: "0xtoken",
      amountHuman: "500",
      amountRaw: "500000000",
    });
    expect(calls).toEqual([
      "buildApprove",
      "sign",
      "sendTx",
      "wait:sepolia:0xhash3",
      "buildDeposit",
      "sign",
      "sendTx",
      "wait:sepolia:0xhash7",
    ]);
    expect(res.txHash).toBe("0xhash7");
  });
});

describe("normalizeTxForPrivy", () => {
  test("keeps converting hex type to number", () => {
    expect(normalizeTxForPrivy({ type: "0x2" }).type).toBe(2);
  });
});
