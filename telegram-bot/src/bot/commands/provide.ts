import { Composer, InlineKeyboard } from "grammy";
import { MAJOR_SYMBOLS } from "../../config";
import type { MyContext, ProvideDraft } from "../context";

export const provideComposer = new Composer<MyContext>();

/**
 * /provide — market-maker lite: quote several markets at once from one
 * shared collateral budget via a Sera Virtual Liquidity batch.
 * Flow: pick vault token → pick spread → type budget → confirm card.
 */
provideComposer.command("provide", async (ctx) => {
  const user = ctx.user;
  if (!user) {
    await ctx.reply(ctx.t("notOnboarded"));
    return;
  }
  await ctx.reply(ctx.t("provideIntro"), { parse_mode: "HTML" });

  const sera = await ctx.services.authedSera(user);
  const balances = await sera.getBalances(user.walletAddress);
  const vaulted = balances.filter(
    (b) => MAJOR_SYMBOLS.has(b.symbol) && BigInt(b.vault_available) > 0n,
  );
  if (vaulted.length === 0) {
    await ctx.reply(ctx.t("provideNoVault"), { parse_mode: "HTML" });
    return;
  }

  ctx.session.flow = { type: "provide", step: "pick_token" };
  const kb = new InlineKeyboard();
  vaulted.forEach((b, i) => {
    kb.text(b.symbol, `prov:tok:${b.symbol}`);
    if (i % 3 === 2) kb.row();
  });
  await ctx.reply(ctx.t("providePickToken"), { reply_markup: kb });
});

provideComposer.callbackQuery(/^prov:tok:([A-Za-z0-9]+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const flow = ctx.session.flow;
  if (!ctx.user || flow?.type !== "provide") return;
  const draft = flow as ProvideDraft;
  draft.spendSymbol = ctx.match[1];
  draft.step = "pick_spread";
  const kb = new InlineKeyboard()
    .text("±0.1%", "prov:spr:10")
    .text("±0.5%", "prov:spr:50")
    .text("±1.0%", "prov:spr:100");
  await ctx.reply(ctx.t("providePickSpread"), {
    parse_mode: "HTML",
    reply_markup: kb,
  });
});

provideComposer.callbackQuery(/^prov:spr:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const flow = ctx.session.flow;
  if (!ctx.user || flow?.type !== "provide") return;
  const draft = flow as ProvideDraft;
  draft.spreadBps = Number(ctx.match[1]);
  draft.step = "enter_budget";
  const spendSymbol = draft.spendSymbol ?? "?";
  const min = await ctx.services.liquidity
    .minBudgetHint(ctx.user.network, spendSymbol)
    .catch(() => null);
  await ctx.reply(ctx.t("provideEnterBudget", spendSymbol, min), {
    parse_mode: "HTML",
  });
});

// Cancel a whole VL batch. callback_data carries a member order_id (the
// vl_batch_id itself can exceed Telegram's 64-byte limit) — resolve via DB.
provideComposer.callbackQuery(/^prov:cx:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const user = ctx.user;
  if (!user) return;
  try {
    const order = await ctx.services.orders.findLocal(user, ctx.match[1]);
    if (!order?.vlBatchId) {
      await ctx.reply(ctx.t("errorGeneric"));
      return;
    }
    const res = await ctx.services.liquidity.cancelBatch(user, order.vlBatchId);
    if (res.status === "cooldown") {
      await ctx.reply(ctx.t("orderCancelCooldown", 5));
      return;
    }
    await ctx.reply(ctx.t("provideBatchCancelled"), { parse_mode: "HTML" });
  } catch (err) {
    console.error("VL batch cancel failed:", err);
    await ctx.reply(ctx.t("errorGeneric"));
  }
});
