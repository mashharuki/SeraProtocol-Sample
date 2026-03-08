import type { OrderStatus } from "../../types";

const STATUS_STYLES: Record<OrderStatus, string> = {
  open: "bg-sera-500/10 text-sera-600",
  partial: "bg-bid/10 text-bid",
  filled: "bg-status-filled/10 text-status-filled",
  cancelled: "bg-surface-300/50 text-surface-400",
  claimed: "bg-status-claimed/10 text-status-claimed",
  pending: "bg-surface-200 text-surface-400",
};

export function StatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span
      className={`inline-block rounded-md px-2 py-0.5 text-xs font-medium tracking-wide uppercase ${STATUS_STYLES[status]}`}
    >
      {status}
    </span>
  );
}
