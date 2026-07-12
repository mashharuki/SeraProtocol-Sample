import type { Network } from "../config";
import type { UserRow } from "../db/repositories";
import type { PrivySigner, SeraTypedDataPayload } from "../privy/signer";
import type { SeraClient } from "../sera/client";
import { SeraApiError } from "../sera/errors";
import {
  formatDisplayAmount,
  fromRawUnits,
  toRawUnits,
  validateAmount,
} from "../sera/precision";
import type { SeraSwapQuote } from "../sera/types";
import type { PendingActionService } from "./pending-actions";
import type { RateService } from "./rate-service";

/** Verbatim quote payload persisted in pending_actions. */
export interface SwapActionPayload {
  uuid: string;
  routeParams: Record<string, unknown>;
  fromSymbol: string;
  toSymbol: string;
  fromAmount: string;
  minOutput: string;
  toDecimals: number;
  recipient?: string;
  /**
   * Present when the input token needs an ERC-2612 permit alongside the
   * Intent signature (e.g. JPYC, USDC, EURC). Unlike `route_params`, Sera
   * returns this fully wrapped and ready to sign verbatim — confirmed live
   * 2026-07-12 (`quote.permit.eip712 = {domain, types, primaryType, message}`).
   */
  permitEip712?: SeraTypedDataPayload;
  permitDeadline?: number;
}

export interface SwapCard {
  actionId: string;
  fromAmount: string;
  fromSymbol: string;
  toSymbol: string;
  minOutput: string;
  rate: string;
  feeSummary: string;
  expiresInSec: number;
  recipient?: string;
}

export interface PrepareSwapInput {
  fromSymbol: string;
  toSymbol: string;
  amount: string;
  /** Third-party recipient turns the swap into a cross-currency send. */
  recipient?: string;
}

function normalizeExpiry(expiresAt: string | number | undefined): number {
  if (expiresAt === undefined) return Date.now() + 30_000;
  if (typeof expiresAt === "number") {
    return expiresAt < 1e12 ? expiresAt * 1000 : expiresAt;
  }
  const asNum = Number(expiresAt);
  if (!Number.isNaN(asNum)) return normalizeExpiry(asNum);
  const parsed = Date.parse(expiresAt);
  return Number.isNaN(parsed) ? Date.now() + 30_000 : parsed;
}

/**
 * `route_params` from `/swap/quote` is the flat `Intent` struct itself
 * (taker, inputToken, outputToken, maxInputAmount, minOutputAmount,
 * recipient, initialDepositAmount, uuid, deadline) — NOT wrapped in a
 * `{domain, types, primaryType, message}` envelope like `/orders/preview`
 * returns (confirmed live 2026-07-12: a real quote response has none of
 * those wrapper keys). Passing it straight to `signTypedData` as before
 * sent `domain`/`types`/`primaryType`/`message: undefined` to Privy — the
 * actual cause of swaps failing. The domain now comes from `GET /config`
 * (invariant #5); the type layout matches `SeraLib.IntentParams` (see
 * orderbook-v2.md) since Sera doesn't return type info for swaps the way it
 * does for orders. NOTE: `POST /swap` checks wallet balance before it
 * checks the Intent signature, so a zero-balance probe wallet can't
 * round-trip-verify this exact type layout against Sera's own signature
 * check — confirm with a small real Sepolia swap after deploying.
 */
const INTENT_EIP712_TYPES: Record<string, unknown> = {
  Intent: [
    { name: "taker", type: "address" },
    { name: "inputToken", type: "address" },
    { name: "outputToken", type: "address" },
    { name: "maxInputAmount", type: "uint256" },
    { name: "minOutputAmount", type: "uint256" },
    { name: "recipient", type: "address" },
    { name: "initialDepositAmount", type: "uint256" },
    { name: "uuid", type: "uint256" },
    { name: "deadline", type: "uint48" },
  ],
};

/**
 * Some input tokens (JPYC, USDC, EURC, …) require an ERC-2612 permit
 * alongside the Intent signature — `POST /swap` 400s otherwise ("Quote
 * requires an EIP-2612 permit"). Only act when `permit_required` is set;
 * `permit.eip712` is already the full ready-to-sign payload.
 */
function extractPermit(permit: SeraSwapQuote["permit"]): {
  permitEip712?: SeraTypedDataPayload;
  permitDeadline?: number;
} {
  if (!permit || typeof permit !== "object") return {};
  const p = permit as {
    permit_required?: boolean;
    suggested_deadline?: number;
    eip712?: SeraTypedDataPayload;
  };
  if (!p.permit_required || !p.eip712) return {};
  return { permitEip712: p.eip712, permitDeadline: p.suggested_deadline };
}

export class SwapService {
  constructor(
    private rateService: RateService,
    private pendingActions: PendingActionService,
    private signer: PrivySigner,
    private publicSera: (network: Network) => SeraClient,
  ) {}

