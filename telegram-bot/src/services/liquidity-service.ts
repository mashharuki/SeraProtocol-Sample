import { MAJOR_SYMBOLS, type Network } from "../config";
import type { OrderRepository, UserRow } from "../db/repositories";
import type { PrivySigner } from "../privy/signer";
import type { SeraClient } from "../sera/client";
import { SeraApiError } from "../sera/errors";
import { fromRawUnits, toRawUnits, validateAmount } from "../sera/precision";
import type { OrderSubmitRequest, SeraMarket } from "../sera/types";
import { encodeUuidInt, uuidToBigInt } from "../sera/uuid-int";
import type { OrderService } from "./order-service";
import type { PendingActionService } from "./pending-actions";
import type { RateService } from "./rate-service";

/** One leg of a planned VL batch (all values human units). */
export interface ProvideLeg {
  marketSymbol: string;
  side: "bid" | "ask";
  price: string;
  amount: string;
  baseSymbol: string;
  quoteSymbol: string;
}

export interface ProvideActionPayload {
  spendSymbol: string;
  budgetHuman: string;
  legs: ProvideLeg[];
}

export type ProvidePlan =
  | { status: "ok"; actionId: string; payload: ProvideActionPayload }
  | { status: "vault_short"; available: string; symbol: string }
  | { status: "budget_low"; minBudget: string; symbol: string }
  | { status: "no_rates" }
  | { status: "no_markets" };

/** Why a candidate market could not become a leg. */
type LegSkip =
  | { skip: "no_rate" }
  | { skip: "below_min"; requiredBudget: string };

export interface CancelBatchActionPayload {
  vlBatchId: string;
}

/** Cap legs well under limits.vl_batch.max — keeps the plan card readable. */
const MAX_LEGS = 8;

/**
 * Liquidity provision via Sera Virtual Liquidity batches: quote several
 * markets from one shared collateral budget (only the largest leg is ever
 * frozen). Recipe verified live 2026-07-10:
 *  1. preview each leg with the STANDALONE uuid_int (the only encoding
 *     /orders/preview accepts),
 *  2. re-sign the preview's eip712_order with ONLY the uuid field swapped
 *     to the VL encoding (shared group id, sequential leg ids),
 *  3. POST /orders/vl/batch with the VL uuid_ints + signatures.
 */
export class LiquidityService {
  constructor(
    private rateService: RateService,
    private orderService: OrderService,
    private pendingActions: PendingActionService,
    private orders: OrderRepository,
    private signer: PrivySigner,
    private publicSera: (network: Network) => SeraClient,
    private authedSera: (user: UserRow) => Promise<SeraClient>,
  ) {}

  /** Markets quotable when spending `spendSymbol`, with the active side. */
  async findEligibleMarkets(
    network: Network,
    spendSymbol: string,
  ): Promise<{ market: SeraMarket; side: "bid" | "ask" }[]> {
    const markets = await this.rateService.getMarkets(network);
    const candidates = markets.filter(
      (m) =>
        MAJOR_SYMBOLS.has(m.base_symbol) &&
        MAJOR_SYMBOLS.has(m.quote_symbol) &&
        (m.base_symbol === spendSymbol || m.quote_symbol === spendSymbol),
    );
    const checks = await Promise.all(
      candidates.map(async (market) => {
        // asks spend the base token, bids spend the quote token
        const side: "bid" | "ask" =
          market.base_symbol === spendSymbol ? "ask" : "bid";
        const active = await this.orderService.checkSideActive(
          network,
          market,
          side,
        );
        return active ? { market, side } : null;
      }),
    );
    return checks
      .filter((c): c is { market: SeraMarket; side: "bid" | "ask" } => !!c)
      .slice(0, MAX_LEGS);
  }

