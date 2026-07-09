import type { RequestContext } from "@mastra/core/request-context";
import type { UserRow } from "../../db/repositories";
import { getServices, type Services } from "../../services";

/**
 * Identity comes from requestContext (set by the bot layer), never from
 * model-provided arguments — a prompt-injected user id must not work.
 */
export interface AgentIdentity {
  telegramUserId: number;
  language: "en" | "ja";
}

/** Confirmation cards produced by prepare-* tools during one agent turn. */
export interface PendingCard {
  kind: "swap" | "send" | "limit_order";
  actionId: string;
  card: Record<string, unknown>;
}

export function getIdentity(
  rc: RequestContext | undefined,
): AgentIdentity | null {
  const telegramUserId = rc?.get("telegramUserId");
  const language = rc?.get("language");
  if (typeof telegramUserId !== "number") return null;
  return {
    telegramUserId,
    language: language === "ja" ? "ja" : "en",
  };
}

export function getCardCollector(
  rc: RequestContext | undefined,
): PendingCard[] | null {
  const collector = rc?.get("pendingCards");
  return Array.isArray(collector) ? (collector as PendingCard[]) : null;
}

export async function requireUser(
  rc: RequestContext | undefined,
): Promise<{ services: Services; user: UserRow } | { error: string }> {
  const identity = getIdentity(rc);
  if (!identity) return { error: "No authenticated user in this session." };
  const services = getServices();
  const user = await services.users.find(identity.telegramUserId);
  if (!user) {
    return {
      error:
        "The user has not created a wallet yet. Tell them to run /start first.",
    };
  }
  return { services, user };
}
