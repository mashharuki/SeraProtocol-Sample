import type { PrivyClient } from "@privy-io/node";

export interface CreatedWallet {
  walletId: string;
  address: string;
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
  constructor(private readonly privy: PrivyClient) {}

  /**
   * Create (or idempotently re-create) an Ethereum wallet for a Telegram
   * user. The idempotency key makes double-taps and retries safe within
   * Privy's 24h window; external_id gives a durable reverse mapping.
   */
  async createWallet(telegramUserId: number): Promise<CreatedWallet> {
    const externalId = `tg-${telegramUserId}`;
    const wallet = await this.privy.wallets().create({
      chain_type: "ethereum",
      external_id: externalId,
      display_name: `Telegram user ${telegramUserId}`,
      idempotency_key: `create-${externalId}`,
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
