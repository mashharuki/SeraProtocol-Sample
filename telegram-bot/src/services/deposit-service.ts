import type { AppConfig } from "../config";
import type { UserRow } from "../db/repositories";
import type { PrivySigner } from "../privy/signer";
import type { SeraClient } from "../sera/client";
import { toRawUnits, validateAmount } from "../sera/precision";
import type { AccountService } from "./account-service";
import type { PendingActionService } from "./pending-actions";
import type { RateService } from "./rate-service";

export interface DepositActionPayload {
  tokenSymbol: string;
  tokenAddress: string;
  amountHuman: string;
  amountRaw: string;
}

export type DepositPrepared =
  | {
      status: "ok";
      actionId: string;
      amount: string;
      symbol: string;
      ethBalance: string;
    }
  | { status: "no_gas"; ethBalance: string };

/**
 * Vault deposits (approve + deposit path). Unlike swaps, these are real
 * on-chain txs from the user's wallet and need gas ETH.
 */
export class DepositService {
  constructor(
    private config: AppConfig,
    private rateService: RateService,
    private accountService: AccountService,
    private pendingActions: PendingActionService,
    private signer: PrivySigner,
    private authedSera: (user: UserRow) => Promise<SeraClient>,
  ) {}

  async prepareDeposit(
    user: UserRow,
    tokenSymbol: string,
    amount: string,
  ): Promise<DepositPrepared> {
    const token = await this.rateService.findToken(user.network, tokenSymbol);
    if (!token) throw new Error(`Unknown token: ${tokenSymbol}`);
    const check = validateAmount(amount, token.decimals);
    if (!check.ok) throw new Error(`Invalid amount (${check.reason})`);

    const ethBalance = await this.accountService.getEthBalance(
      user.network,
      user.walletAddress,
    );
    if (Number(ethBalance) <= 0) return { status: "no_gas", ethBalance };

    const payload: DepositActionPayload = {
      tokenSymbol: token.symbol,
      tokenAddress: token.address,
      amountHuman: amount,
      amountRaw: toRawUnits(amount, token.decimals).toString(),
    };
    const actionId = await this.pendingActions.create({
      telegramUserId: user.telegramUserId,
      network: user.network,
      kind: "deposit",
      payload,
      expiresAt: Date.now() + 5 * 60_000,
    });
    return {
      status: "ok",
      actionId,
      amount,
      symbol: token.symbol,
      ethBalance,
    };
  }

  /**
   * Execute a confirmed deposit: build approve + deposit txs via the API,
   * sign each with Privy, broadcast via POST /tx/send. Returns the last
   * (deposit) tx hash for the explorer link.
   */
  async executeDeposit(
    user: UserRow,
    payload: DepositActionPayload,
  ): Promise<{ txHash: string; txUrl: string }> {
    const sera = await this.authedSera(user);
    const config = await sera.getConfig();

    const approveTx = await sera.buildApprove({
      token: payload.tokenAddress,
      owner: user.walletAddress,
      spender: config.vault_address,
      amount: payload.amountRaw,
    });
    const signedApprove = await this.signer.signTransaction(
      user.walletId,
      normalizeTxForPrivy(approveTx),
    );
    await sera.sendTx(signedApprove);

    const depositTx = await sera.buildDeposit({
      token: payload.tokenAddress,
      owner: user.walletAddress,
      amount: payload.amountRaw,
    });
    const signedDeposit = await this.signer.signTransaction(
      user.walletId,
      normalizeTxForPrivy(depositTx),
    );
    const txHash = await sera.sendTx(signedDeposit);

    const explorer = this.config.networks[user.network].explorerBaseUrl;
    return { txHash, txUrl: `${explorer}/tx/${txHash}` };
  }
}

/**
 * Sera's tx builders return web3-style camelCase fields; Privy's
 * eth_signTransaction expects snake_case. Map the known fields and pass
 * unknown ones through untouched. `type` must become a plain number
 * (Privy rejects the hex string "0x2" the builder returns).
 */
export function normalizeTxForPrivy(
  tx: Record<string, unknown>,
): Record<string, unknown> {
  const renames: Record<string, string> = {
    chainId: "chain_id",
    gasLimit: "gas_limit",
    gas: "gas_limit",
    gasPrice: "gas_price",
    maxFeePerGas: "max_fee_per_gas",
    maxPriorityFeePerGas: "max_priority_fee_per_gas",
  };
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(tx)) {
    if (v === undefined || v === null) continue;
    out[renames[k] ?? k] = v;
  }
  if (typeof out.type === "string") {
    out.type = Number(out.type); // "0x2" -> 2
  }
  return out;
}
