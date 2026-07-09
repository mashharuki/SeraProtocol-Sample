/**
 * Human-amount validation and raw-unit conversion respecting Sera market
 * precision rules (rounding_mode "reject_extra_precision": too many
 * decimals is a user error, never silently rounded).
 */

export interface AmountCheck {
  ok: boolean;
  reason?: "not_a_number" | "not_positive" | "too_many_decimals";
}

/** Validate a user-typed decimal string against a max decimal count. */
export function validateAmount(
  input: string,
  maxDecimals: number,
): AmountCheck {
  const trimmed = input.trim().replace(/,/g, "");
  if (!/^\d+(\.\d+)?$/.test(trimmed))
    return { ok: false, reason: "not_a_number" };
  const [, frac = ""] = trimmed.split(".");
  if (Number(trimmed) <= 0 && !/[1-9]/.test(trimmed)) {
    return { ok: false, reason: "not_positive" };
  }
  if (frac.length > maxDecimals) {
    return { ok: false, reason: "too_many_decimals" };
  }
  return { ok: true };
}

/** "25.5" with 6 decimals → 25500000n. Throws on extra precision. */
export function toRawUnits(amount: string, decimals: number): bigint {
  const trimmed = amount.trim().replace(/,/g, "");
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new Error(`Invalid amount: ${amount}`);
  }
  const [whole, frac = ""] = trimmed.split(".");
  if (frac.length > decimals) {
    throw new Error(`Amount ${amount} exceeds ${decimals} decimal places`);
  }
  return (
    BigInt(whole) * 10n ** BigInt(decimals) +
    BigInt(frac.padEnd(decimals, "0") || "0")
  );
}

/** 25500000n with 6 decimals → "25.5" (trailing zeros trimmed). */
export function fromRawUnits(raw: bigint | string, decimals: number): string {
  const value = typeof raw === "string" ? BigInt(raw) : raw;
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const base = 10n ** BigInt(decimals);
  const whole = abs / base;
  const frac = (abs % base)
    .toString()
    .padStart(decimals, "0")
    .replace(/0+$/, "");
  const s = frac ? `${whole}.${frac}` : whole.toString();
  return negative ? `-${s}` : s;
}

/** Display helper: cap shown decimals without losing the integer part. */
export function formatDisplayAmount(
  human: string,
  maxShownDecimals = 6,
): string {
  const [whole, frac = ""] = human.split(".");
  if (!frac) return whole;
  const shown = frac.slice(0, maxShownDecimals).replace(/0+$/, "");
  return shown ? `${whole}.${shown}` : whole;
}
