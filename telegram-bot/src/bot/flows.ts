import { isAddress } from "viem";
import { toUserMessageKey } from "../sera/errors";
import { validateAmount } from "../sera/precision";
import type { MyContext, OrderDraft, ProvideDraft, SwapDraft } from "./context";
import { formatEth } from "./format";
import { confirmKeyboard } from "./keyboards";

/**
 * Minimum base amount for an order draft: asks use min_ask_amount directly;
 * bids must reach min_bid_quote_amount in quote terms, so the base minimum
 * is min_bid_quote_amount / price. Rounded UP to the market's quantity
 * precision so the displayed minimum always passes the API check.
 */
/** Token-level swap minimum (human units), or null when none applies. */
function swapMin(minTradeAmount: string | number | undefined): string | null {
  const min = Number(minTradeAmount);
  return Number.isFinite(min) && min > 0 ? String(minTradeAmount) : null;
}

export function orderMinBase(draft: {
  side?: "bid" | "ask";
  price?: string;
  minAskAmount?: string;
  minBidQuoteAmount?: string;
  quantityPrecision?: number;
}): string | null {
  let min: number;
  if (draft.side === "ask") {
    min = Number(draft.minAskAmount);
  } else {
    const quoteMin = Number(draft.minBidQuoteAmount);
    const price = Number(draft.price);
    if (!Number.isFinite(price) || price <= 0) return null;
    min = quoteMin / price;
  }
  if (!Number.isFinite(min) || min <= 0) return null;
  const factor = 10 ** (draft.quantityPrecision ?? 6);
  // Subtract a tiny epsilon before ceiling so float noise (8.8/10 =
  // 0.8800000000000001) doesn't inflate an exact minimum by one step.
  const rounded = Math.ceil(min * factor - 1e-6) / factor;
  return rounded.toFixed(draft.quantityPrecision ?? 6).replace(/\.?0+$/, "");
}

/**
 * Multi-step flow state machine: consumes message:text while a draft is in
 * the session. Returns false when no flow is active (text falls through to
 * the AI agent bridge).
 */
export async function handleFlowText(
  ctx: MyContext,
  text: string,
): Promise<boolean> {
  const flow = ctx.session.flow;
  const user = ctx.user;
  if (!flow || !user) return false;

  if (flow.type === "swap" || flow.type === "send") {
    return handleSwapText(ctx, flow as SwapDraft, text);
  }
  if (flow.type === "order") {
    return handleOrderText(ctx, flow as OrderDraft, text);
  }
  if (flow.type === "deposit") {
    return handleDepositText(ctx, flow, text);
  }
  if (flow.type === "provide") {
    return handleProvideText(ctx, flow as ProvideDraft, text);
  }
  return false;
}

async function handleProvideText(
  ctx: MyContext,
  draft: ProvideDraft,
  text: string,
): Promise<boolean> {
  const user = ctx.user;
  if (!user || draft.step !== "enter_budget" || !draft.spendSymbol) {
    return false;
  }
  const check = validateAmount(text, 6);
  if (!check.ok || Number(text) <= 0) {
    await ctx.reply(ctx.t("swapInvalidAmount", ""), { parse_mode: "HTML" });
    return true;
  }
  await ctx.reply(ctx.t("providePlanning"));
  try {
    const plan = await ctx.services.liquidity.prepareProvide(
      user,
      draft.spendSymbol,
      draft.spreadBps ?? 50,
      text.trim().replace(/,/g, ""),
    );
    if (plan.status === "vault_short") {
      await ctx.reply(
        ctx.t("orderVaultShort", text, plan.available, plan.symbol),
        { parse_mode: "HTML" },
      );
      ctx.session.flow = undefined;
      return true;
    }
    if (plan.status === "no_markets") {
      await ctx.reply(ctx.t("provideNoMarkets", draft.spendSymbol), {
        parse_mode: "HTML",
      });
      ctx.session.flow = undefined;
      return true;
    }
    const net = ctx.services.config.networks[user.network];
    const lines = plan.payload.legs
      .map((leg) =>
        ctx.t(
          "provideLegLine",
          leg.marketSymbol,
          leg.side,
          leg.price,
          leg.amount,
          leg.baseSymbol,
        ),
      )
      .join("\n");
    await ctx.reply(
      ctx.t("providePlanCard", {
        budget: plan.payload.budgetHuman,
        symbol: plan.payload.spendSymbol,
        legCount: plan.payload.legs.length,
        lines,
        networkLabel: net.label,
      }),
      {
        parse_mode: "HTML",
        reply_markup: confirmKeyboard(ctx.t, plan.actionId),
      },
    );
    ctx.session.flow = undefined;
  } catch (err) {
    console.error("prepareProvide failed:", err);
    await ctx.reply(ctx.t(toUserMessageKey(err)));
    ctx.session.flow = undefined;
  }
  return true;
}

