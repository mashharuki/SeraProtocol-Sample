import { privateKeyToAccount } from "viem/accounts";
import type {
  ApiKeyRepository,
  UserRepository,
  UserRow,
} from "../db/repositories";
import type { PrivySigner } from "../privy/signer";

export type ImportResult =
  | { ok: true; address: string }
  | { ok: false; reason: "invalid_key" };

/**
 * Wallet private-key export/import via Privy's high-level API (HPKE handled
 * inside the SDK). Export returns the plaintext key for the caller to
 * display+auto-delete. Import validates the key, imports it to Privy as a new
 * server wallet owned by the app auth key, and atomically repoints the user at
 * it (clearing the old Sera API keys so they re-mint for the new address).
 *
 * Requires the app wallet-owner auth key (`config.walletAuth`); when it's not
 * configured, `enabled` is false and the bot tells the user the feature is off.
 *
 * SECURITY: never persist/log the private key. Failures are safe to surface
 * via `describeKeyOpError` (they never carry the plaintext key).
 */
export class WalletKeyService {
  constructor(
    private signer: PrivySigner,
    private users: UserRepository,
    private apiKeys: ApiKeyRepository,
  ) {}

  /** Whether key export/import is available (app auth key configured). */
  get enabled(): boolean {
    return this.signer.keyTransferEnabled;
  }

  async exportKey(user: UserRow): Promise<string> {
    return this.signer.exportPrivateKey(user.walletId);
  }

  async importKey(user: UserRow, rawKey: string): Promise<ImportResult> {
    const hex = normalizePrivateKey(rawKey);
    let address: string;
    try {
      address = privateKeyToAccount(hex as `0x${string}`).address;
    } catch {
      return { ok: false, reason: "invalid_key" };
    }

    const wallet = await this.signer.importPrivateKey({
      address,
      privateKeyHex: hex,
      telegramUserId: user.telegramUserId,
    });
    await this.users.replaceWallet(user.telegramUserId, {
      walletId: wallet.walletId,
      walletAddress: wallet.address,
    });
    await this.apiKeys.deleteAll(user.telegramUserId);
    return { ok: true, address: wallet.address };
  }
}

/** Trim, add 0x if missing. Shape (32-byte hex) is validated by viem. */
function normalizePrivateKey(raw: string): string {
  const t = raw.trim();
  return t.startsWith("0x") ? t : `0x${t}`;
}
