export function formatPrice(rawPrice: string): string {
  const price = BigInt(rawPrice);
  const decimals = 18n;
  const whole = price / 10n ** decimals;
  const fraction = price % 10n ** decimals;
  const fractionStr = fraction
    .toString()
    .padStart(Number(decimals), "0")
    .slice(0, 4);
  return `${whole}.${fractionStr}`;
}

export function formatAmount(rawAmount: string, quoteUnit: string): string {
  const amount = Number(rawAmount) / Number(quoteUnit);
  return amount.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  });
}

export function formatTokenAmount(rawAmount: bigint, decimals: number): string {
  const divisor = 10n ** BigInt(decimals);
  const whole = rawAmount / divisor;
  const fraction = rawAmount % divisor;
  const fractionStr = fraction
    .toString()
    .padStart(decimals, "0")
    .slice(0, 4)
    .replace(/0+$/, "");
  return fractionStr ? `${whole}.${fractionStr}` : whole.toString();
}

export function truncateAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
