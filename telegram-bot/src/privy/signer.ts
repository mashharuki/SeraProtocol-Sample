import type { PrivyClient } from "@privy-io/node";

export interface CreatedWallet {
  walletId: string;
  address: string;
}

/** App-held P-256 authorization key that owns the server wallets (both base64). */
export interface WalletAuthKey {
  privateKeyPkcs8: string;
  publicKeySpki: string;
}

/**
 * Safe one-line summary of a key export/import failure. A FAILED export/import
 * never carries the plaintext private key (the key is only ever in the
 * successful response, or in local memory we never log), so surfacing
 * status + message here is safe and diagnosable.
 */
export function describeKeyOpError(err: unknown): string {
  const e = err as {
    status?: number;
    message?: string;
    error?: { message?: string; code?: string } | string;
  };
  const status = e?.status ? `[${e.status}] ` : "";
  const detail =
    (typeof e?.error === "object" ? e.error?.message : e?.error) ??
    e?.message ??
    String(err);
  return `${status}${String(detail).slice(0, 200)}`;
}

/** The 401 Privy returns when a wallet has no owner to authorize the action. */
function isNeedsOwnerError(err: unknown): boolean {
  const e = err as { status?: number; error?: { error?: string } | string };
  if (e?.status !== 401) return false;
  const msg =
    typeof e.error === "object"
      ? (e.error?.error ?? "")
      : String(e.error ?? "");
  return /must have an owner/i.test(`${msg}${describeKeyOpError(err)}`);
}

/**
 * EIP-712 typed data in the wire format Sera returns (viem-style camelCase).
 * Passed through verbatim — never reconstructed client-side.
 */
export interface SeraTypedDataPayload {
  domain: Record<string, unknown>;
  types: Record<string, unknown>;
  primaryType: string;
  message: Record<string, unknown>;
}

/**
 * All private-key operations go through Privy server wallets. This class is
 * the only place in the codebase that requests signatures.
 */
export class PrivySigner {
  /**
   * `walletAuth` is the app-held P-256 key that owns server wallets. When
   * present, wallets are created owned by it so their keys can be exported;
   * app-secret signing still works on owned wallets (verified live 2026-07-11),
   * so the rest of the signing path is unchanged. When absent, wallets are
   * owner-less and key export/import are unavailable.
   */
  constructor(
    private readonly privy: PrivyClient,
    private readonly walletAuth?: WalletAuthKey,
  ) {}

  /** True when /exportkey and /importkey are usable (auth key configured). */
  get keyTransferEnabled(): boolean {
    return !!this.walletAuth;
  }

  private authContext() {
    if (!this.walletAuth) throw new Error("Wallet auth key not configured");
    return { authorization_private_keys: [this.walletAuth.privateKeyPkcs8] };
  }

  /**
   * Create (or idempotently re-create) an Ethereum wallet for a Telegram
   * user. The idempotency key makes double-taps and retries safe within
   * Privy's 24h window; external_id gives a durable reverse mapping. When an
   * auth key is configured, the wallet is owned by it (so it's exportable).
   */
  async createWallet(telegramUserId: number): Promise<CreatedWallet> {
    const externalId = `tg-${telegramUserId}`;
    const wallet = await this.privy.wallets().create({
      chain_type: "ethereum",
      external_id: externalId,
      display_name: `Telegram user ${telegramUserId}`,
      idempotency_key: `create-${externalId}`,
      ...(this.walletAuth
        ? { owner: { public_key: this.walletAuth.publicKeySpki } }
        : {}),
    });
    return { walletId: wallet.id, address: wallet.address };
  }

  /**
   * Export a wallet's private key via Privy's high-level export (HPKE handled
   * inside the SDK; the key is never returned in plaintext over the wire).
   * Requires the wallet to be owned by our auth key — older owner-less wallets
   * are adopted via `update()` first. Returns a 0x-prefixed private key; the
   * caller must show it safely and never persist/log it.
   */
  async exportPrivateKey(walletId: string): Promise<string> {
    if (!this.walletAuth) throw new Error("Wallet auth key not configured");
    let res: { private_key: string };
    try {
      res = (await this.privy.wallets().exportPrivateKey(walletId, {
        authorization_context: this.authContext(),
      })) as { private_key: string };
    } catch (err) {
      // Older wallets were created owner-less; adopt them with our owner key,
      // then export. Only retry on the specific "needs an owner" failure.
      if (!isNeedsOwnerError(err)) throw err;
      await this.privy.wallets().update(walletId, {
        owner: { public_key: this.walletAuth.publicKeySpki },
      });
      res = (await this.privy.wallets().exportPrivateKey(walletId, {
        authorization_context: this.authContext(),
      })) as { private_key: string };
    }
    const pk = res.private_key;
    return pk.startsWith("0x") ? pk : `0x${pk}`;
  }

  /**
   * Import an external Ethereum private key as a new Privy server wallet,
   * owned by our auth key (HPKE handled inside the SDK). Returns the new
   * wallet id + address.
   */
  async importPrivateKey(args: {
    address: string;
    privateKeyHex: string;
    telegramUserId: number;
  }): Promise<CreatedWallet> {
    if (!this.walletAuth) throw new Error("Wallet auth key not configured");
    const wallet = await this.privy.wallets().import({
      wallet: {
        address: args.address,
        chain_type: "ethereum",
        entropy_type: "private-key",
        private_key: args.privateKeyHex,
      },
      owner: { public_key: this.walletAuth.publicKeySpki },
      external_id: `tg-${args.telegramUserId}-${Date.now()}`,
      display_name: `Telegram user ${args.telegramUserId} (imported)`,
    });
    return { walletId: wallet.id, address: wallet.address };
  }

  /** Sign EIP-712 typed data (Sera Intent / Order / CancelOrder / ManageApiKey). */
  async signTypedData(
    walletId: string,
    typedData: SeraTypedDataPayload,
  ): Promise<string> {
    const res = await this.privy
      .wallets()
      .ethereum()
      .signTypedData(walletId, {
        params: {
          typed_data: {
            // Privy expects snake_case primary_type; everything else passes through.
            domain: typedData.domain as never,
            types: typedData.types as never,
            primary_type: typedData.primaryType,
            message: typedData.message,
          },
        },
      });
    if (!res.signature) {
      throw new Error("Privy signTypedData returned no signature");
    }
    return res.signature;
  }

  /**
   * Sign a raw transaction (deposit/approve path). `tx` is the unsigned tx
   * from Sera's builder endpoints, normalized to Privy's field names by the
   * caller. Returns the RLP-encoded signed transaction hex.
   */
  async signTransaction(
    walletId: string,
    tx: Record<string, unknown>,
  ): Promise<string> {
    const res = await this.privy
      .wallets()
      .ethereum()
      .signTransaction(walletId, {
        params: { transaction: tx as never },
      });
    if (!res.signed_transaction) {
      throw new Error("Privy signTransaction returned no signed transaction");
    }
    return res.signed_transaction;
  }
}
