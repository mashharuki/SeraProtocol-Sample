import type { Network } from "../config";
import type { OrderRepository, OrderRow, UserRow } from "../db/repositories";
import type { PrivySigner, SeraTypedDataPayload } from "../privy/signer";
import type { SeraClient } from "../sera/client";
import { SeraApiError } from "../sera/errors";
import { fromRawUnits, toRawUnits, validateAmount } from "../sera/precision";
import type { OrderPreviewRequest, SeraMarket } from "../sera/types";
import { encodeUuidInt } from "../sera/uuid-int";
import type { PendingActionService } from "./pending-actions";
import type { RateService } from "./rate-service";

export interface OrderActionPayload {
  orderId: string;
  uuidInt: string;
  /** The submit body: preview request fields, re-sent with the signature. */
  submitBody: Record<string, unknown>;
  /** EIP-712 payload returned by /orders/preview — signed verbatim. */
  previewTypedData: Record<string, unknown>;
  market: string;
  side: "bid" | "ask";
  price: string;
  amount: string;
  baseSymbol: string;
  quoteSymbol: string;
}

export interface CancelActionPayload {
  orderId: string;
  uuidInt: string;
  market: string;
  price: string;
}

export interface OrderCard {
  actionId: string;
  market: string;
  side: "bid" | "ask";
  price: string;
  amount: string;
  baseSymbol: string;
  quoteSymbol: string;
}

export interface PrepareOrderInput {
  marketSymbol: string;
  side: "bid" | "ask";
  price: string;
  amount: string;
}

export type VaultCheck =
  | { ok: true }
  | { ok: false; neededHuman: string; availableHuman: string; symbol: string };

const ORDER_EXPIRATION_SEC = 30 * 24 * 60 * 60; // 30 days
const CANCEL_COOLDOWN_MS = 5 * 60 * 1000;

export class OrderService {
  constructor(
    private rateService: RateService,
    private pendingActions: PendingActionService,
    private orders: OrderRepository,
    private signer: PrivySigner,
    private publicSera: (network: Network) => SeraClient,
    private authedSera: (user: UserRow) => Promise<SeraClient>,
  ) {}

  async getMarket(
    network: Network,
    symbol: string,
  ): Promise<SeraMarket | null> {
    return this.rateService.findMarket(network, symbol);
  }

  /**
   * Is this (market, side) accepting orders right now? PAIR_INACTIVE is
   * checked by /orders/preview before any amount validation (verified live
   * 2026-07-10: all 28 major asks OK, all 28 bids PAIR_INACTIVE), so a
   * dummy preview with a throwaway owner is a reliable, side-effect-free
   * probe. Any response other than PAIR_INACTIVE counts as active.
   */
  async checkSideActive(
    network: Network,
    market: SeraMarket,
    side: "bid" | "ask",
  ): Promise<boolean> {
    const sera = this.publicSera(network);
    const orderId = crypto.randomUUID();
    try {
      await sera.previewOrder({
        owner_address: "0x1111111111111111111111111111111111111111",
        side,
        amount: "1",
        price: "1",
        order_type: "limit",
        from_address:
          side === "bid" ? market.quote_address : market.base_address,
        to_address: side === "bid" ? market.base_address : market.quote_address,
        order_id: orderId,
        uuid_int: encodeUuidInt(orderId).toString(),
        expiration: (await sera.getSystemTime()) + 3600,
      });
      return true;
    } catch (err) {
      if (err instanceof SeraApiError && err.errorCode === "PAIR_INACTIVE") {
        return false;
      }
      return true; // amount/precision errors etc. mean the pair is live
    }
  }

