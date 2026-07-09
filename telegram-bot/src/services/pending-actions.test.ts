import { describe, expect, test } from "bun:test";
import { createDb } from "../db/client";
import { migrate } from "../db/migrate";
import { PendingActionRepository } from "../db/repositories";
import { PendingActionService } from "./pending-actions";

async function makeService() {
  const db = createDb(":memory:");
  await migrate(db);
  return new PendingActionService(new PendingActionRepository(db));
}

describe("PendingActionService", () => {
  test("action ids fit Telegram's 64-byte callback_data limit", async () => {
    const svc = await makeService();
    const id = await svc.create({
      telegramUserId: 1,
      network: "sepolia",
      kind: "swap",
      payload: { hello: "world" },
      expiresAt: Date.now() + 60_000,
    });
    expect(Buffer.byteLength(`act:c:${id}`)).toBeLessThanOrEqual(64);
  });

  test("consume returns payload once, then already_used", async () => {
    const svc = await makeService();
    const id = await svc.create({
      telegramUserId: 42,
      network: "sepolia",
      kind: "swap",
      payload: { uuid: "q-1" },
      expiresAt: Date.now() + 60_000,
    });
    const first = await svc.consume<{ uuid: string }>(id, 42);
    expect(first.status).toBe("ok");
    if (first.status === "ok") expect(first.payload.uuid).toBe("q-1");
    const second = await svc.consume(id, 42);
    expect(second.status).toBe("already_used");
  });

  test("expired actions cannot be consumed", async () => {
    const svc = await makeService();
    const id = await svc.create({
      telegramUserId: 42,
      network: "sepolia",
      kind: "swap",
      payload: {},
      expiresAt: Date.now() - 1,
    });
    const res = await svc.consume(id, 42);
    expect(res.status).toBe("expired");
  });

  test("another user's confirm is rejected", async () => {
    const svc = await makeService();
    const id = await svc.create({
      telegramUserId: 42,
      network: "sepolia",
      kind: "swap",
      payload: {},
      expiresAt: Date.now() + 60_000,
    });
    const res = await svc.consume(id, 43);
    expect(res.status).toBe("wrong_user");
  });

  test("cancelled actions become already_used", async () => {
    const svc = await makeService();
    const id = await svc.create({
      telegramUserId: 42,
      network: "sepolia",
      kind: "deposit",
      payload: {},
      expiresAt: Date.now() + 60_000,
    });
    await svc.cancel(id);
    const res = await svc.consume(id, 42);
    expect(res.status).toBe("already_used");
  });

  test("unknown id → not_found", async () => {
    const svc = await makeService();
    const res = await svc.consume("nope", 42);
    expect(res.status).toBe("not_found");
  });
});
