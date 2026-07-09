/** Escape dynamic values for Telegram parse_mode: "HTML". */
export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function shortAddress(address: string): string {
  return address.length > 12
    ? `${address.slice(0, 6)}…${address.slice(-4)}`
    : address;
}

/** Trim an ETH balance for display (4 decimals is plenty for gas info). */
export function formatEth(eth: string): string {
  const num = Number(eth);
  if (Number.isNaN(num)) return eth;
  return num === 0 ? "0" : num.toFixed(4).replace(/\.?0+$/, "");
}
