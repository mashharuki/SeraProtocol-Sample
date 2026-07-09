import type { z } from "zod";
import { SeraApiError } from "./errors";
import {
  apiKeyCreateSchema,
  balancesResponseSchema,
  configSchema,
  fxRateSchema,
  healthSchema,
  marketsSchema,
  type OrderPreviewRequest,
  type OrderSubmitRequest,
  orderPreviewSchema,
  orderStatusSchema,
  orderSubmitResultSchema,
  type SeraBalanceRow,
  type SeraConfig,
  type SeraFxRate,
  type SeraMarket,
  type SeraOrderPreview,
  type SeraOrderStatus,
  type SeraSwapQuote,
  type SeraSwapResult,
  type SeraToken,
  type SwapQuoteRequest,
  swapQuoteSchema,
  swapResultSchema,
  systemTimeSchema,
  tokensSchema,
  txSendResultSchema,
  unsignedTxSchema,
} from "./types";

export interface SeraClientOptions {
  baseUrl: string;
  /** Per-user API key credentials for authenticated endpoints. */
  apiKey?: { key: string; secret: string };
  fetchImpl?: typeof fetch;
}

interface RequestOptions {
  method?: "GET" | "POST" | "DELETE";
  body?: unknown;
  auth?: boolean;
  query?: Record<string, string | number | boolean | undefined>;
}

/**
 * Thin typed client for the Sera REST API v2. One instance per
 * (network, user-credential) pair. Signing happens elsewhere (PrivySigner);
 * this class never touches private keys.
 */
export class SeraClient {
  private readonly baseUrl: string;
  private readonly apiKey?: { key: string; secret: string };
  private readonly fetchImpl: typeof fetch;
  private configCache?: { value: SeraConfig; fetchedAt: number };

  constructor(opts: SeraClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, "");
    this.apiKey = opts.apiKey;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  withApiKey(key: string, secret: string): SeraClient {
    return new SeraClient({
      baseUrl: this.baseUrl,
      apiKey: { key, secret },
      fetchImpl: this.fetchImpl,
    });
  }

  private async request<T>(
    path: string,
    schema: z.ZodType<T>,
    opts: RequestOptions = {},
  ): Promise<T> {
    const url = new URL(this.baseUrl + path);
    if (opts.query) {
      for (const [k, v] of Object.entries(opts.query)) {
        if (v !== undefined) url.searchParams.set(k, String(v));
      }
    }
    const headers: Record<string, string> = { accept: "application/json" };
    if (opts.body !== undefined) headers["content-type"] = "application/json";
    if (opts.auth) {
      if (!this.apiKey) {
        throw new SeraApiError(401, undefined, "API key not configured", path);
      }
      headers.authorization = `Bearer ${this.apiKey.key}:${this.apiKey.secret}`;
    }

    const res = await this.fetchImpl(url, {
      method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });

    const text = await res.text();
    let json: unknown;
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = { detail: text };
    }

    if (!res.ok) {
      const errBody = json as { detail?: unknown; error_code?: unknown };
      throw new SeraApiError(
        res.status,
        typeof errBody.error_code === "string" ? errBody.error_code : undefined,
        typeof errBody.detail === "string"
          ? errBody.detail
          : text.slice(0, 300),
        path,
      );
    }

    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      throw new SeraApiError(
        res.status,
        "SCHEMA_MISMATCH",
        `Unexpected response shape at ${path}: ${parsed.error.message.slice(0, 300)}`,
        path,
      );
    }
    return parsed.data;
  }

  // ---- public / system ----

  async health() {
    return this.request("/health", healthSchema);
  }

  /** Server unix time (seconds). Use before signing expirations. */
  async getSystemTime(): Promise<number> {
    const res = await this.request("/system/time", systemTimeSchema);
    return Math.floor(Number(res.timestamp));
  }

  async getTokens(): Promise<SeraToken[]> {
    return (await this.request("/tokens", tokensSchema)).tokens;
  }

  async getMarkets(): Promise<SeraMarket[]> {
    return (await this.request("/markets", marketsSchema)).markets;
  }

  async getFxRate(base: string, quote: string): Promise<SeraFxRate> {
    return this.request("/fx/rate", fxRateSchema, { query: { base, quote } });
  }

  /** Chain id, contract addresses, EIP-712 domain. Cached for 10 minutes. */
  async getConfig(): Promise<SeraConfig> {
    const now = Date.now();
    if (this.configCache && now - this.configCache.fetchedAt < 600_000) {
      return this.configCache.value;
    }
    const value = await this.request("/config", configSchema);
    this.configCache = { value, fetchedAt: now };
    return value;
  }

  // ---- api keys ----

  /**
   * Create an API key for a wallet. Body shape verified live 2026-07-09:
   * exactly {owner_address, action, timestamp, signature} — extra fields
   * (e.g. a label) are rejected with 422. api_secret is returned only once.
   */
  async createApiKey(payload: {
    owner_address: string;
    action: "create";
    timestamp: number;
    signature: string;
  }): Promise<{ api_key: string; api_secret: string }> {
    return this.request("/api-keys", apiKeyCreateSchema, { body: payload });
  }

  // ---- balances ----

  /** ownerAddress is lowercased internally (read endpoints are case-sensitive). */
  async getBalances(ownerAddress: string): Promise<SeraBalanceRow[]> {
    const res = await this.request("/balances", balancesResponseSchema, {
      auth: true,
      query: { owner_address: ownerAddress.toLowerCase() },
    });
    return res.balances;
  }

  // ---- swap ----

  async swapQuote(req: SwapQuoteRequest): Promise<SeraSwapQuote> {
    return this.request("/swap/quote", swapQuoteSchema, { body: req });
  }

  async submitSwap(body: {
    uuid: string;
    signature: string;
    permit_signature?: string;
    permit_deadline?: number;
  }): Promise<SeraSwapResult> {
    return this.request("/swap", swapResultSchema, { body });
  }

  // ---- limit orders ----

  async previewOrder(req: OrderPreviewRequest): Promise<SeraOrderPreview> {
    return this.request("/orders/preview", orderPreviewSchema, { body: req });
  }

  async submitOrder(req: OrderSubmitRequest): Promise<{ order_id: string }> {
    return this.request("/orders", orderSubmitResultSchema, { body: req });
  }

  async getOrder(orderId: string): Promise<SeraOrderStatus> {
    return this.request(`/orders/${orderId}`, orderStatusSchema, {
      auth: true,
    });
  }

  async cancelOrder(body: {
    owner_address: string;
    order_id: string;
    uuid_int: string;
    signature: string;
  }): Promise<void> {
    await this.request("/orders/cancel", orderPreviewSchema, { body });
  }

  // ---- deposits (unsigned tx builders + broadcast) ----

  async buildApprove(body: {
    token: string;
    owner: string;
    spender: string;
    amount: string;
  }): Promise<Record<string, unknown>> {
    return (
      await this.request("/approve", unsignedTxSchema, { auth: true, body })
    ).tx;
  }

  async buildDeposit(body: {
    token: string;
    owner: string;
    amount: string;
    permit_signature?: string;
    permit_deadline?: number;
    permit_amount?: string;
  }): Promise<Record<string, unknown>> {
    return (
      await this.request("/deposit", unsignedTxSchema, { auth: true, body })
    ).tx;
  }

  async sendTx(rawTx: string): Promise<string> {
    const res = await this.request("/tx/send", txSendResultSchema, {
      auth: true,
      body: { raw_tx: rawTx },
    });
    return res.tx_hash;
  }
}
