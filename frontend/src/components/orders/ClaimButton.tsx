import type { OpenOrder } from "../../types";
import { useClaim } from "../../hooks/useClaim";
import { Spinner } from "../common/Spinner";
import { ErrorAlert } from "../common/ErrorAlert";

interface ClaimButtonProps {
  order: OpenOrder;
  marketAddress: string;
  onClaimed?: () => void;
}

export function ClaimButton({
  order,
  marketAddress,
  onClaimed,
}: ClaimButtonProps) {
  const { claim, isClaiming, error, clearError } = useClaim();

  async function handleClaim() {
    const hash = await claim({
      marketAddress,
      isBid: order.isBid,
      priceIndex: Number(order.priceIndex),
      orderIndex: BigInt(order.orderIndex),
    });
    if (hash) {
      onClaimed?.();
    }
  }

  return (
    <div>
      <button
        onClick={handleClaim}
        disabled={isClaiming}
        className="flex items-center gap-1.5 rounded-md bg-sera-500/10 px-3 py-1.5 text-xs font-medium text-sera-700 transition-colors hover:bg-sera-500/20 disabled:opacity-60 cursor-pointer"
      >
        {isClaiming ? (
          <>
            <Spinner size={12} />
            Claiming...
          </>
        ) : (
          "Claim"
        )}
      </button>
      {error && <ErrorAlert message={error} onDismiss={clearError} />}
    </div>
  );
}
