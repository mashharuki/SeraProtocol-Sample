import type { Language, Network } from "../config";
import type {
  ApiKeyRepository,
  UserRepository,
  UserRow,
} from "../db/repositories";
import type { PrivySigner } from "../privy/signer";
import type { SeraClient } from "../sera/client";

export class UserService {
  constructor(
    private users: UserRepository,
    private apiKeys: ApiKeyRepository,
    private signer: PrivySigner,
    private publicSera: (network: Network) => SeraClient,
    private defaultNetwork: Network,
  ) {}

  async find(telegramUserId: number): Promise<UserRow | null> {
    return this.users.find(telegramUserId);
  }

  /** Onboarding: create Privy wallet + user row. Idempotent per user. */
  async ensureWallet(
    telegramUserId: number,
    language: Language,
  ): Promise<UserRow> {
    const existing = await this.users.find(telegramUserId);
    if (existing) return existing;
    const wallet = await this.signer.createWallet(telegramUserId);
    const user: UserRow = {
      telegramUserId,
      privyUserId: null,
      walletId: wallet.walletId,
      walletAddress: wallet.address,
      language,
      network: this.defaultNetwork,
    };
    await this.users.create(user);
    return user;
  }

  /**
   * Ensure the user has a Sera API key for their current network:
   * sign EIP-712 ManageApiKey with the Privy wallet, POST /api-keys,
   * store the one-time secret.
   *
   * Struct and body verified live on api-testnet.sera.cx (2026-07-09):
   * sign ManageApiKey {owner: address, action: string, timestamp: uint256},
   * submit {owner_address, action, timestamp, signature}.
   */
  async ensureApiKey(user: UserRow): Promise<{ key: string; secret: string }> {
    const existing = await this.apiKeys.find(user.telegramUserId, user.network);
    if (existing) return { key: existing.apiKey, secret: existing.apiSecret };

    const sera = this.publicSera(user.network);
    const [config, serverTime] = await Promise.all([
      sera.getConfig(),
      sera.getSystemTime(),
    ]);

    const signature = await this.signer.signTypedData(user.walletId, {
      domain: config.eip712_domain as unknown as Record<string, unknown>,
      types: {
        ManageApiKey: [
          { name: "owner", type: "address" },
          { name: "action", type: "string" },
          { name: "timestamp", type: "uint256" },
        ],
      },
      primaryType: "ManageApiKey",
      message: {
        owner: user.walletAddress,
        action: "create",
        timestamp: serverTime,
      },
    });

    const created = await sera.createApiKey({
      owner_address: user.walletAddress,
      action: "create",
      timestamp: serverTime,
      signature,
    });
    await this.apiKeys.save(user.telegramUserId, user.network, {
      apiKey: created.api_key,
      apiSecret: created.api_secret,
    });
    return { key: created.api_key, secret: created.api_secret };
  }

  async setLanguage(telegramUserId: number, language: Language): Promise<void> {
    await this.users.setLanguage(telegramUserId, language);
  }

  async setNetwork(telegramUserId: number, network: Network): Promise<void> {
    await this.users.setNetwork(telegramUserId, network);
  }
}