  /**
   * Build a VL plan: price each leg off the live FX mid rate with the given
   * spread, size every leg to the full budget (VL only freezes the largest),
   * and store it as a pending action for the confirmation card.
   */
  async prepareProvide(
    user: UserRow,
    spendSymbol: string,
    spreadBps: number,
    budgetHuman: string,
  ): Promise<ProvidePlan> {
    const sera = await this.authedSera(user);
    const balances = await sera.getBalances(user.walletAddress);
    const row = balances.find((b) => b.symbol === spendSymbol);
    const spendToken = await this.rateService.findToken(
      user.network,
      spendSymbol,
    );
    const decimals = spendToken?.decimals ?? row?.decimals ?? 6;
    const check = validateAmount(budgetHuman, decimals);
    if (!check.ok) throw new Error(`Invalid budget (${check.reason})`);
    const availableRaw = BigInt(row?.vault_available ?? "0");
    if (availableRaw < toRawUnits(budgetHuman, decimals)) {
      return {
        status: "vault_short",
        available: fromRawUnits(availableRaw, decimals),
        symbol: spendSymbol,
      };
    }

    const eligible = await this.findEligibleMarkets(user.network, spendSymbol);
    const legs: ProvideLeg[] = [];
    const skips: LegSkip[] = [];
    for (const { market, side } of eligible) {
      const leg = await this.buildLeg(
        user.network,
        market,
        side,
        spreadBps,
        budgetHuman,
      );
      if ("skip" in leg) skips.push(leg);
      else legs.push(leg);
    }
    if (legs.length < 2) {
      // Prefer the actionable diagnosis: how much budget would unlock a batch?
      const requirements = skips
        .filter(
          (s): s is { skip: "below_min"; requiredBudget: string } =>
            s.skip === "below_min",
        )
        .map((s) => s.requiredBudget)
        .sort((a, b) => Number(a) - Number(b));
      const stillNeeded = 2 - legs.length;
      if (requirements.length >= stillNeeded) {
        return {
          status: "budget_low",
          minBudget: requirements[stillNeeded - 1] as string,
          symbol: spendSymbol,
        };
      }
      if (skips.some((s) => s.skip === "no_rate")) {
        return { status: "no_rates" };
      }
      return { status: "no_markets" }; // VL minimum is 2 legs
    }

    const payload: ProvideActionPayload = {
      spendSymbol,
      budgetHuman,
      legs,
    };
    const actionId = await this.pendingActions.create({
      telegramUserId: user.telegramUserId,
      network: user.network,
      kind: "vl_batch",
      payload,
      expiresAt: Date.now() + 5 * 60_000,
    });
    return { status: "ok", actionId, payload };
  }

  /**
   * Cheapest budget that could quote ≥2 markets with `spendSymbol` — pure
   * market-data math (no probing), used as a hint in the budget prompt.
   */
  async minBudgetHint(
    network: Network,
    spendSymbol: string,
  ): Promise<string | null> {
    const markets = await this.rateService.getMarkets(network);
    const requirements = markets
      .filter(
        (m) =>
          MAJOR_SYMBOLS.has(m.base_symbol) &&
          MAJOR_SYMBOLS.has(m.quote_symbol) &&
          (m.base_symbol === spendSymbol || m.quote_symbol === spendSymbol),
      )
      .map((m) =>
        String(
          m.base_symbol === spendSymbol
            ? (m.min_ask_amount ?? "0")
            : (m.min_bid_quote_amount ?? "0"),
        ),
      )
      .sort((a, b) => Number(a) - Number(b));
    return requirements.length >= 2 ? (requirements[1] as string) : null;
  }

  /** Mid rate × spread → leg price/amount, or the reason the market was skipped. */
  private async buildLeg(
    network: Network,
    market: SeraMarket,
    side: "bid" | "ask",
    spreadBps: number,
    budgetHuman: string,
  ): Promise<ProvideLeg | LegSkip> {
    const [baseToken, quoteToken] = await Promise.all([
      this.rateService.findToken(network, market.base_symbol),
      this.rateService.findToken(network, market.quote_symbol),
    ]);
    let mid: number;
    try {
      const fx = await this.rateService.getFxRate(
        network,
        baseToken?.currency ?? market.base_symbol,
        quoteToken?.currency ?? market.quote_symbol,
      );
      mid = Number(fx.rate);
    } catch {
      return { skip: "no_rate" }; // no reference rate — skip rather than misprice
    }
    if (!Number.isFinite(mid) || mid <= 0) return { skip: "no_rate" };

    // Makers quote away from mid: asks above, bids below.
    const factor =
      side === "ask" ? 1 + spreadBps / 10_000 : 1 - spreadBps / 10_000;
    const price = (mid * factor).toFixed(market.tick_precision);
    if (Number(price) <= 0) return { skip: "no_rate" };

    // Size the leg to the whole budget (spend-token units → base units).
    const budget = Number(budgetHuman);
    const baseAmount = side === "ask" ? budget : budget / Number(price);
    const amount = baseAmount.toFixed(market.quantity_precision);

    // Respect the market minimums or the API will reject the leg.
    // The budget IS the constrained quantity on both sides (asks spend base,
    // bids spend quote), so the requirement maps 1:1 to a minimum budget.
    const minAsk = Number(market.min_ask_amount ?? 0);
    const minBidQuote = Number(market.min_bid_quote_amount ?? 0);
    if (side === "ask" && minAsk > 0 && Number(amount) < minAsk) {
      return {
        skip: "below_min",
        requiredBudget: String(market.min_ask_amount ?? "0"),
      };
    }
    if (side === "bid" && minBidQuote > 0 && budget < minBidQuote) {
      return {
        skip: "below_min",
        requiredBudget: String(market.min_bid_quote_amount ?? "0"),
      };
    }

    return {
      marketSymbol: market.symbol,
      side,
      price,
      amount,
      baseSymbol: market.base_symbol,
      quoteSymbol: market.quote_symbol,
    };
  }

