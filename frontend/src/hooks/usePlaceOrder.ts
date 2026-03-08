import { useState } from "react";
import { Contract } from "ethers";
import { ROUTER_ADDRESS } from "../config/constants";
import { ROUTER_ABI } from "../config/abis";
import { useWallet } from "./useWallet";

interface PlaceOrderParams {
  marketAddress: string;
  priceIndex: number;
  rawAmount: bigint;
  isBid: boolean;
  postOnly: boolean;
}

export function usePlaceOrder() {
  const { signer, address } = useWallet();
  const [isPlacing, setIsPlacing] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function placeOrder(params: PlaceOrderParams) {
    if (!signer || !address) {
      setError("Wallet not connected");
      return;
    }

    setIsPlacing(true);
    setError(null);
    setTxHash(null);

    try {
      const router = new Contract(ROUTER_ADDRESS, ROUTER_ABI, signer);
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 600); // 10 min

      const orderParams = [
        params.marketAddress,
        deadline,
        0n,
        address,
        params.priceIndex,
        params.rawAmount,
        params.postOnly,
        false,
        0n,
      ];

      const fn = params.isBid ? "limitBid" : "limitAsk";
      const tx = await router[fn](orderParams);
      setTxHash(tx.hash);

      await tx.wait();
      return tx.hash;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Transaction failed";
      if (message.includes("user rejected")) {
        setError("Transaction rejected by user");
      } else {
        setError(message);
      }
    } finally {
      setIsPlacing(false);
    }
  }

  return { placeOrder, isPlacing, txHash, error, clearError: () => setError(null) };
}
