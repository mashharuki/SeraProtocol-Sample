import type { OpenOrder, Market } from "../../types";
import { formatAmount } from "../../lib/format";
import { StatusBadge } from "../common/StatusBadge";
import { ClaimButton } from "./ClaimButton";

interface OrdersTableProps {
  orders: OpenOrder[];
  market: Market | null;
  onClaimed?: () => void;
}

export function OrdersTable({ orders, market, onClaimed }: OrdersTableProps) {
  if (!market) return null;

  if (orders.length === 0) {
    return (
      <div className="rounded-xl border border-surface-200 bg-white p-8 text-center text-sm text-surface-400">
        No orders found for this market.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-surface-200 bg-white overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-surface-200 text-left text-[10px] uppercase tracking-wider text-surface-400">
              <th className="px-4 py-3 font-medium">Side</th>
              <th className="px-4 py-3 font-medium">Price Index</th>
              <th className="px-4 py-3 font-medium text-right">Amount</th>
              <th className="px-4 py-3 font-medium text-right">Filled</th>
              <th className="px-4 py-3 font-medium text-right">Claimable</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-100">
            {orders.map((order) => (
              <tr key={order.id} className="hover:bg-surface-50 transition-colors">
                <td className="px-4 py-3">
                  <span
                    className={`text-xs font-semibold ${
                      order.isBid ? "text-bid" : "text-ask"
                    }`}
                  >
                    {order.isBid ? "BID" : "ASK"}
                  </span>
                </td>
                <td className="px-4 py-3 font-mono text-xs">
                  {order.priceIndex}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-right">
                  {formatAmount(order.rawAmount, market.quoteUnit)}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-right">
                  {order.rawFilledAmount
                    ? formatAmount(order.rawFilledAmount, market.quoteUnit)
                    : "—"}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-right">
                  {order.claimableAmount && order.claimableAmount !== "0"
                    ? formatAmount(order.claimableAmount, market.quoteUnit)
                    : "—"}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={order.status} />
                </td>
                <td className="px-4 py-3">
                  {order.claimableAmount &&
                    BigInt(order.claimableAmount) > 0n && (
                      <ClaimButton
                        order={order}
                        marketAddress={market.id}
                        onClaimed={onClaimed}
                      />
                    )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
