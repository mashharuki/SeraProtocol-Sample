import { createPublicClient, formatEther, http } from "viem";
import type { AppConfig, Network } from "../config";
import type { UserRow } from "../db/repositories";
import type { SeraClient } from "../sera/client";
import { fromRawUnits } from "../sera/precision";
import type { RateService } from "./rate-service";

export interface TokenBalanceView {
  symbol: string;
  wallet: string;
  vaultAvailable: string;
  vaultFrozen: string;
  isZero: boolean;
}

export interface AccountSummary {
  address: string;
  eth: string;
  tokens: TokenBalanceView[];
}

export class AccountService {
  constructor(
    private config: AppConfig,
    private rateService: RateService,
    private authedSera: (user: UserRow) => Promise<SeraClient>,
  ) {}

  async getEthBalance(network: Network, address: string): Promise<string> {
    const client = createPublicClient({
      transport: http(this.config.networks[network].rpcUrl),
    });
    const wei = await client.getBalance({ address: address as `0x${string}` });
    return formatEther(wei);
  }

  async getSummary(user: UserRow): Promise<AccountSummary> {
    const sera = await this.authedSera(user);
    const [eth, balances, tokens] = await Promise.all([
      this.getEthBalance(user.network, user.walletAddress),
      sera.getBalances(user.walletAddress),
      this.rateService.getTokens(user.network),
    ]);

    const decimalsBySymbol = new Map(
      tokens.map((t) => [t.symbol.toLowerCase(), t.decimals]),
    );
    const decimalsByAddress = new Map(
      tokens.map((t) => [t.address.toLowerCase(), t.decimals]),
    );
    const symbolByAddress = new Map(
      tokens.map((t) => [t.address.toLowerCase(), t.symbol]),
    );

    const views: TokenBalanceView[] = [];
    for (const [key, entry] of Object.entries(balances)) {
      const lower = key.toLowerCase();
      const decimals =
        decimalsBySymbol.get(lower) ?? decimalsByAddress.get(lower) ?? 6;
      const symbol = symbolByAddress.get(lower) ?? key;
      const wallet = fromRawUnits(entry.wallet_balance, decimals);
      const vaultAvailable = fromRawUnits(entry.vault_available, decimals);
      const vaultFrozen = fromRawUnits(entry.vault_frozen, decimals);
      views.push({
        symbol,
        wallet,
        vaultAvailable,
        vaultFrozen,
        isZero: wallet === "0" && vaultAvailable === "0" && vaultFrozen === "0",
      });
    }
    views.sort((a, b) => a.symbol.localeCompare(b.symbol));
    return { address: user.walletAddress, eth, tokens: views };
  }
}
