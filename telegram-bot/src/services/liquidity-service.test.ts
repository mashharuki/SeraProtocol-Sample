import { describe, expect, test } from "bun:test";
import type { UserRow } from "../db/repositories";
import type { SeraTypedDataPayload } from "../privy/signer";
import { decodeUuidInt, uuidToBigInt } from "../sera/uuid-int";
import { LiquidityService } from "./liquidity-service";

const user: UserRow = {
  telegramUserId: 1,
  privyUserId: null,
  walletId: "wallet-1",
  walletAddress: "0x7Eb0348EbFde6C9c7094Fb921663e6a12D950BbE",
  language: "ja",
  network: "sepolia",
};

const domain = { name: "Sera", version: "1", chainId: 11155111 };

const markets = [
  {
    symbol: "JPYC/USDC",
    base_symbol: "JPYC",
    quote_symbol: "USDC",
    base_address: "0xjpyc",
    quote_address: "0xusdc",
    tick_precision: 6,
    quantity_precision: 6,
  },
  {
    symbol: "JPYC/EURC",
    base_symbol: "JPYC",
    quote_symbol: "EURC",
    base_address: "0xjpyc",
    quote_address: "0xeurc",
    tick_precision: 6,
    quantity_precision: 6,
  },
];

function buildService(captured: {
  previews: Record<string, unknown>[];
  signedMessages: Record<string, unknown>[];
  batch?: Record<string, unknown>[];
  saved: Record<string, unknown>[];
  cancelSign?: SeraTypedDataPayload;
  cancelBody?: Record<string, unknown>;
}) {
  const sera = {
    getConfig: async () => ({ eip712_domain: domain }),
    getSystemTime: async () => 1_000_000,
    previewOrder: async (body: Record<string, unknown>) => {
      captured.previews.push(body);
      return {
        normalized_amount: "500",
        normalized_price: "0.007",
        eip712_order: { user: user.walletAddress, uuid: body.uuid_int },
        eip712_types: { Order: [{ name: "uuid", type: "uint256" }] },
      };
    },
    placeVlBatch: async (orders: Record<string, unknown>[]) => {
      captured.batch = orders;
      return {
        order_ids: orders.map((o) => String(o.order_id)),
        vl_group: { primary_id: "batch-primary-1" },
        amendments: [],
      };
    },
    cancelVlBatch: async (body: Record<string, unknown>) => {
      captured.cancelBody = body;
    },
  };
  const signer = {
    signTypedData: async (_id: string, td: SeraTypedDataPayload) => {
      captured.signedMessages.push(td.message);
      if (td.primaryType === "CancelVLBatch") captured.cancelSign = td;
      return "0xsig";
    },
  };
  const ordersRepo = {
    save: async (row: Record<string, unknown>) => {
      captured.saved.push(row);
    },
    cancelBatch: async () => {},
  };
  const rates = { getMarkets: async () => markets };
  return new LiquidityService(
    rates as never,
    null as never,
    null as never,
    ordersRepo as never,
    signer as never,
    (() => sera) as never,
    (async () => sera) as never,
  );
}

const payload = {
  spendSymbol: "JPYC",
  budgetHuman: "500",
  legs: [
    {
      marketSymbol: "JPYC/USDC",
      side: "ask" as const,
      price: "0.007000",
      amount: "500.000000",
      baseSymbol: "JPYC",
      quoteSymbol: "USDC",
    },
    {
      marketSymbol: "JPYC/EURC",
      side: "ask" as const,
      price: "0.006500",
      amount: "500.000000",
      baseSymbol: "JPYC",
      quoteSymbol: "EURC",
    },
  ],
};

