import { useState, useEffect, useCallback } from "react";
import { Contract } from "ethers";
import { ERC20_ABI } from "../config/abis";
import { useWallet } from "./useWallet";

interface TokenBalanceResult {
  balance: bigint;
  loading: boolean;
  refetch: () => Promise<void>;
}

export function useTokenBalance(tokenAddress: string | null): TokenBalanceResult {
  const { provider, address } = useWallet();
  const [balance, setBalance] = useState<bigint>(0n);
  const [loading, setLoading] = useState(false);

  const fetchBalance = useCallback(async () => {
    if (!provider || !address || !tokenAddress) {
      setBalance(0n);
      return;
    }
    setLoading(true);
    try {
      const token = new Contract(tokenAddress, ERC20_ABI, provider);
      const result = await token.balanceOf(address);
      setBalance(BigInt(result));
    } catch {
      setBalance(0n);
    } finally {
      setLoading(false);
    }
  }, [provider, address, tokenAddress]);

  useEffect(() => {
    fetchBalance();
    const interval = setInterval(fetchBalance, 15_000);
    return () => clearInterval(interval);
  }, [fetchBalance]);

  return { balance, loading, refetch: fetchBalance };
}
