import { Composer } from "grammy";
import type { MyContext, SwapDraft } from "../context";
import { tokenKeyboard } from "../keyboards";

export const swapComposer = new Composer<MyContext>();

async function beginPickFrom(ctx: MyContext, type: "swap" | "send") {
  if (!ctx.user) {
    await ctx.reply(ctx.t("notOnboarded"));
    return;
  }
  ctx.session.flow = { type, step: "pick_from" };
  const tokens = await ctx.services.rates.getTokens(ctx.user.network);
  await ctx.reply(ctx.t("swapPickFrom"), {
    parse_mode: "HTML",
    reply_markup: tokenKeyboard(tokens, "swap:from"),
  });
}

swapComposer.command("swap", (ctx) => beginPickFrom(ctx, "swap"));

swapComposer.command("send", async (ctx) => {
  await ctx.reply(ctx.t("sendIntro"), { parse_mode: "HTML" });
  await beginPickFrom(ctx, "send");
});

swapComposer.callbackQuery(/^swap:from:([A-Za-z0-9]+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const flow = ctx.session.flow;
  if (!ctx.user || !flow || (flow.type !== "swap" && flow.type !== "send"))
    return;
  const draft = flow as SwapDraft;
  draft.fromSymbol = ctx.match[1];
  draft.step = "pick_to";
  const tokens = await ctx.services.rates.getTokens(ctx.user.network);
  await ctx.reply(ctx.t("swapPickTo"), {
    parse_mode: "HTML",
    reply_markup: tokenKeyboard(tokens, "swap:to", draft.fromSymbol),
  });
});

swapComposer.callbackQuery(/^swap:to:([A-Za-z0-9]+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const flow = ctx.session.flow;
  if (!ctx.user || !flow || (flow.type !== "swap" && flow.type !== "send"))
    return;
  const draft = flow as SwapDraft;
  const toSymbol = ctx.match[1];
  if (toSymbol === draft.fromSymbol) {
    await ctx.reply(ctx.t("sendSameToken"), { parse_mode: "HTML" });
    return;
  }
  draft.toSymbol = toSymbol;
  if (draft.type === "send") {
    draft.step = "enter_recipient";
    await ctx.reply(ctx.t("sendEnterRecipient"), { parse_mode: "HTML" });
  } else {
    draft.step = "enter_amount";
    await ctx.reply(
      ctx.t("swapEnterAmount", draft.fromSymbol ?? "?", draft.toSymbol),
      { parse_mode: "HTML" },
    );
  }
});
