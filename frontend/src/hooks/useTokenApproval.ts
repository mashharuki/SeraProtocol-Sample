import { useState, useEffect, useCallback } from "react";
import { Contract, MaxUint256 } from "ethers";
import { ERC20_ABI } from "../config/abis";
import { ROUTER_ADDRESS } from "../config/constants";
import { useWallet } from "./useWallet";

export function useTokenApproval(tokenAddress: string | null) {
  const { signer, address, provider } = useWallet();
  const [allowance, setAllowance] = useState<bigint>(0n);
  const [isApproving, setIsApproving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkAllowance = useCallback(async () => {
    if (!provider || !address || !tokenAddress) return;
    try {
      const token = new Contract(tokenAddress, ERC20_ABI, provider);
      const result = await token.allowance(address, ROUTER_ADDRESS);
      setAllowance(BigInt(result));
    } catch {
      // silently fail — allowance check is non-critical
    }
  }, [provider, address, tokenAddress]);

  useEffect(() => {
    checkAllowance();
  }, [checkAllowance]);

  async function approve() {
    if (!signer || !tokenAddress) return;
    setIsApproving(true);
    setError(null);
    try {
      const token = new Contract(tokenAddress, ERC20_ABI, signer);
      const tx = await token.approve(ROUTER_ADDRESS, MaxUint256);
      await tx.wait();
      await checkAllowance();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Approval failed";
      if (message.includes("user rejected")) {
        setError("Approval rejected by user");
      } else {
        setError(message);
      }
    } finally {
      setIsApproving(false);
    }
  }

  return { allowance, isApproving, approve, error, checkAllowance };
}
