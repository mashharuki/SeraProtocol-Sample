import { randomBytes } from "node:crypto";
import type { Network } from "../config";
import type {
  PendingActionKind,
  PendingActionRepository,
  PendingActionRow,
} from "../db/repositories";

export type ConsumeResult<T> =
  | { status: "ok"; payload: T; row: PendingActionRow }
  | { status: "expired" }
  | { status: "already_used" }
  | { status: "not_found" }
  | { status: "wrong_user" };

/**
 * Confirmation-card actions. Every money-moving flow creates a row here,
 * shows a card, and only the button tap consumes it (single-use, TTL-bound).
 */
export class PendingActionService {
  constructor(private repo: PendingActionRepository) {}

  /** Short URL-safe id — fits Telegram's 64-byte callback_data limit. */
  private newId(): string {
    return randomBytes(9).toString("base64url");
  }

  async create(params: {
    telegramUserId: number;
    network: Network;
    kind: PendingActionKind;
    payload: unknown;
    expiresAt: number;
  }): Promise<string> {
    const id = this.newId();
    await this.repo.create({
      id,
      telegramUserId: params.telegramUserId,
      network: params.network,
      kind: params.kind,
      payload: JSON.stringify(params.payload),
      expiresAt: params.expiresAt,
    });
    return id;
  }

  async peek(id: string): Promise<PendingActionRow | null> {
    return this.repo.find(id);
  }

  async consume<T>(
    id: string,
    telegramUserId: number,
  ): Promise<ConsumeResult<T>> {
    const row = await this.repo.find(id);
    if (!row) return { status: "not_found" };
    if (row.telegramUserId !== telegramUserId) return { status: "wrong_user" };
    if (row.consumedAt !== null) return { status: "already_used" };
    if (row.expiresAt < Date.now()) return { status: "expired" };
    const won = await this.repo.consume(id);
    if (!won) return { status: "already_used" };
    return { status: "ok", payload: JSON.parse(row.payload) as T, row };
  }

  async cancel(id: string): Promise<void> {
    await this.repo.markCancelled(id);
  }
}
