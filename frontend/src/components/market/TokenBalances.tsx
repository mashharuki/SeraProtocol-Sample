import type { Market } from "../../types";
import { useWallet } from "../../hooks/useWallet";
import { useTokenBalance } from "../../hooks/useTokenBalance";
import { formatTokenAmount } from "../../lib/format";

interface TokenBalancesProps {
  market: Market;
}

export function TokenBalances({ market }: TokenBalancesProps) {
  const { address } = useWallet();
  const { balance: baseBalance } = useTokenBalance(
    address ? market.baseToken.id : null,
  );
  const { balance: quoteBalance } = useTokenBalance(
    address ? market.quoteToken.id : null,
  );

  if (!address) return null;

  return (
    <div className="rounded-xl border border-surface-200 bg-white overflow-hidden">
      <div className="px-4 py-3 border-b border-surface-200">
        <h3 className="font-heading text-sm font-semibold text-sera-800">
          Balances
        </h3>
      </div>
      <div className="grid grid-cols-2 gap-px bg-surface-100">
        <div className="bg-white px-4 py-3">
          <p className="text-[10px] uppercase tracking-wider text-surface-400 mb-1">
            {market.baseToken.symbol}
          </p>
          <p className="font-mono text-sm font-medium text-sera-800">
            {formatTokenAmount(baseBalance, Number(market.baseToken.decimals))}
          </p>
          <p className="font-mono text-[10px] text-surface-300 mt-0.5 break-all">
            {market.baseToken.id}
          </p>
        </div>
        <div className="bg-white px-4 py-3">
          <p className="text-[10px] uppercase tracking-wider text-surface-400 mb-1">
            {market.quoteToken.symbol}
          </p>
          <p className="font-mono text-sm font-medium text-sera-800">
            {formatTokenAmount(quoteBalance, Number(market.quoteToken.decimals))}
          </p>
          <p className="font-mono text-[10px] text-surface-300 mt-0.5 break-all">
            {market.quoteToken.id}
          </p>
        </div>
      </div>
    </div>
  );
}