  async prepareSwap(user: UserRow, input: PrepareSwapInput): Promise<SwapCard> {
    const [fromToken, toToken] = await Promise.all([
      this.rateService.findToken(user.network, input.fromSymbol),
      this.rateService.findToken(user.network, input.toSymbol),
    ]);
    if (!fromToken) throw new Error(`Unknown token: ${input.fromSymbol}`);
    if (!toToken) throw new Error(`Unknown token: ${input.toSymbol}`);

    const check = validateAmount(input.amount, fromToken.decimals);
    if (!check.ok) throw new Error(`Invalid amount (${check.reason})`);
    const rawAmount = toRawUnits(input.amount, fromToken.decimals);

    const sera = this.publicSera(user.network);
    const serverTime = await sera.getSystemTime();
    const quote = await sera.swapQuote({
      from_token: fromToken.address,
      to_token: toToken.address,
      from_amount: rawAmount.toString(),
      owner_address: user.walletAddress,
      recipient: input.recipient ?? user.walletAddress,
      expiration: serverTime + 300,
      gas_mode: "receive_less",
    });

    return this.quoteToCard(user, quote, {
      fromSymbol: fromToken.symbol,
      toSymbol: toToken.symbol,
      fromAmount: input.amount,
      toDecimals: toToken.decimals,
      recipient: input.recipient,
    });
  }

  private async quoteToCard(
    user: UserRow,
    quote: SeraSwapQuote,
    meta: {
      fromSymbol: string;
      toSymbol: string;
      fromAmount: string;
      toDecimals: number;
      recipient?: string;
    },
  ): Promise<SwapCard> {
    const minOutputRaw = String(quote.route_params.minOutputAmount ?? "0");
    const minOutput = formatDisplayAmount(
      fromRawUnits(minOutputRaw, meta.toDecimals),
    );
    const expiresAtMs = normalizeExpiry(quote.expires_at);
    const { permitEip712, permitDeadline } = extractPermit(quote.permit);

    const payload: SwapActionPayload = {
      uuid: quote.uuid,
      routeParams: quote.route_params,
      fromSymbol: meta.fromSymbol,
      toSymbol: meta.toSymbol,
      fromAmount: meta.fromAmount,
      minOutput,
      toDecimals: meta.toDecimals,
      recipient: meta.recipient,
      permitEip712,
      permitDeadline,
    };
    const actionId = await this.pendingActions.create({
      telegramUserId: user.telegramUserId,
      network: user.network,
      kind: meta.recipient ? "send" : "swap",
      payload,
      expiresAt: expiresAtMs,
    });

    const rateNum = Number(minOutput) / Number(meta.fromAmount);
    const feeSummary = this.describeFees(quote);
    return {
      actionId,
      fromAmount: meta.fromAmount,
      fromSymbol: meta.fromSymbol,
      toSymbol: meta.toSymbol,
      minOutput,
      rate: `1 ${meta.fromSymbol} ≈ ${rateNum > 0 ? rateNum.toFixed(6) : "?"} ${meta.toSymbol}`,
      feeSummary,
      expiresInSec: Math.max(0, Math.round((expiresAtMs - Date.now()) / 1000)),
      recipient: meta.recipient,
    };
  }

  private describeFees(quote: SeraSwapQuote): string {
    const b = quote.quote_breakdown;
    if (b && typeof b.total_fee === "string") return b.total_fee;
    if (b && typeof b.fee_summary === "string") return b.fee_summary;
    return "included in rate";
  }

  /**
   * Execute a confirmed swap: sign route_params (verbatim, as the EIP-712
   * message) wrapped in the Intent domain/types, submit.
   * Returns "requoted" with a fresh card when the quote went stale.
   */
  async executeSwap(
    user: UserRow,
    payload: SwapActionPayload,
  ): Promise<
    | {
        status: "success";
        received: string;
        toSymbol: string;
        recipient?: string;
      }
    | { status: "requoted"; card: SwapCard }
  > {
    const sera = this.publicSera(user.network);
    const config = await sera.getConfig();
    const signature = await this.signer.signTypedData(user.walletId, {
      domain: config.eip712_domain as unknown as Record<string, unknown>,
      types: INTENT_EIP712_TYPES,
      primaryType: "Intent",
      message: payload.routeParams,
    } satisfies SeraTypedDataPayload);
    const permitSignature = payload.permitEip712
      ? await this.signer.signTypedData(user.walletId, payload.permitEip712)
      : undefined;
    try {
      await sera.submitSwap({
        uuid: payload.uuid,
        signature,
        ...(permitSignature !== undefined &&
        payload.permitDeadline !== undefined
          ? {
              permit_signature: permitSignature,
              permit_deadline: payload.permitDeadline,
            }
          : {}),
      });
      return {
        status: "success",
        received: payload.minOutput,
        toSymbol: payload.toSymbol,
        recipient: payload.recipient,
      };
    } catch (err) {
      if (err instanceof SeraApiError && err.isStaleQuote) {
        const card = await this.prepareSwap(user, {
          fromSymbol: payload.fromSymbol,
          toSymbol: payload.toSymbol,
          amount: payload.fromAmount,
          recipient: payload.recipient,
        });
        return { status: "requoted", card };
      }
      throw err;
    }
  }
}
