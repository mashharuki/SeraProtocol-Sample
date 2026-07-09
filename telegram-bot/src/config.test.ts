import { describe, expect, test } from "bun:test";
import { loadConfig } from "./config";

const required = {
  TELEGRAM_BOT_TOKEN: "123:abc",
  PRIVY_APP_ID: "app-id",
  PRIVY_APP_SECRET: "app-secret",
};

describe("loadConfig", () => {
  test("empty strings from a copied .env.example are treated as unset", () => {
    const config = loadConfig({
      ...required,
      // 未記入のまま残りがちな optional 値
      PUBLIC_URL: "",
      TELEGRAM_WEBHOOK_SECRET: "",
      ANTHROPIC_API_KEY: "",
      DATABASE_AUTH_TOKEN: "",
      DATABASE_URL: "",
      GCP_PROJECT_ID: "",
    });
    expect(config.publicUrl).toBeUndefined();
    expect(config.telegramWebhookSecret).toBeUndefined();
    expect(config.databaseUrl).toBe("file:./data/bot.db"); // default applies
    expect(config.botMode).toBe("polling");
    expect(config.defaultNetwork).toBe("sepolia");
  });

  test("missing required vars produce a readable error", () => {
    expect(() => loadConfig({})).toThrow(/TELEGRAM_BOT_TOKEN/);
  });

  test("valid PUBLIC_URL is preserved", () => {
    const config = loadConfig({
      ...required,
      PUBLIC_URL: "https://example.run.app",
    });
    expect(config.publicUrl).toBe("https://example.run.app");
  });

  test("invalid PUBLIC_URL still fails loudly", () => {
    expect(() => loadConfig({ ...required, PUBLIC_URL: "not-a-url" })).toThrow(
      /PUBLIC_URL/,
    );
  });
});
