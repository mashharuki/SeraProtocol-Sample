import { Composer, InlineKeyboard, InputFile } from "grammy";
import { describeKeyOpError } from "../../privy/signer";
import type { ImportKeyDraft, MyContext } from "../context";
import { formatEth } from "../format";
import { confirmKeyboard } from "../keyboards";
import { addressQrPng } from "../qr";

export const accountComposer = new Composer<MyContext>();

/** How long the exported-key message stays before the bot deletes it. */
const KEY_MESSAGE_TTL_MS = 60_000;

accountComposer.command("wallet", async (ctx) => {
  const user = ctx.user;
  if (!user) {
    await ctx.reply(ctx.t("notOnboarded"));
    return;
  }
  const net = ctx.services.config.networks[user.network];
  const explorerUrl = `${net.explorerBaseUrl}/address/${user.walletAddress}`;
  const text = ctx.t("walletInfo", user.walletAddress, net.label, explorerUrl);
  try {
    const qr = await addressQrPng(user.walletAddress);
    await ctx.replyWithPhoto(new InputFile(qr, "wallet-qr.png"), {
      caption: text,
      parse_mode: "HTML",
    });
  } catch (err) {
    console.error("wallet QR generation failed:", err);
    await ctx.reply(text, {
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
    });
  }
});

// ---- /exportkey — reveal the wallet private key (warned + auto-deleted) ----
accountComposer.command("exportkey", async (ctx) => {
  if (!ctx.user) {
    await ctx.reply(ctx.t("notOnboarded"));
    return;
  }
  if (!ctx.services.walletKeys.enabled) {
    await ctx.reply(ctx.t("keyTransferDisabled"));
    return;
  }
  const kb = new InlineKeyboard()
    .text(ctx.t("keyExportButton"), "key:exp")
    .row()
    .text(ctx.t("cancelButton"), "key:x");
  await ctx.reply(ctx.t("keyExportWarn"), {
    parse_mode: "HTML",
    reply_markup: kb,
  });
});

accountComposer.callbackQuery("key:exp", async (ctx) => {
  await ctx.answerCallbackQuery();
  const user = ctx.user;
  if (!user) return;
  await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => {});
  let key: string;
  try {
    key = await ctx.services.walletKeys.exportKey(user);
  } catch (err) {
    // A failed export never carries the key (it's only in a successful,
    // encrypted response), so the reason is safe to log and show.
    const reason = describeKeyOpError(err);
    console.error("exportKey failed:", reason);
    await ctx.reply(`${ctx.t("keyExportFailed")}\n\n(${reason})`);
    return;
  }
  const sent = await ctx.reply(ctx.t("keyExportCard", key), {
    parse_mode: "HTML",
  });
  // Self-destruct: delete the key message, then note it's gone.
  const chatId = sent.chat.id;
  const messageId = sent.message_id;
  setTimeout(() => {
    ctx.api
      .deleteMessage(chatId, messageId)
      .then(() => ctx.api.sendMessage(chatId, ctx.t("keyExportDeleted")))
      .catch(() => {});
  }, KEY_MESSAGE_TTL_MS);
});

// ---- /importkey — replace the bot wallet with an imported private key ----
accountComposer.command("importkey", async (ctx) => {
  if (!ctx.user) {
    await ctx.reply(ctx.t("notOnboarded"));
    return;
  }
  if (!ctx.services.walletKeys.enabled) {
    await ctx.reply(ctx.t("keyTransferDisabled"));
    return;
  }
  const kb = new InlineKeyboard()
    .text(ctx.t("keyImportButton"), "key:imp")
    .row()
    .text(ctx.t("cancelButton"), "key:x");
  await ctx.reply(ctx.t("keyImportWarn"), {
    parse_mode: "HTML",
    reply_markup: kb,
  });
});

accountComposer.callbackQuery("key:imp", async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!ctx.user) return;
  await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => {});
  ctx.session.flow = {
    type: "import_key",
    step: "enter_key",
  } as ImportKeyDraft;
  await ctx.reply(ctx.t("keyImportPrompt"));
});

accountComposer.callbackQuery("key:x", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => {});
  await ctx.reply(ctx.t("cancelled"));
});

accountComposer.command("faucet", async (ctx) => {
  const user = ctx.user;
  if (!user) {
    await ctx.reply(ctx.t("notOnboarded"));
    return;
  }
  try {
    const prepared = await ctx.services.faucet.prepareClaim(user);
    if (prepared.status === "wrong_network") {
      await ctx.reply(ctx.t("faucetOnlySepolia"));
      return;
    }
    if (prepared.status === "already_claimed") {
      await ctx.reply(ctx.t("faucetAlreadyClaimed"), { parse_mode: "HTML" });
      return;
    }
    if (prepared.status === "pending") {
      await ctx.reply(ctx.t("faucetPendingDistribution"));
      return;
    }
    if (prepared.status === "no_gas") {
      await ctx.reply(ctx.t("depositNoGas"), { parse_mode: "HTML" });
      return;
    }
    await ctx.reply(ctx.t("faucetIntro"), { parse_mode: "HTML" });
    await ctx.reply(
      ctx.t("faucetConfirmCard", formatEth(prepared.ethBalance)),
      {
        parse_mode: "HTML",
        reply_markup: confirmKeyboard(ctx.t, prepared.actionId),
      },
    );
  } catch (err) {
    console.error("/faucet failed:", err);
    await ctx.reply(ctx.t("errorGeneric"));
  }
});

accountComposer.command("balance", async (ctx) => {
  const user = ctx.user;
  if (!user) {
    await ctx.reply(ctx.t("notOnboarded"));
    return;
  }
  const net = ctx.services.config.networks[user.network];
  try {
    const summary = await ctx.services.accounts.getSummary(user);
    const lines: string[] = [
      ctx.t("balanceTitle", net.label),
      "",
      ctx.t("balanceNative", formatEth(summary.eth)),
      "",
    ];
    const nonZero = summary.tokens.filter((t) => !t.isZero);
    if (nonZero.length === 0) {
      lines.push(ctx.t("balanceEmpty"));
      if (user.network === "sepolia") {
        lines.push("", ctx.t("balanceEmptySepoliaHint"));
      }
    } else {
      // The faucet funds 100+ tokens at once; Telegram messages are capped
      // at 4096 chars, so show the most relevant rows and summarize the rest.
      const MAX_ROWS = 20;
      const shown = [...nonZero]
        .sort(
          (a, b) =>
            Number(b.vaultAvailable) - Number(a.vaultAvailable) ||
            Number(b.wallet) - Number(a.wallet) ||
            a.symbol.localeCompare(b.symbol),
        )
        .slice(0, MAX_ROWS);
      lines.push(ctx.t("balanceHeader"));
      for (const token of shown) {
        lines.push(
          ctx.t(
            "balanceRow",
            token.symbol,
            token.wallet,
            token.vaultAvailable,
            token.vaultFrozen,
          ),
        );
      }
      if (nonZero.length > shown.length) {
        lines.push("", ctx.t("balanceMore", nonZero.length - shown.length));
      }
      lines.push("", ctx.t("balanceVaultHint"));
    }
    await ctx.reply(lines.join("\n"), { parse_mode: "HTML" });
  } catch (err) {
    console.error("/balance failed:", err);
    await ctx.reply(ctx.t("errorGeneric"));
  }
});
