import { MAJOR_SYMBOLS, type Network } from "../config";
import type { SeraClient } from "../sera/client";
import type { SeraFxRate, SeraMarket, SeraToken } from "../sera/types";

export interface LiquidityProbe {
  /** Directed pairs that returned a live swap quote, e.g. ["XIDR","USDT"]. */
  pairs: [from: string, to: string][];
  /** How many directed pairs were checked. */
  checked: number;
}

/** Quotes don't check balances, so any fixed address works as the owner. */
const PROBE_OWNER = "0x1111111111111111111111111111111111111111";

export class RateService {
  private marketCache = new Map<Network, { value: SeraMarket[]; at: number }>();
  private tokenCache = new Map<Network, { value: SeraToken[]; at: number }>();
  private liquidityCache = new Map<
    Network,
    { value: LiquidityProbe; at: number }
  >();
  private static TTL_MS = 60_000;
  private static LIQUIDITY_TTL_MS = 30_000;

  constructor(private publicSera: (network: Network) => SeraClient) {}

  async getMarkets(network: Network): Promise<SeraMarket[]> {
    const cached = this.marketCache.get(network);
    if (cached && Date.now() - cached.at < RateService.TTL_MS)
      return cached.value;
    const value = await this.publicSera(network).getMarkets();
    this.marketCache.set(network, { value, at: Date.now() });
    return value;
  }

  async getTokens(network: Network): Promise<SeraToken[]> {
    const cached = this.tokenCache.get(network);
    if (cached && Date.now() - cached.at < RateService.TTL_MS)
      return cached.value;
    const value = await this.publicSera(network).getTokens();
    this.tokenCache.set(network, { value, at: Date.now() });
    return value;
  }

  async findToken(network: Network, symbol: string): Promise<SeraToken | null> {
    const tokens = await this.getTokens(network);
    return (
      tokens.find((t) => t.symbol.toLowerCase() === symbol.toLowerCase()) ??
      null
    );
  }

  async findMarket(
    network: Network,
    symbol: string,
  ): Promise<SeraMarket | null> {
    const markets = await this.getMarkets(network);
    return (
      markets.find((m) => m.symbol.toLowerCase() === symbol.toLowerCase()) ??
      null
    );
  }

  async getFxRate(
    network: Network,
    base: string,
    quote: string,
  ): Promise<SeraFxRate> {
    return this.publicSera(network).getFxRate(base, quote);
  }

  /**
   * Which major pairs can actually be swapped right now? Sera has no
   * orderbook/depth endpoint (probed 2026-07-10), so the only reliable
   * signal is asking /swap/quote for each directed pair at a minimal
   * amount. Quotes are read-only and run concurrently; the result is
   * cached briefly because a full probe fires ~56 requests.
   */
  async probeLiquidity(network: Network): Promise<LiquidityProbe> {
    const cached = this.liquidityCache.get(network);
    if (cached && Date.now() - cached.at < RateService.LIQUIDITY_TTL_MS) {
      return cached.value;
    }

    const tokens = await this.getTokens(network);
    const majors = tokens.filter((t) => MAJOR_SYMBOLS.has(t.symbol));
    const sera = this.publicSera(network);
    const serverTime = await sera.getSystemTime();

    const checks: Promise<[string, string] | null>[] = [];
    for (const from of majors) {
      for (const to of majors) {
        if (from.symbol === to.symbol) continue;
        // Probe with max(2× the token's minimum trade size, 1 whole unit).
        const minRaw = BigInt(from.min_trade_amount_raw ?? "0");
        const oneUnit = 10n ** BigInt(from.decimals);
        const amount = minRaw * 2n > oneUnit ? minRaw * 2n : oneUnit;
        checks.push(
          sera
            .swapQuote({
              from_token: from.address,
              to_token: to.address,
              from_amount: amount.toString(),
              owner_address: PROBE_OWNER,
              recipient: PROBE_OWNER,
              expiration: serverTime + 300,
              gas_mode: "receive_less",
            })
            .then(
              (): [string, string] => [from.symbol, to.symbol],
              () => null,
            ),
        );
      }
    }
    const results = await Promise.all(checks);
    const value: LiquidityProbe = {
      pairs: results.filter((r): r is [string, string] => r !== null),
      checked: checks.length,
    };
    this.liquidityCache.set(network, { value, at: Date.now() });
    return value;
  }
}
