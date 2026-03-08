import type { Market } from "../../types";
import { formatPrice } from "../../lib/format";

export function MarketInfoCard({ market }: { market: Market }) {
  return (
    <div className="rounded-xl border border-surface-200 bg-white p-5">
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="font-heading text-xl font-bold text-sera-800">
          {market.baseToken.symbol}/{market.quoteToken.symbol}
        </h2>
        <span className="font-mono text-lg font-semibold tabular-nums text-sera-600">
          {formatPrice(market.latestPrice)}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
        <div>
          <dt className="text-surface-400 text-xs uppercase tracking-wider mb-0.5">
            Quote Unit
          </dt>
          <dd className="font-mono font-medium">{market.quoteUnit}</dd>
        </div>
        <div>
          <dt className="text-surface-400 text-xs uppercase tracking-wider mb-0.5">
            Tick Space
          </dt>
          <dd className="font-mono font-medium">{market.tickSpace}</dd>
        </div>
        <div>
          <dt className="text-surface-400 text-xs uppercase tracking-wider mb-0.5">
            Maker Fee
          </dt>
          <dd className="font-mono font-medium">{market.makerFee}</dd>
        </div>
        <div>
          <dt className="text-surface-400 text-xs uppercase tracking-wider mb-0.5">
            Taker Fee
          </dt>
          <dd className="font-mono font-medium">{market.takerFee}</dd>
        </div>
        <div className="col-span-2">
          <dt className="text-surface-400 text-xs uppercase tracking-wider mb-0.5">
            Base Token
          </dt>
          <dd className="font-mono text-xs break-all">{market.baseToken.id}</dd>
        </div>
        <div className="col-span-2">
          <dt className="text-surface-400 text-xs uppercase tracking-wider mb-0.5">
            Quote Token
          </dt>
          <dd className="font-mono text-xs break-all">{market.quoteToken.id}</dd>
        </div>
      </div>
    </div>
  );
}
