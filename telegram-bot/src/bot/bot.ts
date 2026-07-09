import { Bot, session } from "grammy";
import type { Language } from "../config";
import { makeTranslator } from "../i18n/messages";
import type { Services } from "../services";
import { handleAgentMessage } from "./agent-bridge";
import { actionsComposer } from "./callbacks";
import { accountComposer } from "./commands/account";
import { orderComposer } from "./commands/order";
import { rateComposer } from "./commands/rate";
import { settingsComposer } from "./commands/settings";
import { startComposer } from "./commands/start";
import { swapComposer } from "./commands/swap";
import type { MyContext, SessionData } from "./context";
import { handleFlowText } from "./flows";

const COMMANDS: Record<Language, { command: string; description: string }[]> = {
  en: [
    { command: "start", description: "Set up your wallet" },
    { command: "wallet", description: "Your address & funding info" },
    { command: "balance", description: "ETH + stablecoin balances" },
    { command: "rate", description: "Live FX rates" },
    { command: "swap", description: "Instant exchange (no ETH needed)" },
    { command: "send", description: "Exchange & send to an address" },
    { command: "order", description: "Place a limit order" },
    { command: "orders", description: "View / cancel your orders" },
    { command: "deposit", description: "Move tokens into the Sera vault" },
    { command: "network", description: "Switch Mainnet / Sepolia" },
    { command: "language", description: "English / 日本語" },
    { command: "help", description: "How everything works" },
  ],
  ja: [
    { command: "start", description: "ウォレットを設定" },
    { command: "wallet", description: "アドレスと入金方法" },
    { command: "balance", description: "ETH・ステーブルコイン残高" },
    { command: "rate", description: "リアルタイム為替レート" },
    { command: "swap", description: "即時両替（ETH 不要）" },
    { command: "send", description: "両替して送金" },
    { command: "order", description: "指値注文" },
    { command: "orders", description: "注文の確認・キャンセル" },
    { command: "deposit", description: "ボールトへ入金" },
    { command: "network", description: "ネットワーク切替" },
    { command: "language", description: "English / 日本語" },
    { command: "help", description: "使い方" },
  ],
};

/**
 * Per-user throttle: Sera's per-key rate limits are 10 read/s and 5 trade/s;
 * a runaway user (or button mashing) must not exhaust them. Sliding window,
 * in-memory — fine for the single-instance deployment this bot assumes.
 */
function createThrottle(maxUpdates: number, windowMs: number) {
  const hits = new Map<number, number[]>();
  return (userId: number): boolean => {
    const now = Date.now();
    const list = (hits.get(userId) ?? []).filter((t) => now - t < windowMs);
    if (list.length >= maxUpdates) {
      hits.set(userId, list);
      return false;
    }
    list.push(now);
    hits.set(userId, list);
    return true;
  };
}

export function createBot(services: Services): Bot<MyContext> {
  const bot = new Bot<MyContext>(services.config.telegramBotToken);
  const allowUpdate = createThrottle(5, 3_000);

  bot.use(async (ctx, next) => {
    const userId = ctx.from?.id;
    if (userId && !allowUpdate(userId)) {
      if (ctx.callbackQuery) await ctx.answerCallbackQuery().catch(() => {});
      return; // drop the update silently
    }
    await next();
  });

  bot.use(
    session({
      initial: (): SessionData => ({}),
    }),
  );

  // Attach services + user + translator to every update.
  bot.use(async (ctx, next) => {
    ctx.services = services;
    const telegramUserId = ctx.from?.id;
    ctx.user = telegramUserId
      ? await services.users.find(telegramUserId)
      : null;
    const fallback: Language = ctx.from?.language_code?.startsWith("ja")
      ? "ja"
      : "en";
    ctx.lang = ctx.user?.language ?? ctx.session.language ?? fallback;
    ctx.t = makeTranslator(ctx.lang);
    await next();
  });

  bot.use(startComposer);
  bot.use(actionsComposer);
  bot.use(accountComposer);
  bot.use(rateComposer);
  bot.use(swapComposer);
  bot.use(orderComposer);
  bot.use(settingsComposer);

  // Free text: active flow first, then the AI agent.
  bot.on("message:text", async (ctx) => {
    const text = ctx.message.text;
    if (text.startsWith("/")) return; // unknown command, ignore
    const consumed = await handleFlowText(ctx, text);
    if (!consumed) {
      await handleAgentMessage(ctx, text);
    }
  });

  bot.catch((err) => {
    console.error("bot error:", err.error);
  });

  return bot;
}

export async function setBotCommands(bot: Bot<MyContext>): Promise<void> {
  await bot.api.setMyCommands(COMMANDS.en);
  await bot.api.setMyCommands(COMMANDS.ja, { language_code: "ja" });
}