  /** Sign every leg and submit the batch. Returns the vl_batch_id. */
  async executeProvide(
    user: UserRow,
    payload: ProvideActionPayload,
  ): Promise<{ vlBatchId: string; orderIds: string[]; amended: number }> {
    const sera = this.publicSera(user.network);
    const config = await sera.getConfig();
    const serverTime = await sera.getSystemTime();
    const markets = await this.rateService.getMarkets(user.network);

    const orderIds = payload.legs.map(() => crypto.randomUUID());
    // All legs share the first order's group id; leg ids are sequential.
    const groupId = uuidToBigInt(orderIds[0] as string) >> 16n;

    const orders: OrderSubmitRequest[] = [];
    for (const [i, leg] of payload.legs.entries()) {
      const market = markets.find((m) => m.symbol === leg.marketSymbol);
      if (!market) throw new Error(`Unknown market: ${leg.marketSymbol}`);
      const orderId = orderIds[i] as string;
      const vlUuid = encodeUuidInt(orderId, {
        groupId,
        legId: BigInt(i),
      }).toString();

      const previewBody = {
        owner_address: user.walletAddress,
        side: leg.side,
        amount: leg.amount,
        price: leg.price,
        order_type: "limit" as const,
        from_address:
          leg.side === "bid" ? market.quote_address : market.base_address,
        to_address:
          leg.side === "bid" ? market.base_address : market.quote_address,
        order_id: orderId,
        // preview only accepts the standalone encoding
        uuid_int: encodeUuidInt(orderId).toString(),
        expiration: serverTime + 30 * 24 * 60 * 60,
      };
      const preview = (await sera.previewOrder(previewBody)) as {
        eip712_order?: Record<string, unknown>;
        eip712_types?: Record<string, unknown>;
        normalized_amount?: string;
        normalized_price?: string;
      };
      if (!preview.eip712_order || !preview.eip712_types) {
        throw new Error("Preview response missing eip712_order/eip712_types");
      }
      const signature = await this.signer.signTypedData(user.walletId, {
        domain: config.eip712_domain as unknown as Record<string, unknown>,
        types: preview.eip712_types,
        primaryType: "Order",
        // preview message verbatim except uuid, swapped to the VL encoding
        message: { ...preview.eip712_order, uuid: vlUuid },
      });
      orders.push({
        ...previewBody,
        uuid_int: vlUuid,
        amount: preview.normalized_amount ?? leg.amount,
        price: preview.normalized_price ?? leg.price,
        signature,
      });
    }

    const result = await sera.placeVlBatch(orders);
    const vlBatchId = String(result.vl_group.primary_id);
    for (const [i, leg] of payload.legs.entries()) {
      await this.orders.save({
        orderId: result.order_ids[i] ?? (orderIds[i] as string),
        uuidInt: orders[i]?.uuid_int ?? "",
        telegramUserId: user.telegramUserId,
        network: user.network,
        market: leg.marketSymbol,
        side: leg.side,
        price: leg.price,
        amount: leg.amount,
        status: "pending",
        placedAt: Date.now(),
        vlBatchId,
      });
    }
    return {
      vlBatchId,
      orderIds: result.order_ids,
      amended: result.amendments?.length ?? 0,
    };
  }

  /**
   * Cancel a whole VL batch. CancelVLBatch struct verified live 2026-07-10
   * (from the official webapp bundle): {owner: address, vlBatchId: string}.
   */
  async cancelBatch(
    user: UserRow,
    vlBatchId: string,
  ): Promise<{ status: "ok" } | { status: "cooldown" }> {
    const sera = this.publicSera(user.network);
    const config = await sera.getConfig();
    const signature = await this.signer.signTypedData(user.walletId, {
      domain: config.eip712_domain as unknown as Record<string, unknown>,
      types: {
        CancelVLBatch: [
          { name: "owner", type: "address" },
          { name: "vlBatchId", type: "string" },
        ],
      },
      primaryType: "CancelVLBatch",
      message: { owner: user.walletAddress, vlBatchId },
    });
    try {
      await sera.cancelVlBatch({
        owner_address: user.walletAddress,
        vl_batch_id: vlBatchId,
        signature,
      });
    } catch (err) {
      if (err instanceof SeraApiError && err.isRateLimited) {
        return { status: "cooldown" };
      }
      throw err;
    }
    await this.orders.cancelBatch(vlBatchId);
    return { status: "ok" };
  }
}
