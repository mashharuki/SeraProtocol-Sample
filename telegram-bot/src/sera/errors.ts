import type { MessageKey } from "../i18n/en";

/** Typed trading error codes documented for the Sera REST API. */
export type SeraErrorCode =
  | "INSUFFICIENT_EQUITY"
  | "STP_BLOCKED"
  | "QUOTE_STALE"
  | "INTENT_DEADLINE_EXPIRED"
  | "SLIPPAGE_EXCEEDED"
  | "NO_LIQUIDITY"
  | "AMOUNT_BELOW_MIN"
  | "INVALID_PRECISION"
  | "INVALID_DECIMAL_FORMAT"
  | "ALLOWANCE_INSUFFICIENT"
  | "PAIR_INACTIVE"
  | "TRANSIENT_SETTLEMENT_FAILURE";

export class SeraApiError extends Error {
  constructor(
    readonly status: number,
    readonly errorCode: string | undefined,
    readonly detail: string,
    readonly endpoint: string,
  ) {
    super(`Sera API ${status} at ${endpoint}: ${errorCode ?? detail}`);
    this.name = "SeraApiError";
  }

  /** Quote consumed or stale — safe to re-quote and retry. */
  get isStaleQuote(): boolean {
    return (
      this.status === 409 ||
      this.status === 410 ||
      this.errorCode === "QUOTE_STALE" ||
      this.errorCode === "INTENT_DEADLINE_EXPIRED"
    );
  }

  get isRateLimited(): boolean {
    return this.status === 429;
  }
}

const codeToKey: Record<SeraErrorCode, MessageKey> = {
  INSUFFICIENT_EQUITY: "errInsufficientEquity",
  STP_BLOCKED: "errStpBlocked",
  QUOTE_STALE: "errQuoteStale",
  INTENT_DEADLINE_EXPIRED: "errDeadlineExpired",
  SLIPPAGE_EXCEEDED: "errSlippage",
  NO_LIQUIDITY: "errNoLiquidity",
  AMOUNT_BELOW_MIN: "errAmountBelowMin",
  INVALID_PRECISION: "errInvalidPrecision",
  INVALID_DECIMAL_FORMAT: "errInvalidPrecision",
  ALLOWANCE_INSUFFICIENT: "errAllowance",
  PAIR_INACTIVE: "errPairInactive",
  TRANSIENT_SETTLEMENT_FAILURE: "errTransient",
};

/** Map a Sera error to the i18n key of a beginner-friendly explanation. */
export function toUserMessageKey(err: unknown): MessageKey {
  if (err instanceof SeraApiError) {
    if (err.isRateLimited) return "errRateLimited";
    if (err.errorCode && err.errorCode in codeToKey) {
      return codeToKey[err.errorCode as SeraErrorCode];
    }
    if (err.isStaleQuote) return "errQuoteStale";
  }
  return "errorGeneric";
}
