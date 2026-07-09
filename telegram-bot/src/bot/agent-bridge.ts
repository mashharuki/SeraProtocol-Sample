import { RequestContext } from "@mastra/core/request-context";
import { mastra } from "../mastra";
import type { PendingCard } from "../mastra/tools/context";
import type { MyContext } from "./context";
import { confirmKeyboard } from "./keyboards";

/**
 * Free-text messages → Mastra seraFxAgent. The agent only ever *prepares*
 * money movement; cards collected from prepare-* tools are rendered here
 * with the same confirm buttons (and the same act:c/act:x code path) as
 * the command flows.
 */
export async function handleAgentMessage(
  ctx: MyContext,
  text: string,
): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) {
    await ctx.reply(ctx.t("agentUnavailable"));
    return;
  }
  const telegramUserId = ctx.from?.id;
  if (!telegramUserId) return;

  const network = ctx.user?.network ?? ctx.services.config.defaultNetwork;
  const requestContext = new RequestContext();
  requestContext.set("telegramUserId", telegramUserId);
  requestContext.set("language", ctx.lang);
  requestContext.set("network", network);
  requestContext.set("walletAddress", ctx.user?.walletAddress);
  const pendingCards: PendingCard[] = [];
  requestContext.set("pendingCards", pendingCards);

  await ctx.replyWithChatAction("typing");
  try {
    const agent = mastra.getAgent("seraFxAgent");
    const res = await agent.generate(text, {
      memory: {
        thread: `tg:${telegramUserId}:${network}`,
        resource: `tg:${telegramUserId}`,
      },
      requestContext,
      maxSteps: 8,
    });
    if (res.text?.trim()) {
      // Plain text (no parse_mode): model output isn't guaranteed valid HTML.
      await ctx.reply(res.text.trim());
    }
    for (const pending of pendingCards) {
      await renderPendingCard(ctx, pending);
    }
  } catch (err) {
    console.error("agent bridge failed:", err);
    await ctx.reply(ctx.t("agentUnavailable"));
  }
}

async function renderPendingCard(ctx: MyContext, pending: PendingCard) {
  const user = ctx.user;
  if (!user) return;
  const net = ctx.services.config.networks[user.network];
  const card = pending.card as Record<string, never>;
  let body: string;
  if (pending.kind === "limit_order") {
    body = ctx.t("orderConfirmCard", {
      market: String(card.market),
      side: card.side as "bid" | "ask",
      price: String(card.price),
      amount: String(card.amount),
      baseSymbol: String(card.baseSymbol),
      quoteSymbol: String(card.quoteSymbol),
      networkLabel: net.label,
    });
  } else {
    body = ctx.t("swapConfirmCard", {
      fromAmount: String(card.fromAmount),
      fromSymbol: String(card.fromSymbol),
      toSymbol: String(card.toSymbol),
      minOutput: String(card.minOutput),
      rate: String(card.rate),
      feeSummary: String(card.feeSummary),
      expiresInSec: Number(card.expiresInSec),
      networkLabel: net.label,
      recipient: card.recipient ? String(card.recipient) : undefined,
    });
  }
  await ctx.reply(`${body}\n\n${ctx.t("agentConfirmHint")}`, {
    parse_mode: "HTML",
    reply_markup: confirmKeyboard(ctx.t, pending.actionId),
  });
}