  /**
   * Bids lock quote-token (price×amount), asks lock base-token (amount) —
   * both from vault_available. Returns what's missing for the UX prompt.
   */
  async checkVaultBalance(
    user: UserRow,
    market: SeraMarket,
    side: "bid" | "ask",
    price: string,
    amount: string,
  ): Promise<VaultCheck> {
    const sera = await this.authedSera(user);
    const balances = await sera.getBalances(user.walletAddress);
    const spendSymbol =
      side === "bid" ? market.quote_symbol : market.base_symbol;
    const spendDecimals =
      (side === "bid" ? market.quote_decimals : market.base_decimals) ?? 6;

    const neededHumanNum =
      side === "bid" ? Number(price) * Number(amount) : Number(amount);
    const neededRaw = toRawUnits(
      neededHumanNum.toFixed(spendDecimals),
      spendDecimals,
    );

    const row = balances.find(
      (b) => b.symbol.toLowerCase() === spendSymbol.toLowerCase(),
    );
    const availableRaw = BigInt(row?.vault_available ?? "0");
    if (availableRaw >= neededRaw) return { ok: true };
    return {
      ok: false,
      neededHuman: fromRawUnits(neededRaw, spendDecimals),
      availableHuman: fromRawUnits(availableRaw, spendDecimals),
      symbol: spendSymbol,
    };
  }

  async prepareLimitOrder(
    user: UserRow,
    input: PrepareOrderInput,
  ): Promise<OrderCard> {
    const market = await this.rateService.findMarket(
      user.network,
      input.marketSymbol,
    );
    if (!market) throw new Error(`Unknown market: ${input.marketSymbol}`);

    const priceCheck = validateAmount(input.price, market.tick_precision);
    if (!priceCheck.ok) throw new Error(`Invalid price (${priceCheck.reason})`);
    const amountCheck = validateAmount(input.amount, market.quantity_precision);
    if (!amountCheck.ok)
      throw new Error(`Invalid amount (${amountCheck.reason})`);

    const sera = this.publicSera(user.network);
    const serverTime = await sera.getSystemTime();
    const orderId = crypto.randomUUID();
    const uuidInt = encodeUuidInt(orderId).toString();

    const previewBody = {
      owner_address: user.walletAddress,
      side: input.side,
      amount: input.amount,
      price: input.price,
      order_type: "limit" as const,
      from_address:
        input.side === "bid" ? market.quote_address : market.base_address,
      to_address:
        input.side === "bid" ? market.base_address : market.quote_address,
      order_id: orderId,
      uuid_int: uuidInt,
      expiration: serverTime + ORDER_EXPIRATION_SEC,
    };
    const previewTypedData = await sera.previewOrder(previewBody);

    const payload: OrderActionPayload = {
      orderId,
      uuidInt,
      submitBody: previewBody,
      previewTypedData,
      market: market.symbol,
      side: input.side,
      price: input.price,
      amount: input.amount,
      baseSymbol: market.base_symbol,
      quoteSymbol: market.quote_symbol,
    };
    const actionId = await this.pendingActions.create({
      telegramUserId: user.telegramUserId,
      network: user.network,
      kind: "limit_order",
      payload,
      expiresAt: Date.now() + 2 * 60_000,
    });
    return {
      actionId,
      market: market.symbol,
      side: input.side,
      price: input.price,
      amount: input.amount,
      baseSymbol: market.base_symbol,
      quoteSymbol: market.quote_symbol,
    };
  }

  async executeOrder(
    user: UserRow,
    payload: OrderActionPayload,
  ): Promise<{ orderId: string }> {
    // The preview response carries only the message (eip712_order) and types
    // (eip712_types); the domain comes from GET /config. Both are signed
    // verbatim — never rebuilt client-side. Shape verified live 2026-07-10.
    const preview = payload.previewTypedData as {
      eip712_order?: Record<string, unknown>;
      eip712_types?: Record<string, unknown>;
      normalized_amount?: string;
      normalized_price?: string;
    };
    if (!preview.eip712_order || !preview.eip712_types) {
      throw new Error("Preview response missing eip712_order/eip712_types");
    }
    const sera = this.publicSera(user.network);
    const config = await sera.getConfig();
    const signature = await this.signer.signTypedData(user.walletId, {
      domain: config.eip712_domain as unknown as Record<string, unknown>,
      types: preview.eip712_types,
      primaryType: "Order",
      message: preview.eip712_order,
    } satisfies SeraTypedDataPayload);
    // Retries reuse the same order_id — the server dedupes. The server also
    // requires the canonicalized amount/price echoed from the preview
    // (raw input like "8.800000" is rejected with INVALID_DECIMAL_FORMAT).
    const res = await sera.submitOrder({
      ...(payload.submitBody as unknown as OrderPreviewRequest),
      ...(preview.normalized_amount !== undefined && {
        amount: preview.normalized_amount,
      }),
      ...(preview.normalized_price !== undefined && {
        price: preview.normalized_price,
      }),
      signature,
    });
    await this.orders.save({
      orderId: res.order_id,
      uuidInt: payload.uuidInt,
      telegramUserId: user.telegramUserId,
      network: user.network,
      market: payload.market,
      side: payload.side,
      price: payload.price,
      amount: payload.amount,
      status: "pending",
      placedAt: Date.now(),
    });
    return { orderId: res.order_id };
  }

