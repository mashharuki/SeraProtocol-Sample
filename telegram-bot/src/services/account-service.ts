import { createPublicClient, formatEther, http } from "viem";
import type { AppConfig, Network } from "../config";
import type { UserRow } from "../db/repositories";
import type { SeraClient } from "../sera/client";
import { fromRawUnits } from "../sera/precision";

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
    const [eth, balances] = await Promise.all([
      this.getEthBalance(user.network, user.walletAddress),
      sera.getBalances(user.walletAddress),
    ]);

    // /balances rows carry symbol + decimals directly (live shape).
    const views: TokenBalanceView[] = balances.map((row) => {
      const wallet = fromRawUnits(row.wallet_balance, row.decimals);
      const vaultAvailable = fromRawUnits(row.vault_available, row.decimals);
      const vaultFrozen = fromRawUnits(row.vault_frozen, row.decimals);
      return {
        symbol: row.symbol,
        wallet,
        vaultAvailable,
        vaultFrozen,
        isZero: wallet === "0" && vaultAvailable === "0" && vaultFrozen === "0",
      };
    });
    views.sort((a, b) => a.symbol.localeCompare(b.symbol));
    return { address: user.walletAddress, eth, tokens: views };
  }
}
