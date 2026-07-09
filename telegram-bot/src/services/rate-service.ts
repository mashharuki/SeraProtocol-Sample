import type { Network } from "../config";
import type { SeraClient } from "../sera/client";
import type { SeraFxRate, SeraMarket, SeraToken } from "../sera/types";

export class RateService {
  private marketCache = new Map<Network, { value: SeraMarket[]; at: number }>();
  private tokenCache = new Map<Network, { value: SeraToken[]; at: number }>();
  private static TTL_MS = 60_000;

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
}
