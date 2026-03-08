import { useState } from "react";
import { Contract } from "ethers";
import { ROUTER_ADDRESS } from "../config/constants";
import { ROUTER_ABI } from "../config/abis";
import { useWallet } from "./useWallet";

interface ClaimParams {
  marketAddress: string;
  isBid: boolean;
  priceIndex: number;
  orderIndex: bigint;
}

export function useClaim() {
  const { signer } = useWallet();
  const [isClaiming, setIsClaiming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function claim(params: ClaimParams) {
    if (!signer) {
      setError("Wallet not connected");
      return;
    }

    setIsClaiming(true);
    setError(null);

    try {
      const router = new Contract(ROUTER_ADDRESS, ROUTER_ABI, signer);
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 600);

      const claimParams = [
        {
          market: params.marketAddress,
          orderKeys: [
            {
              isBid: params.isBid,
              priceIndex: params.priceIndex,
              orderIndex: params.orderIndex,
            },
          ],
        },
      ];

      const tx = await router.claim(deadline, claimParams);
      await tx.wait();
      return tx.hash;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Claim failed";
      if (message.includes("user rejected")) {
        setError("Claim rejected by user");
      } else {
        setError(message);
      }
    } finally {
      setIsClaiming(false);
    }
  }

  return { claim, isClaiming, error, clearError: () => setError(null) };
}