async function handleSwapText(
  ctx: MyContext,
  draft: SwapDraft,
  text: string,
): Promise<boolean> {
  const user = ctx.user;
  if (!user) return false;

  if (draft.step === "enter_recipient") {
    const candidate = text.trim();
    if (!isAddress(candidate)) {
      await ctx.reply(ctx.t("sendInvalidAddress"), { parse_mode: "HTML" });
      return true;
    }
    draft.recipient = candidate;
    draft.step = "enter_amount";
    const fromToken = draft.fromSymbol
      ? await ctx.services.rates.findToken(user.network, draft.fromSymbol)
      : null;
    await ctx.reply(
      ctx.t(
        "swapEnterAmount",
        draft.fromSymbol ?? "?",
        draft.toSymbol ?? "?",
        swapMin(fromToken?.min_trade_amount),
      ),
      { parse_mode: "HTML" },
    );
    return true;
  }

  if (draft.step === "enter_amount") {
    if (!draft.fromSymbol || !draft.toSymbol) return false;
    const token = await ctx.services.rates.findToken(
      user.network,
      draft.fromSymbol,
    );
    const decimals = token?.decimals ?? 6;
    const check = validateAmount(text, decimals);
    if (!check.ok) {
      await ctx.reply(ctx.t("swapInvalidAmount", ""), { parse_mode: "HTML" });
      return true;
    }
    const swapMinAmount = swapMin(token?.min_trade_amount);
    if (swapMinAmount !== null && Number(text) < Number(swapMinAmount)) {
      await ctx.reply(
        ctx.t("swapBelowMin", swapMinAmount, draft.fromSymbol ?? "?"),
        { parse_mode: "HTML" },
      );
      return true; // stay in the flow so the user can re-enter the amount
    }
    await ctx.reply(ctx.t("swapQuoting"));
    try {
      const card = await ctx.services.swaps.prepareSwap(user, {
        fromSymbol: draft.fromSymbol,
        toSymbol: draft.toSymbol,
        amount: text.trim().replace(/,/g, ""),
        recipient: draft.recipient,
      });
      const net = ctx.services.config.networks[user.network];
      await ctx.reply(
        ctx.t("swapConfirmCard", {
          fromAmount: card.fromAmount,
          fromSymbol: card.fromSymbol,
          toSymbol: card.toSymbol,
          minOutput: card.minOutput,
          rate: card.rate,
          feeSummary: card.feeSummary,
          expiresInSec: card.expiresInSec,
          networkLabel: net.label,
          recipient: card.recipient,
        }),
        {
          parse_mode: "HTML",
          reply_markup: confirmKeyboard(ctx.t, card.actionId),
        },
      );
      ctx.session.flow = undefined;
    } catch (err) {
      console.error("prepareSwap failed:", err);
      await ctx.reply(ctx.t(toUserMessageKey(err)));
      ctx.session.flow = undefined;
    }
    return true;
  }
  return false;
}

