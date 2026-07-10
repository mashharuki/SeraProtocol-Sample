import { Composer, InlineKeyboard } from "grammy";
import type { MyContext } from "../context";
import { rateKeyboard } from "../keyboards";

export const rateComposer = new Composer<MyContext>();

rateComposer.command("rate", async (ctx) => {
  const network = ctx.user?.network ?? ctx.services.config.defaultNetwork;
  try {
    const markets = await ctx.services.rates.getMarkets(network);
    await ctx.reply(ctx.t("ratePickPair"), {
      parse_mode: "HTML",
      reply_markup: rateKeyboard(markets),
    });
  } catch (err) {
    console.error("/rate failed:", err);
    await ctx.reply(ctx.t("errorGeneric"));
  }
});

// Live liquidity check: probe /swap/quote across major pairs so users can
// see what is actually swappable before trying (Sepolia is mostly dry).
rateComposer.command("liquidity", async (ctx) => {
  const network = ctx.user?.network ?? ctx.services.config.defaultNetwork;
  await ctx.reply(ctx.t("liquidityChecking"));
  try {
    const probe = await ctx.services.rates.probeLiquidity(network);
    const net = ctx.services.config.networks[network];
    if (probe.pairs.length === 0) {
      await ctx.reply(ctx.t("liquidityNone", net.label, probe.checked), {
        parse_mode: "HTML",
      });
      return;
    }
    const lines = probe.pairs
      .map(([from, to]) => `✅ ${from} → ${to}`)
      .join("\n");
    await ctx.reply(ctx.t("liquidityResult", net.label, lines, probe.checked), {
      parse_mode: "HTML",
    });
  } catch (err) {
    console.error("/liquidity failed:", err);
    await ctx.reply(ctx.t("errorGeneric"));
  }
});

rateComposer.callbackQuery(
  /^rate:([A-Za-z0-9]+):([A-Za-z0-9]+)$/,
  async (ctx) => {
    await ctx.answerCallbackQuery();
    const [, baseSymbol, quoteSymbol] = ctx.match;
    const network = ctx.user?.network ?? ctx.services.config.defaultNetwork;
    try {
      // /fx/rate speaks fiat currency codes (USD, EUR…); resolve them from
      // the token metadata, falling back to the token symbol itself.
      const [baseToken, quoteToken] = await Promise.all([
        ctx.services.rates.findToken(network, baseSymbol),
        ctx.services.rates.findToken(network, quoteSymbol),
      ]);
      const base = baseToken?.currency ?? baseSymbol;
      const quote = quoteToken?.currency ?? quoteSymbol;
      const fx = await ctx.services.rates.getFxRate(network, base, quote);
      const rate = Number(fx.rate);
      const inverse = rate > 0 ? (1 / rate).toFixed(6) : "?";
      const change =
        fx.change_pct !== null && fx.change_pct !== undefined
          ? `${Number(fx.change_pct) >= 0 ? "+" : ""}${Number(fx.change_pct).toFixed(3)}%`
          : "—";
      const kb = new InlineKeyboard().text(
        ctx.t("tradePairButton"),
        `trade:${baseSymbol}:${quoteSymbol}`,
      );
      await ctx.reply(
        ctx.t(
          "rateResult",
          `${baseSymbol}/${quoteSymbol}`,
          rate.toFixed(6),
          `1 ${quoteSymbol} ≈ ${inverse} ${baseSymbol}`,
          change,
        ),
        { parse_mode: "HTML", reply_markup: kb },
      );
    } catch (err) {
      console.error("rate lookup failed:", err);
      await ctx.reply(ctx.t("rateUnavailable"));
    }
  },
);

// "Trade this pair" — jump into the swap flow with from/to preselected.
rateComposer.callbackQuery(
  /^trade:([A-Za-z0-9]+):([A-Za-z0-9]+)$/,
  async (ctx) => {
    await ctx.answerCallbackQuery();
    const [, baseSymbol, quoteSymbol] = ctx.match;
    if (!ctx.user) {
      await ctx.reply(ctx.t("notOnboarded"));
      return;
    }
    ctx.session.flow = {
      type: "swap",
      step: "enter_amount",
      fromSymbol: quoteSymbol,
      toSymbol: baseSymbol,
    };
    await ctx.reply(ctx.t("swapEnterAmount", quoteSymbol, baseSymbol), {
      parse_mode: "HTML",
    });
  },
);
