import { isAddress } from "viem";
import { toUserMessageKey } from "../sera/errors";
import { validateAmount } from "../sera/precision";
import type { MyContext, OrderDraft, SwapDraft } from "./context";
import { formatEth } from "./format";
import { confirmKeyboard } from "./keyboards";

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
  return false;
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
    await ctx.reply(
      ctx.t("swapEnterAmount", draft.fromSymbol ?? "?", draft.toSymbol ?? "?"),
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
