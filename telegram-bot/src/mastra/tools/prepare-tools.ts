import { createTool } from "@mastra/core/tools";
import { isAddress } from "viem";
import { z } from "zod";
import { toUserMessageKey } from "../../sera/errors";
import { getCardCollector, requireUser } from "./context";

/**
 * Prepare-only tools: they create a pending_action + confirmation card and
 * STOP. The agent can never move funds — only the user's button tap in
 * Telegram (bot/callbacks.ts) reaches the signer.
 */

export const prepareSwapTool = createTool({
  id: "prepare-swap",
  description:
    "Prepare an instant stablecoin swap for the user (quote + confirmation card). The user must tap Confirm in Telegram before anything executes. Use for requests like 'exchange 100 USDC to EURC'.",
  inputSchema: z.object({
    fromSymbol: z.string().describe("Token the user pays with, e.g. USDC"),
    toSymbol: z.string().describe("Token the user receives, e.g. EURC"),
    amount: z.string().describe("Human amount of fromSymbol, e.g. '100'"),
  }),
  outputSchema: z.object({ result: z.string() }),
  execute: async (input, context) => {
    const res = await requireUser(context?.requestContext);
    if ("error" in res) return { result: res.error };
    const collector = getCardCollector(context?.requestContext);
    try {
      const card = await res.services.swaps.prepareSwap(res.user, {
        fromSymbol: input.fromSymbol,
        toSymbol: input.toSymbol,
        amount: input.amount,
      });
      collector?.push({
        kind: "swap",
        actionId: card.actionId,
        card: { ...card },
      });
      return {
        result: `Swap prepared: ${card.fromAmount} ${card.fromSymbol} → min ${card.minOutput} ${card.toSymbol} (${card.rate}). A confirmation card was sent — tell the user to review it and tap Confirm. Quote expires in ~${card.expiresInSec}s.`,
      };
    } catch (err) {
      return { result: describePrepareError(err) };
    }
  },
});

export const prepareSendTool = createTool({
  id: "prepare-send",
  description:
    "Prepare a cross-currency transfer: swap the user's stablecoin and deliver a different one to a recipient's Ethereum address (international settlement). Requires an explicit 0x recipient address from the user — never invent one.",
  inputSchema: z.object({
    fromSymbol: z.string(),
    toSymbol: z.string(),
    amount: z.string(),
    recipient: z
      .string()
      .describe("Recipient 0x address, provided by the user"),
  }),
  outputSchema: z.object({ result: z.string() }),
  execute: async (input, context) => {
    const res = await requireUser(context?.requestContext);
    if ("error" in res) return { result: res.error };
    if (!isAddress(input.recipient.trim())) {
      return {
        result:
          "Invalid recipient address. Ask the user for a valid 0x… address.",
      };
    }
    const collector = getCardCollector(context?.requestContext);
    try {
      const card = await res.services.swaps.prepareSwap(res.user, {
        fromSymbol: input.fromSymbol,
        toSymbol: input.toSymbol,
        amount: input.amount,
        recipient: input.recipient.trim(),
      });
      collector?.push({
        kind: "send",
        actionId: card.actionId,
        card: { ...card },
      });
      return {
        result: `Transfer prepared: ${card.fromAmount} ${card.fromSymbol} → min ${card.minOutput} ${card.toSymbol} to ${input.recipient}. A confirmation card was sent — tell the user to double-check the recipient and tap Confirm.`,
      };
    } catch (err) {
      return { result: describePrepareError(err) };
    }
  },
});

export const prepareLimitOrderTool = createTool({
  id: "prepare-limit-order",
  description:
    "Prepare a spot limit order on a Sera market (confirmation card; the user must tap Confirm). Requires vault balance — check with get-balances first. Use list-markets to find the market symbol and precision.",
  inputSchema: z.object({
    marketSymbol: z.string().describe("Market symbol from list-markets"),
    side: z.enum(["bid", "ask"]).describe("bid = buy base, ask = sell base"),
    price: z.string().describe("Limit price in quote token"),
    amount: z.string().describe("Amount of base token"),
  }),
  outputSchema: z.object({ result: z.string() }),
  execute: async (input, context) => {
    const res = await requireUser(context?.requestContext);
    if ("error" in res) return { result: res.error };
    const collector = getCardCollector(context?.requestContext);
    try {
      const market = await res.services.orders.getMarket(
        res.user.network,
        input.marketSymbol,
      );
      if (!market) {
        return {
          result: `Unknown market '${input.marketSymbol}'. Use list-markets.`,
        };
      }
      const vault = await res.services.orders.checkVaultBalance(
        res.user,
        market,
        input.side,
        input.price,
        input.amount,
      );
      if (!vault.ok) {
        return {
          result: `Insufficient vault balance: needs ${vault.neededHuman} ${vault.symbol}, has ${vault.availableHuman}. Tell the user to run /deposit first.`,
        };
      }
      const card = await res.services.orders.prepareLimitOrder(res.user, {
        marketSymbol: input.marketSymbol,
        side: input.side,
        price: input.price,
        amount: input.amount,
      });
      collector?.push({
        kind: "limit_order",
        actionId: card.actionId,
        card: { ...card },
      });
      return {
        result: `Limit order prepared: ${card.side} ${card.amount} ${card.baseSymbol} @ ${card.price} ${card.quoteSymbol}. A confirmation card was sent — tell the user to review and tap Confirm.`,
      };
    } catch (err) {
      return { result: describePrepareError(err) };
    }
  },
});

function describePrepareError(err: unknown): string {
  const key = toUserMessageKey(err);
  const detail = err instanceof Error ? err.message : String(err);
  return `Could not prepare the action (${key}): ${detail}`;
}
