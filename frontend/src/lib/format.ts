/**
 * Convert raw price (18-decimal fixed point) to human-readable
 * Sera prices are stored as 18-decimal integers
 */
export function formatPrice(rawPrice: string): string {
  const price = BigInt(rawPrice);
  const decimals = 18n;
  const whole = price / 10n ** decimals;
  const fraction = price % 10n ** decimals;
  const fractionStr = fraction.toString().padStart(Number(decimals), "0").slice(0, 4);
  return `${whole}.${fractionStr}`;
}

/**
 * Convert raw amount using quoteUnit
 */
export function formatAmount(rawAmount: string, quoteUnit: string): string {
  const amount = Number(rawAmount) / Number(quoteUnit);
  return amount.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  });
}

/**
 * Convert token amount with decimals
 */
export function formatTokenAmount(
  rawAmount: string | bigint,
  decimals: number,
): string {
  const value = typeof rawAmount === "bigint" ? rawAmount : BigInt(rawAmount);
  const divisor = 10n ** BigInt(decimals);
  const whole = value / divisor;
  const fraction = value % divisor;
  const fractionStr = fraction
    .toString()
    .padStart(decimals, "0")
    .slice(0, 4)
    .replace(/0+$/, "");
  return fractionStr ? `${whole}.${fractionStr}` : whole.toString();
}

/**
 * Truncate address for display
 */
export function truncateAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
