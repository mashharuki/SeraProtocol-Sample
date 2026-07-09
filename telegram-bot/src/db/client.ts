import { type Client, createClient } from "@libsql/client";

export type Db = Client;

export function createDb(url: string, authToken?: string): Db {
  return createClient({ url, authToken });
}
