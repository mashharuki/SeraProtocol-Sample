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

function extractIntentMessage(routeParams: Record<string, unknown>) {
  const message = routeParams.message;
  return (
    typeof message === "object" && message !== null ? message : {}
  ) as Record<string, unknown>;
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
    const intent = extractIntentMessage(quote.route_params);
    const minOutputRaw = String(intent.minOutputAmount ?? "0");
    const minOutput = formatDisplayAmount(
      fromRawUnits(minOutputRaw, meta.toDecimals),
    );
    const expiresAtMs = normalizeExpiry(quote.expires_at);

    const payload: SwapActionPayload = {
      uuid: quote.uuid,
      routeParams: quote.route_params,
      fromSymbol: meta.fromSymbol,
      toSymbol: meta.toSymbol,
      fromAmount: meta.fromAmount,
      minOutput,
      toDecimals: meta.toDecimals,
      recipient: meta.recipient,
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
   * Execute a confirmed swap: sign route_params verbatim, submit.
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
    const signature = await this.signer.signTypedData(
      user.walletId,
      payload.routeParams as unknown as SeraTypedDataPayload,
    );
    const sera = this.publicSera(user.network);
    try {
      await sera.submitSwap({ uuid: payload.uuid, signature });
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
