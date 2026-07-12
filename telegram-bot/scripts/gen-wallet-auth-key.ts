#!/usr/bin/env bun
/**
 * Generate the app-held P-256 wallet-owner authorization key that enables
 * /exportkey and /importkey. Prints two .env lines: a PKCS8 private key (secret)
 * and its SPKI public key. Wallets are created owned by this key so their
 * private keys can be exported; app-secret signing still works on owned wallets.
 *
 *   bun scripts/gen-wallet-auth-key.ts
 *
 * Paste the output into .env (and, for Cloud Run, it's picked up as a secret by
 * deploy.sh). Keep WALLET_AUTH_PRIVATE_KEY secret — anyone with it can authorize
 * exports of every wallet this bot owns.
 */
export {};

const kp = await crypto.subtle.generateKey(
  { name: "ECDSA", namedCurve: "P-256" },
  true,
  ["sign", "verify"],
);
const priv = Buffer.from(
  await crypto.subtle.exportKey("pkcs8", kp.privateKey),
).toString("base64");
const pub = Buffer.from(
  await crypto.subtle.exportKey("spki", kp.publicKey),
).toString("base64");

console.log(
  "# Wallet-owner authorization key (add to .env). Keep the private key secret.",
);
console.log(`WALLET_AUTH_PRIVATE_KEY=${priv}`);
console.log(`WALLET_AUTH_PUBLIC_KEY=${pub}`);
