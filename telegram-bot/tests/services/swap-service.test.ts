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

function buildService(captured: {
  typedData?: SeraTypedDataPayload;
  submitBody?: Record<string, unknown>;
}) {
  const rateService = {
    findToken: async (_network: string, symbol: string) => ({
      symbol,
      address:
        symbol === "USDC" ? routeParams.inputToken : routeParams.outputToken,
      decimals: 6,
    }),
  };
  const pendingActions = {
    create: async () => "action-1",
  };
  const signer = {
    signTypedData: async (_id: string, td: SeraTypedDataPayload) => {
      captured.typedData = td;
      return "0xsig";
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
    const { service } = buildService({});
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
    const captured: { typedData?: SeraTypedDataPayload } = {};
    const { service } = buildService(captured);
    await service.executeSwap(user, {
      uuid: "quote-1",
      routeParams,
      fromSymbol: "USDC",
      toSymbol: "USDT",
      fromAmount: "100",
      minOutput: "90.225723",
      toDecimals: 6,
    });
    expect(captured.typedData?.domain).toEqual(domain);
    expect(captured.typedData?.primaryType).toBe("Intent");
    expect(captured.typedData?.message).toEqual(routeParams);
    const types = captured.typedData?.types as {
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

  test("submits the signature with the quote uuid", async () => {
    const captured: { submitBody?: Record<string, unknown> } = {};
    const { service } = buildService(captured);
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
      signature: "0xsig",
    });
  });
});
