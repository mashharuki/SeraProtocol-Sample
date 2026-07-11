# /wallet QR code — design (approved 2026-07-11)

## Goal

`/wallet` should show a scannable QR code for the user's Privy wallet address,
so funding the wallet from a phone wallet / exchange app is copy-paste-free.

## Decisions

- **QR content: plain address** (`0x…`), not an EIP-681 URI — maximum
  compatibility with wallets, exchange apps, and generic scanners (user choice).
- **Generation: `qrcode` npm package, server-side** — pure JS, no external
  service (the address never leaves the bot), works in the Cloud Run container.
- **Delivery: one message** — `replyWithPhoto` with the existing `walletInfo`
  text as the HTML caption (fits well under the 1024-char caption limit).
- **Fallback:** if QR generation throws, send the current text-only message —
  /wallet must never break.

## Changes

1. deps: `qrcode` (+ `@types/qrcode` dev)
2. `src/bot/qr.ts`: `addressQrPng(address): Promise<Buffer>`
   (width 512, margin 2, error correction M)
3. `src/bot/commands/account.ts` `/wallet`: photo + caption, text fallback
4. i18n: none (reuse `walletInfo`)
5. test: `qr.test.ts` asserts a real PNG comes back (magic bytes, sane size)
