import { describe, expect, test } from "bun:test";
import type { UserRow } from "../../src/db/repositories";
import type { SeraTypedDataPayload } from "../../src/privy/signer";
import { SwapService } from "../../src/services/swap-service";

const user: UserRow = {
  telegramUserId: 1,
  privyUserId: null,
  walletId: "wallet-1",
  walletAddress: "0x1111111111111111111111111111111111111111",
  language: "ja",
  network: "sepolia",
};

const domain = {
  name: "Sera",
  version: "1",
  chainId: 11155111,
  verifyingContract: "0x83475A1bD98a8DC2DCd507A747e4DC85da241D6e",
};

// Live /swap/quote shape (observed 2026-07-12): route_params is the flat
// Intent struct itself — no domain/types/message wrapper like /orders/preview
// returns.
const routeParams = {
  taker: "0xde5d006963826ad38cea0a2def99c4cf1c7ba55e",
  inputToken: "0x965d4b4546716e416e950bc30467d128455d2d0e",
  outputToken: "0x8365421d0e1b316fc6398d21be162992216bf2ad",
  maxInputAmount: "100000000",
  minOutputAmount: "90225723",
  recipient: "0xde5d006963826ad38cea0a2def99c4cf1c7ba55e",
  initialDepositAmount: "100000000",
  uuid: "3250303191902943149436576384610298481975900830521733492440698188999245766656",
  deadline: 1783822839,
};

// Live /swap/quote shape (observed 2026-07-12): quote.permit is fully
// wrapped and ready to sign verbatim, unlike route_params.
const permitBlock = {
  permit_required: true,
  suggested_deadline: 1783822839,
  eip712: {
    domain: {
      name: "JPYC",
      version: "1",
      chainId: 11155111,
      verifyingContract: "0xjpyc",
    },
    types: {
      Permit: [
        { name: "owner", type: "address" },
        { name: "spender", type: "address" },
        { name: "value", type: "uint256" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
    },
    primaryType: "Permit",
    message: {
      owner: routeParams.taker,
      spender: "0xspender",
      value: "100000000",
      nonce: 0,
      deadline: 1783822839,
    },
  },
};

interface Captured {
  typedData: SeraTypedDataPayload[];
  submitBody?: Record<string, unknown>;
}

function newCaptured(): Captured {
  return { typedData: [] };
}

function buildService(opts: { captured: Captured; permit?: unknown }) {
  const { captured, permit } = opts;
  const rateService = {
    findToken: async (_network: string, symbol: string) => ({
      symbol,
      address:
        symbol === "USDC" || symbol === "JPYC"
          ? routeParams.inputToken
          : routeParams.outputToken,
      decimals: 6,
    }),
  };
  const pendingActions = {
    create: async () => "action-1",
  };
  const signer = {
    signTypedData: async (_id: string, td: SeraTypedDataPayload) => {
      captured.typedData.push(td);
      return `0xsig${captured.typedData.length}`;
    },
  };
  const seraStub = {
    getSystemTime: async () => 1_700_000_000,
    getConfig: async () => ({ eip712_domain: domain }),
    swapQuote: async () => ({
      uuid: "quote-1",
      route_params: routeParams,
      quote_breakdown: { total_fee: "included in rate" },
      expires_at: Date.now() / 1000 + 30,
      permit,
    }),
    submitSwap: async (body: Record<string, unknown>) => {
      captured.submitBody = body;
      return { success: true, trade_id: "trade-1" };
    },
  };
  const service = new SwapService(
    rateService as never,
    pendingActions as never,
    signer as never,
    (() => seraStub) as never,
  );
  return { service, seraStub };
}

describe("SwapService.prepareSwap", () => {
  test("reads minOutputAmount directly from the flat route_params (not route_params.message)", async () => {
    const captured = newCaptured();
    const { service } = buildService({ captured });
    const card = await service.prepareSwap(user, {
      fromSymbol: "USDC",
      toSymbol: "USDT",
      amount: "100",
    });
    // 90225723 raw / 1e6 decimals = 90.225723
    expect(card.minOutput).toBe("90.225723");
    expect(card.rate).toBe("1 USDC ≈ 0.902257 USDT");
  });
});

describe("SwapService.executeSwap", () => {
  test("wraps route_params in the Intent domain/types before signing", async () => {
    const captured = newCaptured();
    const { service } = buildService({ captured });
    await service.executeSwap(user, {
      uuid: "quote-1",
      routeParams,
      fromSymbol: "USDC",
      toSymbol: "USDT",
      fromAmount: "100",
      minOutput: "90.225723",
      toDecimals: 6,
    });
    const [intentSig] = captured.typedData;
    expect(intentSig?.domain).toEqual(domain);
    expect(intentSig?.primaryType).toBe("Intent");
    expect(intentSig?.message).toEqual(routeParams);
    const types = intentSig?.types as {
      Intent: { name: string; type: string }[];
    };
    expect(types.Intent.map((f) => f.name)).toEqual([
      "taker",
      "inputToken",
      "outputToken",
      "maxInputAmount",
      "minOutputAmount",
      "recipient",
      "initialDepositAmount",
      "uuid",
      "deadline",
    ]);
  });

  test("submits the signature with the quote uuid and no permit fields when none is required", async () => {
    const captured = newCaptured();
    const { service } = buildService({ captured });
    await service.executeSwap(user, {
      uuid: "quote-1",
      routeParams,
      fromSymbol: "USDC",
      toSymbol: "USDT",
      fromAmount: "100",
      minOutput: "90.225723",
      toDecimals: 6,
    });
    expect(captured.submitBody).toEqual({
      uuid: "quote-1",
      signature: "0xsig1",
    });
  });

  test("signs and submits the permit when the quote requires one (e.g. JPYC)", async () => {
    const captured = newCaptured();
    const { service } = buildService({ captured, permit: permitBlock });
    const card = await service.prepareSwap(user, {
      fromSymbol: "JPYC",
      toSymbol: "USDC",
      amount: "1400",
    });
    // prepareSwap's own quote call shouldn't have signed anything yet.
    expect(captured.typedData).toHaveLength(0);

    // Re-fetch the payload the way callbacks.ts does: via the pending action.
    // Here we just rebuild the equivalent payload directly for executeSwap.
    await service.executeSwap(user, {
      uuid: "quote-1",
      routeParams,
      fromSymbol: "JPYC",
      toSymbol: "USDC",
      fromAmount: "1400",
      minOutput: card.minOutput,
      toDecimals: 6,
      permitEip712: permitBlock.eip712,
      permitDeadline: permitBlock.suggested_deadline,
    });

    expect(captured.typedData).toHaveLength(2);
    const [intentSig, permitSig] = captured.typedData;
    expect(intentSig?.primaryType).toBe("Intent");
    expect(permitSig?.primaryType).toBe("Permit");
    expect(permitSig).toEqual(permitBlock.eip712 as SeraTypedDataPayload);
    expect(captured.submitBody).toEqual({
      uuid: "quote-1",
      signature: "0xsig1",
      permit_signature: "0xsig2",
      permit_deadline: permitBlock.suggested_deadline,
    });
  });
});
