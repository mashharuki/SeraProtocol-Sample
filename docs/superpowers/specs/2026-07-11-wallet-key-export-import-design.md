# Wallet private-key export / import — design (approved 2026-07-11, revised 2026-07-12)

## Goal

Let a user (1) export the private key of their Privy server wallet and
(2) import an external private key, which **replaces** their bot wallet.

User explicitly accepted the security tradeoff of moving a raw private key
through Telegram chat.

## Security handling (mandatory)

- Two-step confirmation card with an explicit warning before either action.
- The message that contains the private key is **auto-deleted** (bot calls
  `deleteMessage` ~60 s later; the caption says so). On import, the user's
  pasted-key message is deleted **immediately**.
- The private key is **never logged** and never written to the DB. Key-op
  *failures* are safe to surface via `describeKeyOpError` — a failed export or
  import never carries the plaintext key (it lives only inside a successful,
  SDK-decrypted response, or in local memory that is never sent to Privy).
- The plaintext key touches Privy only inside the SDK's own HPKE envelope; the
  only plaintext exposure to a human is the single Telegram message, by design.

## Approach: Privy high-level SDK + wallet owner (verified live 2026-07-11)

The earlier manual-HPKE plan (`_export`/`_initImport`/`_submitImport` with
`@hpke/*`) was **abandoned** in favor of the high-level SDK, which handles the
HPKE envelope internally — no manual crypto, no `@hpke/*` deps.

- **Export:** `privy.wallets().exportPrivateKey(walletId, { authorization_context })`
  → `{ private_key }` (64-hex, no `0x`). The wallet must have an **owner**; the
  request is authorized with the app-held P-256 key. If the wallet is owner-less,
  `exportPrivateKey` 401s with "…must have an owner" (`isNeedsOwnerError`); the
  signer then calls `wallets().update(walletId, { owner })` to adopt it and
  retries once.
- **Import:** `privy.wallets().import({ wallet: { address, chain_type: "ethereum",
  entropy_type: "private-key", private_key }, owner, external_id, display_name })`
  → `Wallet`. The new wallet is created **owned** by the same app key so it can be
  re-exported later.

### Owner / authorization key

- A single app-held **P-256 ECDSA** keypair owns every wallet:
  `WALLET_AUTH_PRIVATE_KEY` (PKCS8, base64 — **secret**) and
  `WALLET_AUTH_PUBLIC_KEY` (SPKI, base64). Generate with
  `scripts/gen-wallet-auth-key.ts`.
- Public key MUST be **SPKI-DER base64** (91 bytes for P-256), not a raw
  uncompressed point — Privy 400s on raw points.
- Authorization uses `authorization_context: { authorization_private_keys:
  [<PKCS8-base64>] }`.
- **Verified live:** adding an owner does NOT break app-secret signing —
  `signTypedData` with the app secret alone still works on owned wallets, so
  existing trading is unaffected.
- Wallets are created with `owner: { public_key: <SPKI-base64> }` in
  `createWallet` when `walletAuth` is configured; when it is unset the whole
  feature disables itself (`keyTransferEnabled` → `false`, commands reply
  `keyTransferDisabled`).

## Components

- `src/config.ts`: optional `WALLET_AUTH_PRIVATE_KEY` / `WALLET_AUTH_PUBLIC_KEY`
  → `config.walletAuth?: { privateKeyPkcs8, publicKeySpki }`.
- `src/privy/signer.ts`:
  - constructor `(privy, walletAuth?)`; `get keyTransferEnabled`.
  - `createWallet` spreads `owner` when `walletAuth` is set.
  - `exportPrivateKey(walletId)` → high-level export with `authContext()`,
    owner-adopt-and-retry on `isNeedsOwnerError`, returns `0x`-prefixed key.
  - `importPrivateKey({ address, privateKeyHex, telegramUserId })` → high-level
    import, owned by the app key.
  - `describeKeyOpError(err)` / `isNeedsOwnerError(err)` helpers.
- `src/services/wallet-key-service.ts`:
  - `get enabled` mirrors `signer.keyTransferEnabled`.
  - `exportKey(user)` → `signer.exportPrivateKey(user.walletId)`.
  - `importKey(user, rawKey)` → validate via `privateKeyToAccount`, import,
    `users.replaceWallet`, `apiKeys.deleteAll` (both networks re-issue on next
    call). `normalizePrivateKey` adds the `0x` prefix if missing.
- `src/db/repositories.ts`: `UserRepository.replaceWallet` /
  `ApiKeyRepository.deleteAll`.
- `src/bot/commands/account.ts`: `/exportkey` + `/importkey` (both gated on
  `walletKeys.enabled`), `key:exp` / `key:imp` / `key:x` callbacks.
- `src/bot/flows.ts`: `handleImportKeyText` (immediate delete of pasted message,
  import, success card with new address + QR).
- i18n: `keyExport*` / `keyImport*` / `keyTransferDisabled` (en + ja).
- `scripts/gen-wallet-auth-key.ts`: prints the two `.env` lines.
- `scripts/deploy.sh`: both vars added to `SECRET_VARS`.

## Flows

**/exportkey**: warn card → confirm button → `service.exportKey` → send key in one
message → schedule `deleteMessage(+60 s)`. Export failures show
`describeKeyOpError` reason.

**/importkey**: warn card → confirm → prompt paste → user pastes key →
delete user's message immediately → validate → `service.importKey` → success card
with new address + QR. Invalid key → error, stay in step for retry.

## Tests (`wallet-key-service.test.ts`)

- `enabled` mirrors `signer.keyTransferEnabled`.
- `exportKey` returns the signer's key for the user's wallet.
- `importKey`: rejects bad hex without touching Privy/DB; on a valid key imports,
  `replaceWallet`, `deleteAll`; accepts a no-`0x` key (normalized before Privy).

## Not in scope

Multi-wallet management, seed-phrase (HD) import, export via one-time link.
