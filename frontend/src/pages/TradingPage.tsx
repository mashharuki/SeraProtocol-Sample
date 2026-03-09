import { useState } from "react";
import { ErrorAlert } from "../components/common/ErrorAlert";
import { Spinner } from "../components/common/Spinner";
import { OrderBook } from "../components/market/OrderBook";
import { TokenBalances } from "../components/market/TokenBalances";
import { OrderForm } from "../components/trading/OrderForm";
import { MARKET_ADDRESS } from "../config/constants";
import { useDepths } from "../hooks/useDepths";
import { useMarket } from "../hooks/useMarket";

export function TradingPage() {
  const [selectedPriceIndex, setSelectedPriceIndex] = useState<string>();
  const { market, loading: marketLoading, error: marketError } =
    useMarket(MARKET_ADDRESS);
  const {
    bids,
    asks,
    loading: depthsLoading,
    error: depthsError,
    refetch: refetchDepths,
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

  if (!market) return null;

  return (
    <div className="space-y-6">
      {/* 3:2 layout — order book primary, form secondary */}
      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <OrderBook
            bids={bids}
            asks={asks}
            quoteUnit={market.quoteUnit}
            loading={depthsLoading}
            baseSymbol={market.baseToken.symbol}
            quoteSymbol={market.quoteToken.symbol}
            onSelectPrice={setSelectedPriceIndex}
          />
          {depthsError && <ErrorAlert message={depthsError} />}
        </div>

        <div className="lg:col-span-2 space-y-6">
          <TokenBalances market={market} />
          <OrderForm
            market={market}
            selectedPriceIndex={selectedPriceIndex}
            bestBidIndex={bids[0]?.priceIndex}
            bestAskIndex={asks[0]?.priceIndex}
            onOrderPlaced={refetchDepths}
          />
        </div>
      </div>
    </div>
  );
}
