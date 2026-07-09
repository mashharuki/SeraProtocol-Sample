import { PrivyClient } from "@privy-io/node";

export function createPrivyClient(
  appId: string,
  appSecret: string,
): PrivyClient {
  return new PrivyClient({ appId, appSecret });
}

export type { PrivyClient };
