import type { Db } from "./client";

interface Migration {
  id: string;
  statements: string[];
}

const migrations: Migration[] = [
  {
    id: "001_init",
    statements: [
      `CREATE TABLE IF NOT EXISTS users (
        telegram_user_id INTEGER PRIMARY KEY,
        privy_user_id TEXT,
        wallet_id TEXT NOT NULL,
        wallet_address TEXT NOT NULL,
        language TEXT NOT NULL DEFAULT 'en' CHECK (language IN ('en','ja')),
        network TEXT NOT NULL DEFAULT 'sepolia' CHECK (network IN ('mainnet','sepolia')),
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS user_api_keys (
        telegram_user_id INTEGER NOT NULL REFERENCES users(telegram_user_id),
        network TEXT NOT NULL,
        api_key TEXT NOT NULL,
        api_secret TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (telegram_user_id, network)
      )`,
      `CREATE TABLE IF NOT EXISTS orders (
        order_id TEXT PRIMARY KEY,
        uuid_int TEXT NOT NULL,
        telegram_user_id INTEGER NOT NULL REFERENCES users(telegram_user_id),
        network TEXT NOT NULL,
        market TEXT NOT NULL,
        side TEXT NOT NULL CHECK (side IN ('bid','ask')),
        price TEXT NOT NULL,
        amount TEXT NOT NULL,
        status TEXT NOT NULL,
        placed_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_orders_user
        ON orders(telegram_user_id, network, status)`,
      `CREATE TABLE IF NOT EXISTS pending_actions (
        id TEXT PRIMARY KEY,
        telegram_user_id INTEGER NOT NULL,
        network TEXT NOT NULL,
        kind TEXT NOT NULL,
        payload TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        consumed_at INTEGER,
        created_at INTEGER NOT NULL
      )`,
    ],
  },
];

export async function migrate(db: Db): Promise<void> {
  await db.execute(
    `CREATE TABLE IF NOT EXISTS _migrations (
      id TEXT PRIMARY KEY, applied_at INTEGER NOT NULL
    )`,
  );
  const applied = await db.execute("SELECT id FROM _migrations");
  const appliedIds = new Set(applied.rows.map((r) => String(r.id)));
  for (const m of migrations) {
    if (appliedIds.has(m.id)) continue;
    for (const sql of m.statements) {
      await db.execute(sql);
    }
    await db.execute({
      sql: "INSERT INTO _migrations (id, applied_at) VALUES (?, ?)",
      args: [m.id, Date.now()],
    });
  }
}
