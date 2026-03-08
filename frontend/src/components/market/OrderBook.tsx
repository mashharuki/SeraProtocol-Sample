import type { Depth } from "../../types";
import { formatPrice, formatAmount } from "../../lib/format";
import { Spinner } from "../common/Spinner";

interface OrderBookProps {
  bids: Depth[];
  asks: Depth[];
  quoteUnit: string;
  loading: boolean;
  onSelectPrice?: (priceIndex: string) => void;
}

function DepthRow({
  depth,
  quoteUnit,
  side,
  maxAmount,
  onClick,
}: {
  depth: Depth;
  quoteUnit: string;
  side: "bid" | "ask";
  maxAmount: number;
  onClick?: () => void;
}) {
  const amount = Number(depth.rawAmount);
  const barWidth = maxAmount > 0 ? (amount / maxAmount) * 100 : 0;
  const isBid = side === "bid";

  return (
    <button
      onClick={onClick}
      className="group grid grid-cols-3 gap-2 px-3 py-1 text-xs font-mono tabular-nums relative hover:bg-surface-100 transition-colors w-full text-left cursor-pointer"
    >
      {/* Background bar */}
      <div
        className={`absolute inset-y-0 ${isBid ? "right-0" : "left-0"} opacity-[0.07] ${isBid ? "bg-bid" : "bg-ask"}`}
        style={{ width: `${barWidth}%` }}
      />
      <span className="relative">{depth.priceIndex}</span>
      <span className={`relative text-right ${isBid ? "text-bid" : "text-ask"}`}>
        {formatPrice(depth.price)}
      </span>
      <span className="relative text-right">{formatAmount(depth.rawAmount, quoteUnit)}</span>
    </button>
  );
}

export function OrderBook({
  bids,
  asks,
  quoteUnit,
  loading,
  onSelectPrice,
}: OrderBookProps) {
  if (loading) {
    return (
      <div className="rounded-xl border border-surface-200 bg-white p-6 flex items-center justify-center h-80">
        <Spinner size={24} />
      </div>
    );
  }

  const allAmounts = [...bids, ...asks].map((d) => Number(d.rawAmount));
  const maxAmount = Math.max(...allAmounts, 1);

  return (
    <div className="rounded-xl border border-surface-200 bg-white overflow-hidden">
      <div className="px-4 py-3 border-b border-surface-200">
        <h3 className="font-heading text-sm font-semibold text-sera-800">
          Order Book
        </h3>
      </div>

      {/* Column headers */}
      <div className="grid grid-cols-3 gap-2 px-3 py-2 text-[10px] uppercase tracking-wider text-surface-400 border-b border-surface-100">
        <span>Index</span>
        <span className="text-right">Price</span>
        <span className="text-right">Amount</span>
      </div>

      {/* Asks (reversed to show lowest at bottom) */}
      <div className="border-b border-surface-200">
        {asks.length === 0 ? (
          <div className="px-3 py-4 text-xs text-surface-400 text-center">
            No asks
          </div>
        ) : (
          [...asks].reverse().map((depth) => (
            <DepthRow
              key={`ask-${depth.priceIndex}`}
              depth={depth}
              quoteUnit={quoteUnit}
              side="ask"
              maxAmount={maxAmount}
              onClick={() => onSelectPrice?.(depth.priceIndex)}
            />
          ))
        )}
      </div>

      {/* Spread indicator */}
      {bids.length > 0 && asks.length > 0 && (
        <div className="px-3 py-1.5 text-[10px] text-center text-surface-400 bg-surface-50 border-b border-surface-200">
          Spread: {Number(asks[0].priceIndex) - Number(bids[0].priceIndex)} ticks
        </div>
      )}

      {/* Bids */}
      <div>
        {bids.length === 0 ? (
          <div className="px-3 py-4 text-xs text-surface-400 text-center">
            No bids
          </div>
        ) : (
          bids.map((depth) => (
            <DepthRow
              key={`bid-${depth.priceIndex}`}
              depth={depth}
              quoteUnit={quoteUnit}
              side="bid"
              maxAmount={maxAmount}
              onClick={() => onSelectPrice?.(depth.priceIndex)}
            />
          ))
        )}
      </div>
    </div>
  );
}
