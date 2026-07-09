import { z } from "zod";

export type Network = "mainnet" | "sepolia";
export type Language = "en" | "ja";

export interface NetworkConfig {
  /** Sera REST API v2 base URL, e.g. https://api.sera.cx/api/v1 */
  seraBaseUrl: string;
  /** JSON-RPC endpoint used for native ETH balance reads */
  rpcUrl: string;
  chainId: number;
  explorerBaseUrl: string;
  /** Human label shown in UI badges */
  label: string;
}

const envSchema = z.object({
  TELEGRAM_BOT_TOKEN: z.string().min(1, "TELEGRAM_BOT_TOKEN is required"),
  TELEGRAM_WEBHOOK_SECRET: z.string().optional(),
  BOT_MODE: z.enum(["polling", "webhook"]).default("polling"),
  PUBLIC_URL: z.string().url().optional(),
  PORT: z.coerce.number().int().positive().default(3000),
  ANTHROPIC_API_KEY: z.string().optional(),
  PRIVY_APP_ID: z.string().min(1, "PRIVY_APP_ID is required"),
  PRIVY_APP_SECRET: z.string().min(1, "PRIVY_APP_SECRET is required"),
  DATABASE_URL: z.string().default("file:./data/bot.db"),
  DATABASE_AUTH_TOKEN: z.string().optional(),
  RPC_URL_MAINNET: z.string().url().default("https://eth.drpc.org"),
  RPC_URL_SEPOLIA: z.string().url().default("https://0xrpc.io/sep"),
  SERA_API_URL_MAINNET: z.string().url().default("https://api.sera.cx/api/v1"),
  SERA_API_URL_SEPOLIA: z
    .string()
    .url()
    .default("https://api-testnet.sera.cx/api/v1"),
  DEFAULT_NETWORK: z.enum(["mainnet", "sepolia"]).default("sepolia"),
});

export interface AppConfig {
  telegramBotToken: string;
  telegramWebhookSecret?: string;
  botMode: "polling" | "webhook";
  publicUrl?: string;
  port: number;
  privyAppId: string;
  privyAppSecret: string;
  databaseUrl: string;
  databaseAuthToken?: string;
  defaultNetwork: Network;
  networks: Record<Network, NetworkConfig>;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  // .env.example をコピーした直後の `KEY=`（空文字列）は「未設定」として扱い、
  // optional / default を正しく効かせる
  const cleaned = Object.fromEntries(
    Object.entries(env).filter(([, v]) => v !== undefined && v !== ""),
  );
  const parsed = envSchema.safeParse(cleaned);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  const e = parsed.data;
  return {
    telegramBotToken: e.TELEGRAM_BOT_TOKEN,
    telegramWebhookSecret: e.TELEGRAM_WEBHOOK_SECRET,
    botMode: e.BOT_MODE,
    publicUrl: e.PUBLIC_URL,
    port: e.PORT,
    privyAppId: e.PRIVY_APP_ID,
    privyAppSecret: e.PRIVY_APP_SECRET,
    databaseUrl: e.DATABASE_URL,
    databaseAuthToken: e.DATABASE_AUTH_TOKEN,
    defaultNetwork: e.DEFAULT_NETWORK,
    networks: {
      mainnet: {
        seraBaseUrl: e.SERA_API_URL_MAINNET,
        rpcUrl: e.RPC_URL_MAINNET,
        chainId: 1,
        explorerBaseUrl: "https://etherscan.io",
        label: "Ethereum Mainnet",
      },
      sepolia: {
        seraBaseUrl: e.SERA_API_URL_SEPOLIA,
        rpcUrl: e.RPC_URL_SEPOLIA,
        chainId: 11155111,
        explorerBaseUrl: "https://sepolia.etherscan.io",
        label: "Sepolia Testnet",
      },
    },
  };
}
