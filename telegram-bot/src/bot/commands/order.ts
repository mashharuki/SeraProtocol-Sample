import { Composer } from "grammy";
import type { MyContext, OrderDraft } from "../context";
import {
  confirmKeyboard,
  marketKeyboard,
  orderActionsKeyboard,
  sideKeyboard,
  tokenKeyboard,
} from "../keyboards";

export const orderComposer = new Composer<MyContext>();

orderComposer.command("order", async (ctx) => {
  if (!ctx.user) {
    await ctx.reply(ctx.t("notOnboarded"));
    return;
  }
  ctx.session.flow = { type: "order", step: "pick_pair" };
  const markets = await ctx.services.rates.getMarkets(ctx.user.network);
  await ctx.reply(ctx.t("orderPickPair"), {
    parse_mode: "HTML",
    reply_markup: marketKeyboard(markets, "order:mkt"),
  });
});

orderComposer.callbackQuery(/^order:mkt:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const flow = ctx.session.flow;
  if (!ctx.user || flow?.type !== "order") return;
  const draft = flow as OrderDraft;
  const market = await ctx.services.rates.findMarket(
    ctx.user.network,
    ctx.match[1],
  );
  if (!market) {
    await ctx.reply(ctx.t("errorGeneric"));
    return;
  }
  draft.marketSymbol = market.symbol;
  draft.baseSymbol = market.base_symbol;
  draft.quoteSymbol = market.quote_symbol;
  draft.tickPrecision = market.tick_precision;
  draft.quantityPrecision = market.quantity_precision;
  draft.step = "pick_side";
  await ctx.reply(
    ctx.t("orderPickSide", market.base_symbol, market.quote_symbol),
    {
      parse_mode: "HTML",
      reply_markup: sideKeyboard(ctx.t, market.base_symbol),
    },
  );
});

orderComposer.callbackQuery(/^order:side:(bid|ask)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const flow = ctx.session.flow;
  if (!ctx.user || flow?.type !== "order") return;
  const draft = flow as OrderDraft;
  draft.side = ctx.match[1] as "bid" | "ask";
  draft.step = "enter_price";
  await ctx.reply(
    ctx.t(
      "orderEnterPrice",
      draft.quoteSymbol ?? "?",
      draft.tickPrecision ?? 6,
    ),
    { parse_mode: "HTML" },
  );
});

orderComposer.command("orders", async (ctx) => {
  const user = ctx.user;
  if (!user) {
    await ctx.reply(ctx.t("notOnboarded"));
    return;
  }
  const net = ctx.services.config.networks[user.network];
  const orders = await ctx.services.orders.listOrders(user);
  if (orders.length === 0) {
    await ctx.reply(
      `${ctx.t("ordersTitle", net.label)}\n\n${ctx.t("ordersEmpty")}`,
      { parse_mode: "HTML" },
    );
    return;
  }
  await ctx.reply(ctx.t("ordersTitle", net.label), { parse_mode: "HTML" });
  for (const order of orders) {
    await ctx.reply(
      ctx.t(
        "orderLine",
        order.market,
        order.side,
        order.price,
        order.amount,
        order.status,
      ),
      {
        parse_mode: "HTML",
        reply_markup: orderActionsKeyboard(ctx.t, order.orderId),
      },
    );
  }
});

orderComposer.callbackQuery(/^ord:st:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const user = ctx.user;
  if (!user) return;
  try {
    const order = await ctx.services.orders.refreshOrderStatus(
      user,
      ctx.match[1],
    );
    if (!order) {
      await ctx.reply(ctx.t("errorGeneric"));
      return;
    }
    await ctx.reply(
      ctx.t("orderStatusDetail", order.status, "—", order.amount),
      { parse_mode: "HTML" },
    );
  } catch (err) {
    console.error("order status failed:", err);
    await ctx.reply(ctx.t("errorGeneric"));
  }
});

orderComposer.callbackQuery(/^ord:cx:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const user = ctx.user;
  if (!user) return;
  try {
    const res = await ctx.services.orders.prepareCancel(user, ctx.match[1]);
    if (res.status === "cooldown") {
      await ctx.reply(ctx.t("orderCancelCooldown", res.minutesLeft));
      return;
    }
    if (res.status === "not_found") {
      await ctx.reply(ctx.t("errorGeneric"));
      return;
    }
    await ctx.reply(ctx.t("orderCancelConfirm", res.market, res.price), {
      parse_mode: "HTML",
      reply_markup: confirmKeyboard(ctx.t, res.actionId),
    });
  } catch (err) {
    console.error("prepare cancel failed:", err);
    await ctx.reply(ctx.t("errorGeneric"));
  }
});

orderComposer.command("deposit", async (ctx) => {
  if (!ctx.user) {
    await ctx.reply(ctx.t("notOnboarded"));
    return;
  }
  await ctx.reply(ctx.t("depositIntro"), { parse_mode: "HTML" });
  ctx.session.flow = { type: "deposit", step: "pick_token" };
  const tokens = await ctx.services.rates.getTokens(ctx.user.network);
  await ctx.reply(ctx.t("depositPickToken"), {
    reply_markup: tokenKeyboard(tokens, "dep:tok"),
  });
});

orderComposer.callbackQuery(/^dep:tok:([A-Za-z0-9]+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const flow = ctx.session.flow;
  if (!ctx.user || flow?.type !== "deposit") return;
  flow.tokenSymbol = ctx.match[1];
  flow.step = "enter_amount";
  await ctx.reply(ctx.t("depositEnterAmount", flow.tokenSymbol), {
    parse_mode: "HTML",
  });
});
