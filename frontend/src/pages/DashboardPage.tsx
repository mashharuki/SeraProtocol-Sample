import { useMarket } from "../hooks/useMarket";
import { useDepths } from "../hooks/useDepths";
import { MarketInfoCard } from "../components/market/MarketInfoCard";
import { TokenBalances } from "../components/market/TokenBalances";
import { OrderBook } from "../components/market/OrderBook";
import { MARKET_ADDRESS } from "../config/constants";
import { Spinner } from "../components/common/Spinner";
import { ErrorAlert } from "../components/common/ErrorAlert";

export function DashboardPage() {
  const { market, loading: marketLoading, error: marketError } =
    useMarket(MARKET_ADDRESS);
  const {
    bids,
    asks,
    loading: depthsLoading,
    error: depthsError,
  } = useDepths(MARKET_ADDRESS);

  if (marketLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Spinner size={32} />
      </div>
    );
  }

  if (marketError) {
    return <ErrorAlert message={marketError} />;
  }

  return (
    <div className="space-y-6">
      {/* 2:3 asymmetric layout — market info is secondary, order book is primary */}
      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-2 space-y-6">
          {market && <MarketInfoCard market={market} />}
          {market && <TokenBalances market={market} />}

          {/* Contract reference */}
          <div className="rounded-xl border border-surface-200 bg-white p-4 text-xs text-surface-400">
            <p className="font-medium text-surface-300 uppercase tracking-wider mb-2">
              Contracts
            </p>
            <div className="space-y-1 font-mono break-all">
              <p>Market: {MARKET_ADDRESS}</p>
            </div>
          </div>
        </div>

        <div className="lg:col-span-3">
          {market && (
            <OrderBook
              bids={bids}
              asks={asks}
              quoteUnit={market.quoteUnit}
              loading={depthsLoading}
              baseSymbol={market.baseToken.symbol}
              quoteSymbol={market.quoteToken.symbol}
            />
          )}
          {depthsError && <ErrorAlert message={depthsError} />}
        </div>
      </div>
    </div>
  );
}
