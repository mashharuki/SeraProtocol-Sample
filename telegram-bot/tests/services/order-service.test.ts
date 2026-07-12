import { describe, expect, test } from "bun:test";
import type { UserRow } from "../../src/db/repositories";
import type { SeraTypedDataPayload } from "../../src/privy/signer";
import { OrderService } from "../../src/services/order-service";

const user: UserRow = {
  telegramUserId: 1,
  privyUserId: null,
  walletId: "wallet-1",
  walletAddress: "0x7Eb0348EbFde6C9c7094Fb921663e6a12D950BbE",
  language: "ja",
  network: "sepolia",
};

const domain = {
  name: "Sera",
  version: "1",
  chainId: 11155111,
  verifyingContract: "0x83475A1bD98a8DC2DCd507A747e4DC85da241D6e",
};

// Live /orders/preview shape (observed 2026-07-10): the EIP-712 message and
// types come back as eip712_order / eip712_types; domain comes from /config.
const previewResponse = {
  ok: true,
  symbol: "USDC/EURC",
  normalized_amount: "8.8",
  normalized_price: "1",
  canonicalization_required: true,
  eip712_order: {
    user: "0x7eb0348ebfde6c9c7094fb921663e6a12d950bbe",
    expiration: "1786249966",
    fromAmount: "8800000",
    uuid: "123",
  },
  eip712_types: {
    Order: [
      { name: "user", type: "address" },
      { name: "expiration", type: "uint48" },
      { name: "fromAmount", type: "uint256" },
      { name: "uuid", type: "uint256" },
    ],
  },
};

function buildService(captured: {
  typedData?: SeraTypedDataPayload;
  submitBody?: Record<string, unknown>;
}) {
  const signer = {
    signTypedData: async (_id: string, td: SeraTypedDataPayload) => {
      captured.typedData = td;
      return "0xsig";
    },
  };
  const seraStub = {
    getConfig: async () => ({ eip712_domain: domain }),
    submitOrder: async (body: Record<string, unknown>) => {
      captured.submitBody = body;
      return { order_id: "order-1" };
    },
  };
  const ordersRepo = { save: async () => {} };
  return new OrderService(
    null as never,
    null as never,
    ordersRepo as never,
    signer as never,
    (() => seraStub) as never,
    null as never,
  );
}

describe("OrderService.executeOrder", () => {
  test("signs domain from /config + preview's eip712_types/eip712_order verbatim", async () => {
    const captured: { typedData?: SeraTypedDataPayload } = {};
    const service = buildService(captured);
    await service.executeOrder(user, {
      orderId: "id-1",
      uuidInt: "123",
      submitBody: { order_id: "id-1", side: "ask" },
      previewTypedData: previewResponse,
      market: "USDC/EURC",
      side: "ask",
      price: "1.0",
      amount: "8.8",
      baseSymbol: "USDC",
      quoteSymbol: "EURC",
    });
    expect(captured.typedData).toEqual({
      domain,
      types: previewResponse.eip712_types,
      primaryType: "Order",
      message: previewResponse.eip712_order,
    });
  });

  test("submits canonicalized amount/price from the preview plus the signature", async () => {
    // Live 2026-07-10: POST /orders rejects the raw user input with
    // INVALID_DECIMAL_FORMAT (submitted "8.800000", normalized "8.8") —
    // the normalized values from the preview must be re-sent.
    const captured: { submitBody?: Record<string, unknown> } = {};
    const service = buildService(captured);
    await service.executeOrder(user, {
      orderId: "id-1",
      uuidInt: "123",
      submitBody: {
        order_id: "id-1",
        side: "ask",
        amount: "8.800000",
        price: "1.000000",
      },
      previewTypedData: previewResponse,
      market: "USDC/EURC",
      side: "ask",
      price: "1.000000",
      amount: "8.800000",
      baseSymbol: "USDC",
      quoteSymbol: "EURC",
    });
    expect(captured.submitBody).toEqual({
      order_id: "id-1",
      side: "ask",
      amount: "8.8",
      price: "1",
      signature: "0xsig",
    });
  });
});
