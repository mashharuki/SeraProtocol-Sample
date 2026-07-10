import { createPublicClient, http } from "viem";
import type { AppConfig, Network } from "../config";

/** Wait until a broadcast tx is mined; throws if it reverted or timed out. */
export type WaitForTx = (network: Network, hash: string) => Promise<void>;

/**
 * Shared receipt-wait for every flow that broadcasts a transaction
 * (deposit approve+deposit, faucet claim). Success means mined AND not
 * reverted — callers must not report success on a merely-broadcast tx.
 */
export function makeWaitForTx(config: AppConfig): WaitForTx {
  return async (network, hash) => {
    const client = createPublicClient({
      transport: http(config.networks[network].rpcUrl),
    });
    const receipt = await client.waitForTransactionReceipt({
      hash: hash as `0x${string}`,
      timeout: 120_000,
    });
    if (receipt.status !== "success") {
      throw new Error(`Transaction reverted on-chain: ${hash}`);
    }
  };
}
