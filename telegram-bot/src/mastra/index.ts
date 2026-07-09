import { Mastra } from "@mastra/core/mastra";
import { LibSQLStore } from "@mastra/libsql";
import { PinoLogger } from "@mastra/loggers";
import { seraFxAgent } from "./agents/sera-fx-agent";

export const mastra = new Mastra({
  agents: { seraFxAgent },
  storage: new LibSQLStore({
    id: "mastra-storage",
    url: process.env.DATABASE_URL ?? "file:./data/bot.db",
    authToken: process.env.DATABASE_AUTH_TOKEN,
  }),
  logger: new PinoLogger({
    name: "Mastra",
    level: "info",
  }),
});
