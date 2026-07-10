import { createPublicClient, encodeFunctionData, http, parseAbi } from "viem";
import { sepolia } from "viem/chains";
import type { AppConfig } from "../config";
import type { UserRow } from "../db/repositories";
import type { PrivySigner } from "../privy/signer";
import type { AccountService } from "./account-service";
import type { PendingActionService } from "./pending-actions";
import { makeWaitForTx, type WaitForTx } from "./tx-wait";

/**
 * Sera Sepolia test-token faucet. Contract + ABI recovered from the
 * official webapp (app.testnet.sera.cx) bundle and verified on-chain
 * 2026-07-09: claim() mints the whole registry token set to msg.sender
 * (one-time per wallet; distribution is processed in batches, so tokens
 * can arrive a little after the claim tx confirms).
 */
const FAUCET_ADDRESS = "0x4FAc3BB8B77547E2Da7ed903baDBeD2f46cBe65a" as const;

const faucetAbi = parseAbi([
  "function claim()",
  "function getUserStatus(address user) view returns (bool claimed, bool pending)",
]);

export type FaucetPrepared =
  | { status: "ok"; actionId: string; ethBalance: string }
  | { status: "wrong_network" }
  | { status: "no_gas"; ethBalance: string }
  | { status: "already_claimed" }
  | { status: "pending" };

export class FaucetService {
  constructor(
    private config: AppConfig,
    private accountService: AccountService,
    private pendingActions: PendingActionService,
    private signer: PrivySigner,
    private waitForTx: WaitForTx = makeWaitForTx(config),
  ) {}

  private client() {
    return createPublicClient({
      chain: sepolia,
      transport: http(this.config.networks.sepolia.rpcUrl),
    });
  }

  async prepareClaim(user: UserRow): Promise<FaucetPrepared> {
    if (user.network !== "sepolia") return { status: "wrong_network" };
    const [claimed, pending] = await this.client().readContract({
      address: FAUCET_ADDRESS,
      abi: faucetAbi,
      functionName: "getUserStatus",
      args: [user.walletAddress as `0x${string}`],
    });
    if (pending) return { status: "pending" };
    if (claimed) return { status: "already_claimed" };

    const ethBalance = await this.accountService.getEthBalance(
      "sepolia",
      user.walletAddress,
    );
    if (Number(ethBalance) <= 0) return { status: "no_gas", ethBalance };

    const actionId = await this.pendingActions.create({
      telegramUserId: user.telegramUserId,
      network: "sepolia",
      kind: "faucet_claim",
      payload: {},
      expiresAt: Date.now() + 10 * 60_000,
    });
    return { status: "ok", actionId, ethBalance };
  }

  /** Build, sign (Privy) and broadcast the claim() tx; wait for inclusion. */
  async executeClaim(
    user: UserRow,
  ): Promise<{ txHash: string; txUrl: string }> {
    const client = this.client();
    const address = user.walletAddress as `0x${string}`;
    const data = encodeFunctionData({ abi: faucetAbi, functionName: "claim" });

    const [nonce, gas, fees] = await Promise.all([
      client.getTransactionCount({ address }),
      client.estimateGas({ account: address, to: FAUCET_ADDRESS, data }),
      client.estimateFeesPerGas(),
    ]);

    const signed = await this.signer.signTransaction(user.walletId, {
      to: FAUCET_ADDRESS,
      data,
      value: 0,
      nonce,
      chain_id: this.config.networks.sepolia.chainId,
      type: 2,
      gas_limit: `0x${((gas * 12n) / 10n).toString(16)}`,
      max_fee_per_gas: `0x${fees.maxFeePerGas.toString(16)}`,
      max_priority_fee_per_gas: `0x${fees.maxPriorityFeePerGas.toString(16)}`,
    });

    const txHash = await client.sendRawTransaction({
      serializedTransaction: signed as `0x${string}`,
    });
    await this.waitForTx("sepolia", txHash);
    const explorer = this.config.networks.sepolia.explorerBaseUrl;
    return { txHash, txUrl: `${explorer}/tx/${txHash}` };
  }
}
