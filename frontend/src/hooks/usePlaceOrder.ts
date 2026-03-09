import { Contract } from "ethers";
import { useState } from "react";
import { ERC20_ABI, ROUTER_ABI } from "../config/abis";
import { ROUTER_ADDRESS } from "../config/constants";
import { useWallet } from "./useWallet";

const UINT16_MAX = 65535;
const UINT64_MAX = 18446744073709551615n;

interface PlaceOrderParams {
  marketAddress: string;
  priceIndex: number;
  rawAmount: bigint;
  isBid: boolean;
  postOnly: boolean;
  bestBidIndex?: string;
  bestAskIndex?: string;
  /** Token address to check balance (quote token for bid, base token for ask) */
  tokenAddress?: string;
  tokenSymbol?: string;
  tokenDecimals?: number;
}

function resolvePostOnlyPriceIndex(params: PlaceOrderParams): number {
  if (!params.postOnly) return params.priceIndex;

  let resolved = params.priceIndex;
  const bestBid = params.bestBidIndex ? Number.parseInt(params.bestBidIndex, 10) : undefined;
  const bestAsk = params.bestAskIndex ? Number.parseInt(params.bestAskIndex, 10) : undefined;

  if (params.isBid && Number.isInteger(bestAsk) && resolved >= (bestAsk as number)) {
    resolved = (bestAsk as number) - 1;
  }

  if (!params.isBid && Number.isInteger(bestBid) && resolved <= (bestBid as number)) {
    resolved = (bestBid as number) + 1;
  }

  return resolved;
}

/** Extract a human-readable error from ethers / RPC errors */
function parseContractError(err: unknown): string {
  if (!(err instanceof Error)) return "Transaction failed";

  const msg = err.message;

  // User rejection
  if (msg.includes("user rejected") || msg.includes("ACTION_REJECTED")) {
    return "Transaction rejected by user";
  }

  // Try to extract revert reason from nested error data
  const errObj = err as unknown as Record<string, unknown>;
  const data =
    (errObj.data as string) ??
    ((errObj.info as Record<string, unknown>)?.error as Record<string, unknown>)
      ?.data;

  if (typeof data === "string" && data !== "0x" && data.length > 2) {
    // Try decoding as Error(string)
    try {
      const hexStr = data.startsWith("0x") ? data.slice(2) : data;
      // Error(string) selector = 08c379a2
      if (hexStr.startsWith("08c379a2") && hexStr.length > 8 + 128) {
        const lengthHex = hexStr.slice(8 + 64, 8 + 128);
        const strLen = parseInt(lengthHex, 16);
        const strHex = hexStr.slice(8 + 128, 8 + 128 + strLen * 2);
        const decoded = decodeURIComponent(
          strHex.replace(/../g, "%$&"),
        );
        return `Contract error: ${decoded}`;
      }
    } catch {
      // fall through
    }
    return `Contract reverted (data: ${data.slice(0, 42)}...)`;
  }

  // execution reverted with no data
  if (msg.includes("execution reverted")) {
    return "Transaction reverted by the contract. Possible causes: insufficient token balance, invalid price index, or order parameters out of range.";
  }

  // Insufficient funds for gas
  if (msg.includes("insufficient funds")) {
    return "Insufficient ETH for gas fees";
  }

  // Nonce issues
  if (msg.includes("nonce")) {
    return "Nonce error — please reset your wallet's pending transactions";
  }

  // Truncate overly long messages
  if (msg.length > 200) {
    return msg.slice(0, 200) + "...";
  }

  return msg;
}

export function usePlaceOrder() {
  const { signer, address, provider } = useWallet();
  const [isPlacing, setIsPlacing] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function placeOrder(params: PlaceOrderParams) {
    if (!signer || !address) {
      setError("Wallet not connected");
      return;
    }

    const resolvedPriceIndex = resolvePostOnlyPriceIndex(params);

    // --- Pre-flight validation ---
    if (resolvedPriceIndex < 0 || resolvedPriceIndex > UINT16_MAX) {
      setError(
        `Price index must be between 0 and ${UINT16_MAX} (uint16). Got: ${resolvedPriceIndex}`,
      );
      return;
    }

    if (!Number.isInteger(resolvedPriceIndex)) {
      setError(`Price index must be an integer. Got: ${resolvedPriceIndex}`);
      return;
    }

    if (params.rawAmount <= 0n) {
      setError("Amount must be greater than 0");
      return;
    }

    if (params.rawAmount > UINT64_MAX) {
      setError(
        `Amount exceeds maximum (uint64). Raw amount: ${params.rawAmount}`,
      );
      return;
    }

    // Check token balance if token info provided
    if (provider && params.tokenAddress) {
      try {
        const token = new Contract(params.tokenAddress, ERC20_ABI, provider);
        const balance: bigint = await token.balanceOf(address);
        if (balance < params.rawAmount) {
          const symbol = params.tokenSymbol ?? "tokens";
          const decimals = params.tokenDecimals ?? 18;
          const balHuman = Number(balance) / 10 ** decimals;
          const reqHuman = Number(params.rawAmount) / 10 ** decimals;
          setError(
            `Insufficient ${symbol} balance. Have: ${balHuman.toFixed(4)}, Need: ${reqHuman.toFixed(4)}`,
          );
          return;
        }
      } catch {
        // Balance check is best-effort; continue to send the tx
      }
    }

    setIsPlacing(true);
    setError(null);
    setTxHash(null);

    try {
      const router = new Contract(ROUTER_ADDRESS, ROUTER_ABI, signer);
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 600); // 10 min

      const orderParams = {
        market: params.marketAddress,
        deadline,
        claimBounty: 0,
        user: address,
        priceIndex: resolvedPriceIndex,
        rawAmount: params.rawAmount,
        postOnly: params.postOnly,
        useNative: false,
        baseAmount: 0n,
      };

      const fn = params.isBid ? "limitBid" : "limitAsk";
      const tx = await router[fn](orderParams);
      setTxHash(tx.hash);

      await tx.wait();
      return tx.hash;
    } catch (err) {
      setError(parseContractError(err));
    } finally {
      setIsPlacing(false);
    }
  }

  return {
    placeOrder,
    isPlacing,
    txHash,
    error,
    clearError: () => setError(null),
  };
}
