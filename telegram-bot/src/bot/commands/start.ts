import { Composer } from "grammy";
import type { Language } from "../../config";
import { makeTranslator } from "../../i18n/messages";
import type { MyContext } from "../context";
import { createWalletKeyboard, languageKeyboard } from "../keyboards";

export const startComposer = new Composer<MyContext>();

startComposer.command("start", async (ctx) => {
  if (ctx.user) {
    const label = ctx.services.config.networks[ctx.user.network].label;
    await ctx.reply(ctx.t("welcomeBack", ctx.user.walletAddress, label), {
      parse_mode: "HTML",
    });
    return;
  }
  await ctx.reply(ctx.t("chooseLanguage"), {
    reply_markup: languageKeyboard(),
  });
});

startComposer.callbackQuery(/^lang:(en|ja)$/, async (ctx) => {
  const language = ctx.match[1] as Language;
  await ctx.answerCallbackQuery();
  if (ctx.user) {
    await ctx.services.users.setLanguage(ctx.user.telegramUserId, language);
    const t = makeTranslator(language);
    await ctx.reply(t("languageSet"));
    return;
  }
  ctx.session.language = language;
  const t = makeTranslator(language);
  await ctx.reply(t("languageSet"));
  await ctx.reply(t("startWelcome"), {
    parse_mode: "HTML",
    reply_markup: createWalletKeyboard(t),
  });
});

startComposer.callbackQuery("onboard:create", async (ctx) => {
  await ctx.answerCallbackQuery();
  if (ctx.user) {
    const label = ctx.services.config.networks[ctx.user.network].label;
    await ctx.reply(ctx.t("welcomeBack", ctx.user.walletAddress, label), {
      parse_mode: "HTML",
    });
    return;
  }
  const telegramUserId = ctx.from?.id;
  if (!telegramUserId) return;
  const language = ctx.session.language ?? ctx.lang;
  const t = makeTranslator(language);
  await ctx.reply(t("walletCreating"));
  try {
    const user = await ctx.services.users.ensureWallet(
      telegramUserId,
      language,
    );
    await ctx.reply(t("onboardingApiKey"));
    try {
      await ctx.services.users.ensureApiKey(user);
    } catch (err) {
      // API key minting is retried lazily on first authenticated call.
      console.error("ensureApiKey during onboarding failed:", err);
    }
    await ctx.reply(t("walletCreated", user.walletAddress), {
      parse_mode: "HTML",
    });
  } catch (err) {
    console.error("onboarding failed:", err);
    await ctx.reply(t("errorGeneric"));
  }
});
