import { useWallet } from "../hooks/useWallet";
import { useMarket } from "../hooks/useMarket";
import { useOrders } from "../hooks/useOrders";
import { OrdersTable } from "../components/orders/OrdersTable";
import { MARKET_ADDRESS } from "../config/constants";
import { Spinner } from "../components/common/Spinner";
import { ErrorAlert } from "../components/common/ErrorAlert";

export function MyOrdersPage() {
  const { address, connect, isConnecting } = useWallet();
  const { market, loading: marketLoading } = useMarket(MARKET_ADDRESS);
  const {
    orders,
    loading: ordersLoading,
    error,
    refetch,
  } = useOrders(address, MARKET_ADDRESS);

  if (!address) {
    return (
      <div className="flex flex-col items-center justify-center py-24 space-y-4">
        <p className="text-sm text-surface-400">
          Connect your wallet to view orders.
        </p>
        <button
          onClick={connect}
          disabled={isConnecting}
          className="flex items-center gap-2 rounded-lg bg-sera-700 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-sera-600 disabled:opacity-60 cursor-pointer"
        >
          {isConnecting ? (
            <>
              <Spinner size={14} />
              Connecting...
            </>
          ) : (
            "Connect Wallet"
          )}
        </button>
      </div>
    );
  }

  if (marketLoading || ordersLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Spinner size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-heading text-lg font-bold text-sera-800">
          My Orders
          {market && (
            <span className="ml-2 text-sm font-normal text-surface-400">
              {market.baseToken.symbol}/{market.quoteToken.symbol}
            </span>
          )}
        </h2>
        <button
          onClick={refetch}
          className="rounded-md bg-surface-100 px-3 py-1.5 text-xs font-medium text-surface-400 transition-colors hover:bg-surface-200 cursor-pointer"
        >
          Refresh
        </button>
      </div>

      {error && <ErrorAlert message={error} />}
      <OrdersTable orders={orders} market={market} onClaimed={refetch} />
    </div>
  );
}
