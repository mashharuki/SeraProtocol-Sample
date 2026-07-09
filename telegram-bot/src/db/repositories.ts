import type { Language, Network } from "../config";
import type { Db } from "./client";

export interface UserRow {
  telegramUserId: number;
  privyUserId: string | null;
  walletId: string;
  walletAddress: string;
  language: Language;
  network: Network;
}

export interface ApiKeyRow {
  apiKey: string;
  apiSecret: string;
}

export interface OrderRow {
  orderId: string;
  uuidInt: string;
  telegramUserId: number;
  network: Network;
  market: string;
  side: "bid" | "ask";
  price: string;
  amount: string;
  status: string;
  placedAt: number;
}

export type PendingActionKind =
  | "swap"
  | "send"
  | "limit_order"
  | "cancel_order"
  | "deposit";

export interface PendingActionRow {
  id: string;
  telegramUserId: number;
  network: Network;
  kind: PendingActionKind;
  payload: string;
  expiresAt: number;
  consumedAt: number | null;
}

export class UserRepository {
  constructor(private db: Db) {}

  async find(telegramUserId: number): Promise<UserRow | null> {
    const res = await this.db.execute({
      sql: "SELECT * FROM users WHERE telegram_user_id = ?",
      args: [telegramUserId],
    });
    const r = res.rows[0];
    if (!r) return null;
    return {
      telegramUserId: Number(r.telegram_user_id),
      privyUserId: r.privy_user_id === null ? null : String(r.privy_user_id),
      walletId: String(r.wallet_id),
      walletAddress: String(r.wallet_address),
      language: String(r.language) as Language,
      network: String(r.network) as Network,
    };
  }

  async create(user: UserRow): Promise<void> {
    const now = Date.now();
    await this.db.execute({
      sql: `INSERT INTO users
        (telegram_user_id, privy_user_id, wallet_id, wallet_address, language, network, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        user.telegramUserId,
        user.privyUserId,
        user.walletId,
        user.walletAddress,
        user.language,
        user.network,
        now,
        now,
      ],
    });
  }

  async setLanguage(telegramUserId: number, language: Language): Promise<void> {
    await this.db.execute({
      sql: "UPDATE users SET language = ?, updated_at = ? WHERE telegram_user_id = ?",
      args: [language, Date.now(), telegramUserId],
    });
  }

  async setNetwork(telegramUserId: number, network: Network): Promise<void> {
    await this.db.execute({
      sql: "UPDATE users SET network = ?, updated_at = ? WHERE telegram_user_id = ?",
      args: [network, Date.now(), telegramUserId],
    });
  }
}

export class ApiKeyRepository {
  constructor(private db: Db) {}

  async find(
    telegramUserId: number,
    network: Network,
  ): Promise<ApiKeyRow | null> {
    const res = await this.db.execute({
      sql: "SELECT api_key, api_secret FROM user_api_keys WHERE telegram_user_id = ? AND network = ?",
      args: [telegramUserId, network],
    });
    const r = res.rows[0];
    if (!r) return null;
    return { apiKey: String(r.api_key), apiSecret: String(r.api_secret) };
  }

  async save(
    telegramUserId: number,
    network: Network,
    key: ApiKeyRow,
  ): Promise<void> {
    await this.db.execute({
      sql: `INSERT INTO user_api_keys (telegram_user_id, network, api_key, api_secret, created_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT (telegram_user_id, network)
        DO UPDATE SET api_key = excluded.api_key, api_secret = excluded.api_secret`,
      args: [telegramUserId, network, key.apiKey, key.apiSecret, Date.now()],
    });
  }
}

export class OrderRepository {
  constructor(private db: Db) {}

  async save(order: OrderRow): Promise<void> {
    await this.db.execute({
      sql: `INSERT INTO orders
        (order_id, uuid_int, telegram_user_id, network, market, side, price, amount, status, placed_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (order_id) DO UPDATE SET status = excluded.status, updated_at = excluded.updated_at`,
      args: [
        order.orderId,
        order.uuidInt,
        order.telegramUserId,
        order.network,
        order.market,
        order.side,
        order.price,
        order.amount,
        order.status,
        order.placedAt,
        Date.now(),
      ],
    });
  }

  async updateStatus(orderId: string, status: string): Promise<void> {
    await this.db.execute({
      sql: "UPDATE orders SET status = ?, updated_at = ? WHERE order_id = ?",
      args: [status, Date.now(), orderId],
    });
  }

  async find(orderId: string): Promise<OrderRow | null> {
    const res = await this.db.execute({
      sql: "SELECT * FROM orders WHERE order_id = ?",
      args: [orderId],
    });
    const r = res.rows[0];
    return r ? this.rowToOrder(r) : null;
  }

  async listActive(
    telegramUserId: number,
    network: Network,
    limit = 10,
  ): Promise<OrderRow[]> {
    const res = await this.db.execute({
      sql: `SELECT * FROM orders
        WHERE telegram_user_id = ? AND network = ?
        ORDER BY placed_at DESC LIMIT ?`,
      args: [telegramUserId, network, limit],
    });
    return res.rows.map((r) => this.rowToOrder(r));
  }

  private rowToOrder(r: Record<string, unknown>): OrderRow {
    return {
      orderId: String(r.order_id),
      uuidInt: String(r.uuid_int),
      telegramUserId: Number(r.telegram_user_id),
      network: String(r.network) as Network,
      market: String(r.market),
      side: String(r.side) as "bid" | "ask",
      price: String(r.price),
      amount: String(r.amount),
      status: String(r.status),
      placedAt: Number(r.placed_at),
    };
  }
}

export class PendingActionRepository {
  constructor(private db: Db) {}

  async create(action: Omit<PendingActionRow, "consumedAt">): Promise<void> {
    await this.db.execute({
      sql: `INSERT INTO pending_actions
        (id, telegram_user_id, network, kind, payload, expires_at, consumed_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, NULL, ?)`,
      args: [
        action.id,
        action.telegramUserId,
        action.network,
        action.kind,
        action.payload,
        action.expiresAt,
        Date.now(),
      ],
    });
  }

  async find(id: string): Promise<PendingActionRow | null> {
    const res = await this.db.execute({
      sql: "SELECT * FROM pending_actions WHERE id = ?",
      args: [id],
    });
    const r = res.rows[0];
    if (!r) return null;
    return {
      id: String(r.id),
      telegramUserId: Number(r.telegram_user_id),
      network: String(r.network) as Network,
      kind: String(r.kind) as PendingActionKind,
      payload: String(r.payload),
      expiresAt: Number(r.expires_at),
      consumedAt: r.consumed_at === null ? null : Number(r.consumed_at),
    };
  }

  /**
   * Atomically mark the action consumed. Returns false if it was already
   * consumed (single-use guarantee even under double-tap).
   */
  async consume(id: string): Promise<boolean> {
    const res = await this.db.execute({
      sql: "UPDATE pending_actions SET consumed_at = ? WHERE id = ? AND consumed_at IS NULL",
      args: [Date.now(), id],
    });
    return res.rowsAffected > 0;
  }

  async markCancelled(id: string): Promise<void> {
    await this.consume(id);
  }
}
