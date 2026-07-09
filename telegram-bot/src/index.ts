import { webhookCallback } from "grammy";
import { Hono } from "hono";
import { createApiApp } from "./api";
import { createBot, setBotCommands } from "./bot/bot";
import { loadConfig } from "./config";
import { createDb } from "./db/client";
import { migrate } from "./db/migrate";
import { buildServices, registerServices } from "./services";

const config = loadConfig();

const db = createDb(config.databaseUrl, config.databaseAuthToken);
await migrate(db);

const services = buildServices(config, db);
registerServices(services); // makes services reachable from Mastra tools

const bot = createBot(services);

const app = new Hono();

// /health, /api/*, /openapi.json, /docs (Swagger UI)
app.route("/", createApiApp(services));

if (config.botMode === "webhook") {
  app.post(
    "/telegram/webhook",
    webhookCallback(bot, "hono", {
      secretToken: config.telegramWebhookSecret,
    }),
  );
  await bot.init();
  await setBotCommands(bot);
  console.log(`Webhook mode: POST /telegram/webhook (port ${config.port})`);
} else {
  // Long polling for local development. A failure here (bad token,
  // Telegram outage) must not kill the HTTP server / Swagger UI.
  void bot
    .start({
      onStart: async (me) => {
        await setBotCommands(bot);
        console.log(`Polling mode: started as @${me.username}`);
      },
    })
    .catch((err) => {
      console.error("Telegram polling failed to start:", err);
    });
}

export default {
  port: config.port,
  fetch: app.fetch,
};
