import { Composer } from "grammy";
import type { MyContext } from "../context";
import { formatEth } from "../format";

export const accountComposer = new Composer<MyContext>();

accountComposer.command("wallet", async (ctx) => {
  const user = ctx.user;
  if (!user) {
    await ctx.reply(ctx.t("notOnboarded"));
    return;
  }
  const net = ctx.services.config.networks[user.network];
  const explorerUrl = `${net.explorerBaseUrl}/address/${user.walletAddress}`;
  await ctx.reply(
    ctx.t("walletInfo", user.walletAddress, net.label, explorerUrl),
    {
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
    },
  );
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
    } else {
      lines.push(ctx.t("balanceHeader"));
      for (const token of nonZero) {
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
      lines.push("", ctx.t("balanceVaultHint"));
    }
    await ctx.reply(lines.join("\n"), { parse_mode: "HTML" });
  } catch (err) {
    console.error("/balance failed:", err);
    await ctx.reply(ctx.t("errorGeneric"));
  }
});