describe("LiquidityService.executeProvide", () => {
  test("previews standalone, signs the VL uuid, submits sequential legs sharing one group", async () => {
    const captured = {
      previews: [] as Record<string, unknown>[],
      signedMessages: [] as Record<string, unknown>[],
      saved: [] as Record<string, unknown>[],
      batch: undefined as Record<string, unknown>[] | undefined,
    };
    const service = buildService(captured);
    const res = await service.executeProvide(user, payload);

    expect(res.vlBatchId).toBe("batch-primary-1");
    expect(captured.batch).toHaveLength(2);

    for (const [i, order] of (captured.batch ?? []).entries()) {
      // preview used the STANDALONE encoding for this order_id
      const previewUuid = decodeUuidInt(
        BigInt(String(captured.previews[i]?.uuid_int)),
      );
      const orderUuidRaw = uuidToBigInt(String(order.order_id));
      expect(previewUuid.orderId).toBe(orderUuidRaw);
      expect(previewUuid.legId).toBe(0n);
      expect(previewUuid.groupId).toBe(
        (orderUuidRaw >> 16n) & ((1n << 112n) - 1n),
      );

      // the submitted uuid_int is VL-encoded: shared group, sequential leg
      const vl = decodeUuidInt(BigInt(String(order.uuid_int)));
      expect(vl.legId).toBe(BigInt(i));
      const firstOrderId = String(captured.batch?.[0]?.order_id);
      expect(vl.groupId).toBe(
        (uuidToBigInt(firstOrderId) >> 16n) & ((1n << 112n) - 1n),
      );

      // the signed message carries the VL uuid, and normalized values are sent
      expect(captured.signedMessages[i]?.uuid).toBe(String(order.uuid_int));
      expect(order.amount).toBe("500");
      expect(order.price).toBe("0.007");
      expect(order.signature).toBe("0xsig");
    }

    // rows persisted with the batch id
    expect(captured.saved).toHaveLength(2);
    expect(captured.saved[0]?.vlBatchId).toBe("batch-primary-1");
  });
});

function buildPrepareService(opts: { fxOk: boolean }) {
  const marketsWithMins = [
    {
      ...markets[0],
      min_ask_amount: "1398.196962",
      min_bid_quote_amount: "8.800000",
    },
    {
      ...markets[1],
      min_ask_amount: "1398.196962",
      min_bid_quote_amount: "7.459813",
    },
  ];
  const rates = {
    getMarkets: async () => marketsWithMins,
    findToken: async (_n: string, sym: string) => ({
      symbol: sym,
      currency: sym === "JPYC" ? "JPY" : sym === "USDC" ? "USD" : "EUR",
      decimals: 6,
    }),
    getFxRate: async () => {
      if (!opts.fxOk) throw new Error("503 Service temporarily unavailable");
      return { rate: "0.0066" };
    },
  };
  const orderService = { checkSideActive: async () => true };
  const pendingActions = { create: async () => "action-1" };
  const sera = {
    getBalances: async () => [
      { symbol: "JPYC", vault_available: "10000000000", decimals: 6 },
    ],
  };
  return new LiquidityService(
    rates as never,
    orderService as never,
    pendingActions as never,
    null as never,
    null as never,
    (() => sera) as never,
    (async () => sera) as never,
  );
}

describe("LiquidityService.prepareProvide", () => {
  test("budget below every market minimum → budget_low with the enabling amount", async () => {
    const service = buildPrepareService({ fxOk: true });
    const plan = await service.prepareProvide(user, "JPYC", 50, "200");
    expect(plan).toEqual({
      status: "budget_low",
      minBudget: "1398.196962",
      symbol: "JPYC",
    });
  });

  test("FX rate feed down for all legs → no_rates, not no_markets", async () => {
    const service = buildPrepareService({ fxOk: false });
    const plan = await service.prepareProvide(user, "JPYC", 50, "2000");
    expect(plan).toEqual({ status: "no_rates" });
  });

  test("sufficient budget with live rates → ok plan with both legs", async () => {
    const service = buildPrepareService({ fxOk: true });
    const plan = await service.prepareProvide(user, "JPYC", 50, "2000");
    expect(plan.status).toBe("ok");
    if (plan.status === "ok") {
      expect(plan.payload.legs).toHaveLength(2);
    }
  });
});

describe("LiquidityService.minBudgetHint", () => {
  test("returns the 2nd-smallest requirement across candidate markets", async () => {
    const service = buildPrepareService({ fxOk: true });
    const hint = await service.minBudgetHint("sepolia", "JPYC");
    expect(hint).toBe("1398.196962");
  });
});

describe("LiquidityService.cancelBatch", () => {
  test("signs CancelVLBatch {owner, vlBatchId: string} (verified live 2026-07-10)", async () => {
    const captured = {
      previews: [],
      signedMessages: [],
      saved: [],
      cancelSign: undefined as SeraTypedDataPayload | undefined,
      cancelBody: undefined as Record<string, unknown> | undefined,
    };
    const service = buildService(captured);
    const res = await service.cancelBatch(user, "batch-primary-1");
    expect(res.status).toBe("ok");
    expect(captured.cancelSign?.types).toEqual({
      CancelVLBatch: [
        { name: "owner", type: "address" },
        { name: "vlBatchId", type: "string" },
      ],
    });
    expect(captured.cancelSign?.message).toEqual({
      owner: user.walletAddress,
      vlBatchId: "batch-primary-1",
    });
    expect(captured.cancelBody).toEqual({
      owner_address: user.walletAddress,
      vl_batch_id: "batch-primary-1",
      signature: "0xsig",
    });
  });
});
