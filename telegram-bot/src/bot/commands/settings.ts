import { Composer } from "grammy";
import type { Network } from "../../config";
import type { MyContext } from "../context";
import { languageKeyboard, networkKeyboard } from "../keyboards";

export const settingsComposer = new Composer<MyContext>();

settingsComposer.command("network", async (ctx) => {
  const user = ctx.user;
  if (!user) {
    await ctx.reply(ctx.t("notOnboarded"));
    return;
  }
  const label = ctx.services.config.networks[user.network].label;
  await ctx.reply(
    `${ctx.t("networkCurrent", label)}\n\n${ctx.t("networkPick")}`,
    { parse_mode: "HTML", reply_markup: networkKeyboard(user.network) },
  );
});

settingsComposer.callbackQuery(/^net:(mainnet|sepolia)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const user = ctx.user;
  if (!user) return;
  const network = ctx.match[1] as Network;
  await ctx.services.users.setNetwork(user.telegramUserId, network);
  const label = ctx.services.config.networks[network].label;
  if (network === "mainnet") {
    await ctx.reply(ctx.t("networkMainnetWarning"), { parse_mode: "HTML" });
  }
  await ctx.reply(ctx.t("networkSwitched", label), { parse_mode: "HTML" });
});

settingsComposer.command("language", async (ctx) => {
  await ctx.reply(ctx.t("languagePick"), { reply_markup: languageKeyboard() });
});

settingsComposer.command("help", async (ctx) => {
  await ctx.reply(ctx.t("helpText"), { parse_mode: "HTML" });
});
