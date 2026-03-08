import { NavLink } from "react-router";
import { ConnectButton } from "./ConnectButton";
import { NetworkBadge } from "./NetworkBadge";

export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-surface-200 bg-surface-50/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <div className="flex items-center gap-6">
          <span className="font-heading text-lg font-bold tracking-tight text-sera-800">
            Sera
          </span>
          <nav className="hidden sm:flex items-center gap-1">
            <NavLink
              to="/"
              className={({ isActive }) =>
                `rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-sera-500/10 text-sera-700"
                    : "text-surface-400 hover:text-sera-700 hover:bg-surface-100"
                }`
              }
            >
              Dashboard
            </NavLink>
            <NavLink
              to="/trade"
              className={({ isActive }) =>
                `rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-sera-500/10 text-sera-700"
                    : "text-surface-400 hover:text-sera-700 hover:bg-surface-100"
                }`
              }
            >
              Trade
            </NavLink>
            <NavLink
              to="/orders"
              className={({ isActive }) =>
                `rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-sera-500/10 text-sera-700"
                    : "text-surface-400 hover:text-sera-700 hover:bg-surface-100"
                }`
              }
            >
              My Orders
            </NavLink>
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <NetworkBadge />
          <ConnectButton />
        </div>
      </div>
    </header>
  );
}
