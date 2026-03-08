import { useWallet } from "../../hooks/useWallet";
import { truncateAddress } from "../../lib/format";
import { Spinner } from "../common/Spinner";

export function ConnectButton() {
  const { address, isConnecting, connect, disconnect } = useWallet();

  if (address) {
    return (
      <button
        onClick={disconnect}
        className="flex items-center gap-2 rounded-lg border border-surface-200 bg-surface-100 px-3 py-1.5 text-sm font-medium text-sera-800 transition-colors hover:border-sera-400 cursor-pointer"
      >
        <span className="h-2 w-2 rounded-full bg-status-filled" />
        {truncateAddress(address)}
      </button>
    );
  }

  return (
    <button
      onClick={connect}
      disabled={isConnecting}
      className="flex items-center gap-2 rounded-lg bg-sera-700 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-sera-600 disabled:opacity-60 cursor-pointer"
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
  );
}
