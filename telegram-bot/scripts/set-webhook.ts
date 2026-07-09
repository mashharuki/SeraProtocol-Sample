/**
 * Register the Telegram webhook for production (webhook mode).
 *
 * Usage:
 *   TELEGRAM_BOT_TOKEN=... TELEGRAM_WEBHOOK_SECRET=... PUBLIC_URL=https://<cloud-run-url> \
 *     bun scripts/set-webhook.ts
 *
 * Pass DELETE=1 to remove the webhook (e.g. before switching back to polling).
 */

export {}; // top-level await requires module context

const token = process.env.TELEGRAM_BOT_TOKEN;
const publicUrl = process.env.PUBLIC_URL;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;

if (!token) {
  console.error("TELEGRAM_BOT_TOKEN is required");
  process.exit(1);
}

const api = `https://api.telegram.org/bot${token}`;

if (process.env.DELETE === "1") {
  const res = await fetch(`${api}/deleteWebhook`, { method: "POST" });
  console.log(await res.json());
  process.exit(0);
}

if (!publicUrl) {
  console.error("PUBLIC_URL is required (e.g. https://<service>.run.app)");
  process.exit(1);
}
if (!secret) {
  console.error(
    "TELEGRAM_WEBHOOK_SECRET is required in webhook mode (random string, also set on the server)",
  );
  process.exit(1);
}

const setRes = await fetch(`${api}/setWebhook`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    url: `${publicUrl.replace(/\/$/, "")}/telegram/webhook`,
    secret_token: secret,
    allowed_updates: ["message", "callback_query"],
    drop_pending_updates: true,
  }),
});
console.log("setWebhook:", await setRes.json());

const infoRes = await fetch(`${api}/getWebhookInfo`);
console.log("getWebhookInfo:", await infoRes.json());
