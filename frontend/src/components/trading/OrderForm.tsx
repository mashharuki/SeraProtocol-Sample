import { useState, useEffect } from "react";
import type { Market } from "../../types";
import { useWallet } from "../../hooks/useWallet";
import { useTokenApproval } from "../../hooks/useTokenApproval";
import { usePlaceOrder } from "../../hooks/usePlaceOrder";
import { SEPOLIA_CHAIN_ID } from "../../config/constants";
import { Spinner } from "../common/Spinner";
import { ErrorAlert } from "../common/ErrorAlert";

interface OrderFormProps {
  market: Market;
  selectedPriceIndex?: string;
  onOrderPlaced?: () => void;
}

export function OrderForm({
  market,
  selectedPriceIndex,
  onOrderPlaced,
}: OrderFormProps) {
  const { address, chainId, connect, isConnecting, switchToSepolia } =
    useWallet();
  const [isBid, setIsBid] = useState(true);
  const [priceIndex, setPriceIndex] = useState("");
  const [amount, setAmount] = useState("");
  const [postOnly, setPostOnly] = useState(true);
  const [isSwitching, setIsSwitching] = useState(false);

  const tokenAddress = isBid ? market.quoteToken.id : market.baseToken.id;
  const { allowance, isApproving, approve, error: approvalError } =
    useTokenApproval(address ? tokenAddress : null);
  const {
    placeOrder,
    isPlacing,
    txHash,
    error: orderError,
    clearError,
  } = usePlaceOrder();

  useEffect(() => {
    if (selectedPriceIndex) {
      setPriceIndex(selectedPriceIndex);
    }
  }, [selectedPriceIndex]);

  const rawAmount = BigInt(
    Math.floor(Number(amount || "0") * Number(market.quoteUnit)),
  );
  const needsApproval = rawAmount > 0n && allowance < rawAmount;
  const wrongNetwork = chainId !== SEPOLIA_CHAIN_ID;
  const notConnected = !address;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!priceIndex || !amount) return;
    clearError();
    const hash = await placeOrder({
      marketAddress: market.id,
      priceIndex: Number(priceIndex),
      rawAmount,
      isBid,
      postOnly,
    });
    if (hash) {
      setAmount("");
      onOrderPlaced?.();
    }
  }

  return (
    <div className="rounded-xl border border-surface-200 bg-white overflow-hidden">
      <div className="px-4 py-3 border-b border-surface-200">
        <h3 className="font-heading text-sm font-semibold text-sera-800">
          Place Order
        </h3>
      </div>

      <form onSubmit={handleSubmit} className="p-4 space-y-4">
        {/* Bid/Ask toggle */}
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-surface-100 p-1">
          <button
            type="button"
            onClick={() => setIsBid(true)}
            className={`rounded-md py-2 text-sm font-medium transition-colors cursor-pointer ${
              isBid
                ? "bg-white text-bid shadow-sm"
                : "text-surface-400 hover:text-sera-700"
            }`}
          >
            Bid (Buy)
          </button>
          <button
            type="button"
            onClick={() => setIsBid(false)}
            className={`rounded-md py-2 text-sm font-medium transition-colors cursor-pointer ${
              !isBid
                ? "bg-white text-ask shadow-sm"
                : "text-surface-400 hover:text-sera-700"
            }`}
          >
            Ask (Sell)
          </button>
        </div>

        {/* Price Index */}
        <div>
          <label className="block text-xs font-medium text-surface-400 uppercase tracking-wider mb-1.5">
            Price Index
          </label>
          <input
            type="number"
            value={priceIndex}
            onChange={(e) => {
              setPriceIndex(e.target.value);
              clearError();
            }}
            placeholder="e.g. 64060"
            className="w-full rounded-lg border border-surface-200 bg-surface-50 px-3 py-2 font-mono text-sm outline-none transition-colors focus:border-sera-400 focus:ring-1 focus:ring-sera-400/30"
          />
        </div>

        {/* Amount */}
        <div>
          <label className="block text-xs font-medium text-surface-400 uppercase tracking-wider mb-1.5">
            Amount ({isBid ? market.quoteToken.symbol : market.baseToken.symbol})
          </label>
          <input
            type="number"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              clearError();
            }}
            placeholder="0.0"
            step="any"
            className="w-full rounded-lg border border-surface-200 bg-surface-50 px-3 py-2 font-mono text-sm outline-none transition-colors focus:border-sera-400 focus:ring-1 focus:ring-sera-400/30"
          />
          {rawAmount > 0n && (
            <p className="mt-1 text-xs text-surface-400">
              Raw: {rawAmount.toString()} (quoteUnit: {market.quoteUnit})
            </p>
          )}
        </div>

        {/* Post Only */}
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={postOnly}
            onChange={(e) => setPostOnly(e.target.checked)}
            className="rounded border-surface-300 text-sera-500 accent-sera-500"
          />
          <span className="text-surface-400">Post only (maker order)</span>
        </label>

        {/* Action button — 4-state flow per frontend-ux Rule 2 */}
        {notConnected ? (
          <button
            type="button"
            onClick={connect}
            disabled={isConnecting}
            className="w-full rounded-lg bg-sera-700 py-3 text-sm font-semibold text-white transition-colors hover:bg-sera-600 disabled:opacity-60 cursor-pointer flex items-center justify-center gap-2"
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
        ) : wrongNetwork ? (
          <button
            type="button"
            onClick={async () => {
              setIsSwitching(true);
              await switchToSepolia();
              setIsSwitching(false);
            }}
            disabled={isSwitching}
            className="w-full rounded-lg bg-ask/90 py-3 text-sm font-semibold text-white transition-colors hover:bg-ask disabled:opacity-60 cursor-pointer flex items-center justify-center gap-2"
          >
            {isSwitching ? (
              <>
                <Spinner size={14} />
                Switching...
              </>
            ) : (
              "Switch to Sepolia"
            )}
          </button>
        ) : needsApproval ? (
          <button
            type="button"
            onClick={approve}
            disabled={isApproving}
            className="w-full rounded-lg bg-bid py-3 text-sm font-semibold text-white transition-colors hover:bg-bid/90 disabled:opacity-60 cursor-pointer flex items-center justify-center gap-2"
          >
            {isApproving ? (
              <>
                <Spinner size={14} />
                Approving...
              </>
            ) : (
              `Approve ${isBid ? market.quoteToken.symbol : market.baseToken.symbol}`
            )}
          </button>
        ) : (
          <button
            type="submit"
            disabled={isPlacing || !priceIndex || !amount}
            className={`w-full rounded-lg py-3 text-sm font-semibold text-white transition-colors disabled:opacity-60 cursor-pointer flex items-center justify-center gap-2 ${
              isBid
                ? "bg-bid hover:bg-bid/90"
                : "bg-ask hover:bg-ask/90"
            }`}
          >
            {isPlacing ? (
              <>
                <Spinner size={14} />
                Placing...
              </>
            ) : (
              `Place ${isBid ? "Bid" : "Ask"} Order`
            )}
          </button>
        )}

        {/* Error display — inline per frontend-ux Rule 9 */}
        {(orderError || approvalError) && (
          <ErrorAlert
            message={orderError || approvalError || ""}
            onDismiss={clearError}
          />
        )}

        {/* TX hash success */}
        {txHash && (
          <div className="rounded-lg border border-sera-400/20 bg-sera-500/5 px-4 py-3 text-sm text-sera-700">
            <p className="font-medium mb-1">Order submitted</p>
            <a
              href={`https://sepolia.etherscan.io/tx/${txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-xs text-sera-500 underline break-all"
            >
              {txHash}
            </a>
          </div>
        )}
      </form>
    </div>
  );
}
