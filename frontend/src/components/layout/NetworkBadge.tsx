import { useWallet } from "../../hooks/useWallet";
import { SEPOLIA_CHAIN_ID } from "../../config/constants";
import { Spinner } from "../common/Spinner";
import { useState } from "react";

export function NetworkBadge() {
  const { chainId, address, switchToSepolia } = useWallet();
  const [isSwitching, setIsSwitching] = useState(false);

  if (!address) return null;

  const isCorrectNetwork = chainId === SEPOLIA_CHAIN_ID;

  if (isCorrectNetwork) {
    return (
      <span className="hidden sm:inline-flex items-center gap-1.5 rounded-md bg-surface-100 px-2.5 py-1 text-xs font-medium text-surface-400">
        <span className="h-1.5 w-1.5 rounded-full bg-sera-400" />
        Sepolia
      </span>
    );
  }

  return (
    <button
      onClick={async () => {
        setIsSwitching(true);
        await switchToSepolia();
        setIsSwitching(false);
      }}
      disabled={isSwitching}
      className="flex items-center gap-1.5 rounded-md bg-ask/10 px-2.5 py-1 text-xs font-medium text-ask transition-colors hover:bg-ask/20 disabled:opacity-60 cursor-pointer"
    >
      {isSwitching ? (
        <>
          <Spinner size={12} />
          Switching...
        </>
      ) : (
        "Switch to Sepolia"
      )}
    </button>
  );
}