async function handleOrderText(
  ctx: MyContext,
  draft: OrderDraft,
  text: string,
): Promise<boolean> {
  const user = ctx.user;
  if (!user) return false;

  if (draft.step === "enter_price") {
    const maxDecimals = draft.tickPrecision ?? 6;
    const check = validateAmount(text, maxDecimals);
    if (!check.ok) {
      await ctx.reply(ctx.t("orderInvalidNumber", maxDecimals), {
        parse_mode: "HTML",
      });
      return true;
    }
    draft.price = text.trim().replace(/,/g, "");
    draft.step = "enter_amount";
    await ctx.reply(
      ctx.t(
        "orderEnterAmount",
        draft.baseSymbol ?? "?",
        draft.quantityPrecision ?? 6,
        orderMinBase(draft),
      ),
      { parse_mode: "HTML" },
    );
    return true;
  }

  if (draft.step === "enter_amount") {
    const maxDecimals = draft.quantityPrecision ?? 6;
    const check = validateAmount(text, maxDecimals);
    if (!check.ok) {
      await ctx.reply(ctx.t("orderInvalidNumber", maxDecimals), {
        parse_mode: "HTML",
      });
      return true;
    }
    const amount = text.trim().replace(/,/g, "");
    if (!draft.marketSymbol || !draft.side || !draft.price) return false;
    const minBase = orderMinBase(draft);
    if (minBase !== null && Number(amount) < Number(minBase)) {
      await ctx.reply(
        ctx.t("orderBelowMin", minBase, draft.baseSymbol ?? "?"),
        { parse_mode: "HTML" },
      );
      return true; // stay in the flow so the user can re-enter the amount
    }
    try {
      const market = await ctx.services.orders.getMarket(
        user.network,
        draft.marketSymbol,
      );
      if (!market) throw new Error(`Unknown market: ${draft.marketSymbol}`);
      const vault = await ctx.services.orders.checkVaultBalance(
        user,
        market,
        draft.side,
        draft.price,
        amount,
      );
      if (!vault.ok) {
        await ctx.reply(
          ctx.t(
            "orderVaultShort",
            vault.neededHuman,
            vault.availableHuman,
            vault.symbol,
          ),
          { parse_mode: "HTML" },
        );
        ctx.session.flow = undefined;
        return true;
      }
      const card = await ctx.services.orders.prepareLimitOrder(user, {
        marketSymbol: draft.marketSymbol,
        side: draft.side,
        price: draft.price,
        amount,
      });
      const net = ctx.services.config.networks[user.network];
      await ctx.reply(
        ctx.t("orderConfirmCard", {
          market: card.market,
          side: card.side,
          price: card.price,
          amount: card.amount,
          baseSymbol: card.baseSymbol,
          quoteSymbol: card.quoteSymbol,
          networkLabel: net.label,
        }),
        {
          parse_mode: "HTML",
          reply_markup: confirmKeyboard(ctx.t, card.actionId),
        },
      );
      ctx.session.flow = undefined;
    } catch (err) {
      console.error("prepareLimitOrder failed:", err);
      await ctx.reply(ctx.t(toUserMessageKey(err)));
      ctx.session.flow = undefined;
    }
    return true;
  }
  return false;
}

async function handleDepositText(
  ctx: MyContext,
  draft: { tokenSymbol?: string; step: string },
  text: string,
): Promise<boolean> {
  const user = ctx.user;
  if (!user || draft.step !== "enter_amount" || !draft.tokenSymbol)
    return false;
  try {
    const prepared = await ctx.services.deposits.prepareDeposit(
      user,
      draft.tokenSymbol,
      text.trim().replace(/,/g, ""),
    );
    if (prepared.status === "no_gas") {
      await ctx.reply(ctx.t("depositNoGas"), { parse_mode: "HTML" });
      ctx.session.flow = undefined;
      return true;
    }
    const net = ctx.services.config.networks[user.network];
    await ctx.reply(
      ctx.t("depositGasWarning", formatEth(prepared.ethBalance)),
      {
        parse_mode: "HTML",
      },
    );
    await ctx.reply(
      ctx.t("depositConfirmCard", prepared.amount, prepared.symbol, net.label),
      {
        parse_mode: "HTML",
        reply_markup: confirmKeyboard(ctx.t, prepared.actionId),
      },
    );
    ctx.session.flow = undefined;
  } catch (err) {
    console.error("prepareDeposit failed:", err);
    await ctx.reply(ctx.t(toUserMessageKey(err)));
    ctx.session.flow = undefined;
  }
  return true;
}
