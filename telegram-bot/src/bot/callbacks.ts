import { Composer } from "grammy";
import { toUserMessageKey } from "../sera/errors";
import type { DepositActionPayload } from "../services/deposit-service";
import type {
  CancelActionPayload,
  OrderActionPayload,
} from "../services/order-service";
import type { SwapActionPayload } from "../services/swap-service";
import type { MyContext } from "./context";
import { confirmKeyboard } from "./keyboards";

/**
 * The single choke point for money movement: only these callback handlers
 * reach the signer. Everything upstream just creates pending_actions.
 */
export const actionsComposer = new Composer<MyContext>();

actionsComposer.callbackQuery(/^act:x:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.services.pendingActions.cancel(ctx.match[1]);
  await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => {});
  await ctx.reply(ctx.t("cancelled"));
});

actionsComposer.callbackQuery(/^act:c:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const user = ctx.user;
  if (!user) {
    await ctx.reply(ctx.t("notOnboarded"));
    return;
  }
  const result = await ctx.services.pendingActions.consume<unknown>(
    ctx.match[1],
    user.telegramUserId,
  );
  if (result.status === "expired") {
    await ctx
      .editMessageReplyMarkup({ reply_markup: undefined })
      .catch(() => {});
    await ctx.reply(ctx.t("actionExpired"));
    return;
  }
  if (result.status !== "ok") {
    await ctx.reply(ctx.t("actionAlreadyUsed"));
    return;
  }
  await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => {});

  const { kind } = result.row;
  try {
    if (kind === "swap" || kind === "send") {
      await executeSwapAction(ctx, result.payload as SwapActionPayload);
    } else if (kind === "limit_order") {
      const payload = result.payload as OrderActionPayload;
      const res = await ctx.services.orders.executeOrder(user, payload);
      await ctx.reply(ctx.t("orderPlaced", res.orderId), {
        parse_mode: "HTML",
      });
    } else if (kind === "cancel_order") {
      const payload = result.payload as CancelActionPayload;
      const res = await ctx.services.orders.executeCancel(user, payload);
      if (res.status === "cooldown") {
        await ctx.reply(ctx.t("orderCancelCooldown", 5));
      } else {
        await ctx.reply(ctx.t("orderCancelled"));
      }
    } else if (kind === "deposit") {
      const payload = result.payload as DepositActionPayload;
      await ctx.reply(ctx.t("depositExecuting"));
      const res = await ctx.services.deposits.executeDeposit(user, payload);
      await ctx.reply(ctx.t("depositSubmitted", res.txUrl), {
        parse_mode: "HTML",
        link_preview_options: { is_disabled: true },
      });
    } else if (kind === "faucet_claim") {
      await ctx.reply(ctx.t("faucetClaiming"));
      const res = await ctx.services.faucet.executeClaim(user);
      await ctx.reply(ctx.t("faucetSuccess", res.txUrl), {
        parse_mode: "HTML",
        link_preview_options: { is_disabled: true },
      });
    }
  } catch (err) {
    console.error(`execute ${kind} failed:`, err);
    const reason = ctx.t(toUserMessageKey(err));
    if (kind === "limit_order") {
      await ctx.reply(ctx.t("orderFailed", reason), { parse_mode: "HTML" });
    } else if (kind === "swap" || kind === "send") {
      await ctx.reply(ctx.t("swapFailed", reason), { parse_mode: "HTML" });
    } else {
      await ctx.reply(reason);
    }
  }
});

async function executeSwapAction(ctx: MyContext, payload: SwapActionPayload) {
  const user = ctx.user;
  if (!user) return;
  await ctx.reply(ctx.t("swapExecuting"));
  const res = await ctx.services.swaps.executeSwap(user, payload);
  if (res.status === "requoted") {
    const net = ctx.services.config.networks[user.network];
    await ctx.reply(ctx.t("swapRequoted"));
    await ctx.reply(
      ctx.t("swapConfirmCard", {
        fromAmount: res.card.fromAmount,
        fromSymbol: res.card.fromSymbol,
        toSymbol: res.card.toSymbol,
        minOutput: res.card.minOutput,
        rate: res.card.rate,
        feeSummary: res.card.feeSummary,
        expiresInSec: res.card.expiresInSec,
        networkLabel: net.label,
        recipient: res.card.recipient,
      }),
      {
        parse_mode: "HTML",
        reply_markup: confirmKeyboard(ctx.t, res.card.actionId),
      },
    );
    return;
  }
  if (res.recipient) {
    await ctx.reply(
      ctx.t("swapSuccessSent", res.received, res.toSymbol, res.recipient),
      { parse_mode: "HTML" },
    );
  } else {
    await ctx.reply(ctx.t("swapSuccess", res.received, res.toSymbol), {
      parse_mode: "HTML",
    });
  }
}