  async listOrders(user: UserRow): Promise<OrderRow[]> {
    return this.orders.listActive(user.telegramUserId, user.network);
  }

  /** Refresh a single order's status from the API into the DB. */
  async refreshOrderStatus(
    user: UserRow,
    orderId: string,
  ): Promise<OrderRow | null> {
    const local = await this.orders.find(orderId);
    if (!local || local.telegramUserId !== user.telegramUserId) return null;
    try {
      const sera = await this.authedSera(user);
      const remote = await sera.getOrder(orderId);
      if (remote.status && remote.status !== local.status) {
        await this.orders.updateStatus(orderId, remote.status);
        return { ...local, status: remote.status };
      }
    } catch (err) {
      if (!(err instanceof SeraApiError)) throw err;
      // keep local status when the API read fails
    }
    return local;
  }

  /** Minutes remaining before cancellation is allowed, 0 if allowed now. */
  cooldownMinutesLeft(order: OrderRow): number {
    const elapsed = Date.now() - order.placedAt;
    if (elapsed >= CANCEL_COOLDOWN_MS) return 0;
    return Math.ceil((CANCEL_COOLDOWN_MS - elapsed) / 60_000);
  }

  async prepareCancel(
    user: UserRow,
    orderId: string,
  ): Promise<
    | { status: "ok"; actionId: string; market: string; price: string }
    | { status: "cooldown"; minutesLeft: number }
    | { status: "not_found" }
  > {
    const order = await this.orders.find(orderId);
    if (!order || order.telegramUserId !== user.telegramUserId) {
      return { status: "not_found" };
    }
    const minutesLeft = this.cooldownMinutesLeft(order);
    if (minutesLeft > 0) return { status: "cooldown", minutesLeft };

    const payload: CancelActionPayload = {
      orderId: order.orderId,
      uuidInt: order.uuidInt,
      market: order.market,
      price: order.price,
    };
    const actionId = await this.pendingActions.create({
      telegramUserId: user.telegramUserId,
      network: user.network,
      kind: "cancel_order",
      payload,
      expiresAt: Date.now() + 5 * 60_000,
    });
    return { status: "ok", actionId, market: order.market, price: order.price };
  }

  /**
   * Execute a confirmed cancellation. CancelOrder struct fields follow the
   * API reference ({owner_address, order_id, uuid_int} request); the EIP-712
   * layout must be confirmed against the live API during E2E (Phase 5).
   */
  async executeCancel(
    user: UserRow,
    payload: CancelActionPayload,
  ): Promise<{ status: "ok" } | { status: "cooldown" }> {
    const sera = this.publicSera(user.network);
    const config = await sera.getConfig();
    const signature = await this.signer.signTypedData(user.walletId, {
      domain: config.eip712_domain as unknown as Record<string, unknown>,
      types: {
        CancelOrder: [
          { name: "owner", type: "address" },
          { name: "uuid", type: "uint256" },
        ],
      },
      primaryType: "CancelOrder",
      message: { owner: user.walletAddress, uuid: payload.uuidInt },
    });
    try {
      await sera.cancelOrder({
        owner_address: user.walletAddress,
        order_id: payload.orderId,
        uuid_int: payload.uuidInt,
        signature,
      });
    } catch (err) {
      if (err instanceof SeraApiError && err.isRateLimited) {
        return { status: "cooldown" };
      }
      throw err;
    }
    await this.orders.updateStatus(payload.orderId, "cancelled");
    return { status: "ok" };
  }
}
