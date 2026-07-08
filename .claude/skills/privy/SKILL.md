---
name: Privy
description: Use when building authentication systems, creating embedded wallets, managing wallet controls and policies, signing transactions, or integrating wallet infrastructure into applications. Agents should reach for this skill when implementing user onboarding, wallet creation, transaction signing, policy enforcement, or wallet management across Ethereum, Solana, and other blockchains.
metadata:
    mintlify-proj: privy
    version: "1.0"
---

# Privy Skill Reference

## Product summary

Privy is a wallet and authentication infrastructure platform that enables developers to embed self-custodial wallets and user authentication directly into applications. It provides SDKs for React, React Native, Node.js, Swift, Android, Flutter, Unity, Java, Go, Rust, and Ruby, plus a REST API for server-side operations.

**Key files and configuration:**
- Dashboard: https://dashboard.privy.io (create apps, configure login methods, set up webhooks)
- App ID and App Secret: Retrieved from Dashboard > Configuration > App settings > Basics
- Environment variables: `PRIVY_APP_ID`, `PRIVY_APP_SECRET`, `PRIVY_WEBHOOK_SIGNING_SECRET`
- Client-side: `PrivyProvider` wraps React apps; `usePrivy()` and wallet hooks access functionality
- Server-side: `PrivyClient` initialized with app ID and secret for Node.js, Go, Java, Rust, Ruby

**Primary documentation:** https://docs.privy.io

## When to use

Reach for this skill when:
- Building user authentication flows (email, SMS, social, wallet, passkey, OAuth)
- Creating or managing embedded wallets for users or servers
- Implementing wallet controls, policies, and authorization keys
- Signing transactions on Ethereum, Solana, Tempo, Bitcoin, or other chains
- Setting up wallet actions (transfers, swaps, earn/yield)
- Configuring multi-factor authentication or security features
- Managing user accounts and linking multiple authentication methods
- Handling wallet lifecycle events via webhooks
- Building trading apps, treasury management, or agent wallets
- Integrating external wallets (MetaMask, Phantom, etc.)

## Quick reference

### SDK initialization

| Platform | Code |
|----------|------|
| **React** | `<PrivyProvider appId="..." clientId="..." config={{...}}>` |
| **React Native** | `<PrivyProvider appId="..." clientId="..." config={{...}}>` |
| **Node.js** | `new PrivyClient({appId: '...', appSecret: '...'})` |
| **Go** | `privy.NewPrivyClient(privy.PrivyClientOptions{AppID: '...', AppSecret: '...'})` |
| **Java** | `PrivyClient client = new PrivyClient(appId, appSecret)` |
| **REST API** | Basic Auth: `Authorization: Basic <base64(appId:appSecret)>` + header `privy-app-id: <appId>` |

### Common wallet operations

| Task | Method/Hook |
|------|-------------|
| Create wallet | `useCreateWallet()` (React) or `privy.wallets().create()` (Node.js) |
| Get wallet | `useWallets()` (React) or `privy.wallets().get()` (Node.js) |
| Sign transaction | `wallet.sendTransaction()` (Ethereum) or `wallet.signTransaction()` (Solana) |
| Send transaction | `eth_sendTransaction` (Ethereum) or `signAndSendTransaction` (Solana) |
| Get balance | `privy.wallets().getBalance()` (Node.js) |
| Export keys | `wallet.exportPrivateKey()` or `wallet.exportSeedPhrase()` |

### Policy and control configuration

| Element | Purpose |
|---------|---------|
| **Owner** | Entity with full control (user ID, authorization key, or key quorum) |
| **Signer** | Additional party with scoped permissions; cannot modify policies |
| **Policy** | Rules constraining what actions are allowed (transfers, swaps, contract calls) |
| **Rule** | Specific action rule with conditions and ALLOW/DENY action |
| **Condition** | Boolean expression evaluated against request (e.g., recipient address, amount) |

### Webhook event types

| Category | Events |
|----------|--------|
| **User** | `user.created`, `user.authenticated`, `user.linked_account`, `user.wallet_created`, `mfa.enabled` |
| **Wallet** | `wallet.funds_deposited`, `wallet.funds_withdrawn`, `wallet.private_key_export`, `wallet.recovered` |
| **Transaction** | `transaction.confirmed`, `transaction.failed`, `transaction.broadcasted`, `transaction.execution_reverted` |
| **Wallet actions** | `wallet_action.swap.*`, `wallet_action.transfer.*`, `wallet_action.earn_deposit.*` |
| **Intent** | `intent.created`, `intent.authorized`, `intent.executed`, `intent.rejected` |

## Decision guidance

### When to use embedded wallets vs. external wallets

| Scenario | Use embedded wallets | Use external wallets |
|----------|---------------------|----------------------|
| New users without crypto experience | ✓ | |
| Users with existing wallets (MetaMask, Phantom) | | ✓ |
| Self-custodial requirement | ✓ | ✓ |
| Seamless onboarding UX | ✓ | |
| Power users bringing their own keys | | ✓ |
| Multi-chain support needed | ✓ | ✓ |

### When to use wallet actions vs. RPC methods

| Scenario | Use wallet actions | Use RPC methods |
|----------|-------------------|-----------------|
| Simple transfers or swaps | ✓ | |
| Complex contract interactions | | ✓ |
| Earn/yield operations | ✓ | |
| Custom transaction logic | | ✓ |
| Built-in quote/fee handling | ✓ | |
| Direct signing control | | ✓ |

### When to use Privy authentication vs. JWT-based auth

| Scenario | Use Privy auth | Use JWT-based |
|----------|----------------|---------------|
| No existing auth system | ✓ | |
| Already have Auth0, Firebase, Cognito | | ✓ |
| Want email + social + wallet logins | ✓ | |
| Integrating with existing provider | | ✓ |
| Need MFA and passkeys | ✓ | ✓ |

### Wallet control models

| Model | Owner | Signers | Use case |
|-------|-------|---------|----------|
| **User-owned** | User | None | Self-custodial consumer wallets |
| **User + server** | User | Server (scoped) | Automated trading, limit orders |
| **App-owned** | Authorization key | None | Treasury, trading bots, agents |
| **Custodial** | Custodian | None | FBO banking-like models |

## Workflow

### 1. Set up a Privy app

1. Log into https://dashboard.privy.io
2. Create a new app (separate apps for dev/staging/production)
3. Navigate to Configuration > App settings > Basics
4. Copy your **App ID** (public) and **App Secret** (keep secret)
5. Store credentials in environment variables: `PRIVY_APP_ID`, `PRIVY_APP_SECRET`
6. Configure login methods in Configuration > Login methods if using Privy authentication
7. Set up webhooks in Configuration > Webhooks if you need event notifications

### 2. Initialize Privy in your application

**For React/React Native:**
1. Wrap your app with `<PrivyProvider appId="..." clientId="..." config={{...}}>`
2. Wait for `usePrivy().ready` before consuming Privy state
3. Use hooks like `usePrivy()`, `useWallets()`, `useCreateWallet()` in components

**For Node.js/server:**
1. Import `PrivyClient` from `@privy-io/node`
2. Initialize: `const privy = new PrivyClient({appId: '...', appSecret: '...'})`
3. Use `privy.wallets()`, `privy.users()`, `privy.webhooks()` methods

### 3. Implement user authentication

1. Choose authentication method (email, social, wallet, passkey, or your own JWT)
2. If using Privy auth: configure login methods in dashboard
3. If using JWT-based auth: register JWKS endpoint in Configuration > Authentication
4. Call `usePrivy().login()` (client) or create user via API (server)
5. Verify user state with `usePrivy().user` (client) or `privy.users().get()` (server)

### 4. Create and manage wallets

1. Decide wallet ownership: user-owned, app-owned, or custodial
2. Create wallet: `useCreateWallet()` (React) or `privy.wallets().create()` (Node.js)
3. Specify owner (user ID or authorization key) and chain type (ethereum, solana, etc.)
4. Optionally attach policies and signers at creation time
5. Retrieve wallet: `useWallets()` (React) or `privy.wallets().get()` (Node.js)
6. Store wallet ID for future operations

### 5. Set up policies and controls

1. Define what actions wallets should allow (transfers, swaps, contract calls)
2. Create policy in dashboard or via API with rules and conditions
3. Specify field sources (transaction fields, calldata, message content)
4. Set operators (eq, lt, gt, in, contains, etc.) and values
5. Attach policy to wallet at creation or update wallet with policy ID
6. Test policy evaluation with sample transactions

### 6. Implement transaction signing and sending

1. For simple transfers: use wallet action API (`transfer()`)
2. For swaps: use wallet action API (`swap()`) with quote
3. For custom logic: use RPC methods (`eth_sendTransaction`, `signTransaction`, etc.)
4. Call signing method with transaction/message data
5. Handle user approval flow (embedded UI or custom)
6. Monitor transaction status via webhooks or polling

### 7. Set up webhooks for events

1. Create backend endpoint to receive POST requests
2. Register endpoint in dashboard: Configuration > Webhooks
3. Select event types to subscribe to (user, wallet, transaction, etc.)
4. Verify webhook signature using `privy.webhooks().verify()` (Node.js)
5. Parse payload and handle event (e.g., update database on user creation)
6. Return 2xx status code to acknowledge receipt

### 8. Verify and test

1. Check that app ID and secret are correct
2. Verify wallet creation with correct owner and chain type
3. Test policy evaluation with sample transactions
4. Confirm webhook delivery and signature verification
5. Test authentication flow end-to-end
6. Verify transaction signing and submission on testnet

## Common gotchas

- **App secret exposure**: Never expose `PRIVY_APP_SECRET` in client-side code or version control. Use environment variables and keep it server-side only.
- **Missing `ready` check**: Always wait for `usePrivy().ready === true` before consuming Privy state in React to avoid stale data.
- **Policy default deny**: If a wallet has a policy, any RPC method not explicitly allowed in the policy will be denied. Include rules for all methods you intend to use.
- **Webhook signature verification**: Always verify webhook signatures using `privy.webhooks().verify()` before trusting the payload. Unverified webhooks are a security risk.
- **Rate limiting**: API calls are rate-limited. Implement exponential backoff for retries (HTTP 429 responses). Batch operations where possible.
- **Idempotency keys**: Use idempotency keys for wallet creation and other mutations to prevent duplicate operations if requests are retried.
- **Owner vs. signer confusion**: Owners have full control and can modify policies; signers have scoped permissions only. Choose the right role for your use case.
- **Chain type mismatch**: Ensure wallet chain type matches the transaction you're signing (e.g., don't send Ethereum transactions to Solana wallets).
- **Policy evaluation timing**: Policies are evaluated at request time in secure enclaves. Conditions must match the exact request format (e.g., amounts in wei, not ETH).
- **Webhook endpoint must be HTTPS**: Webhook URLs must start with `https://`. HTTP endpoints will be rejected.
- **User key expiration**: User keys for signing are time-bound. Request new keys if signing fails with auth errors.
- **Missing JWKS endpoint**: If using JWT-based auth, ensure your JWKS endpoint is publicly accessible and returns valid keys.

## Verification checklist

Before submitting work with Privy:

- [ ] App ID and secret are correctly configured in environment variables
- [ ] `PrivyProvider` wraps the app and `ready` state is checked before using hooks (React)
- [ ] Wallet owner is correctly specified (user ID, authorization key, or key quorum)
- [ ] Wallet chain type matches the blockchain you're targeting
- [ ] Policies are attached to wallets if access control is required
- [ ] All RPC methods used by the wallet have corresponding policy rules (if policy exists)
- [ ] Webhook endpoint is HTTPS and registered in the dashboard
- [ ] Webhook signature verification is implemented using `privy.webhooks().verify()`
- [ ] Transaction signing and submission flow has been tested on testnet
- [ ] Error handling covers auth failures, rate limits, and policy denials
- [ ] Sensitive credentials (app secret, webhook signing secret) are not exposed in logs or client code
- [ ] Idempotency keys are used for wallet creation and other mutations
- [ ] User authentication flow has been tested end-to-end (login, logout, account linking)

## Resources

**Comprehensive navigation:** https://docs.privy.io/llms.txt

**Critical documentation pages:**
- [Key Concepts](https://docs.privy.io/basics/key-concepts) — Understand authentication, wallets, and controls
- [Wallet Creation](https://docs.privy.io/wallets/wallets/create/create-a-wallet) — Create wallets across all SDKs
- [Policies Overview](https://docs.privy.io/controls/policies/overview) — Define and enforce wallet rules
- [Webhooks Overview](https://docs.privy.io/api-reference/webhooks/overview) — Set up event notifications
- [API Reference](https://docs.privy.io/api-reference/introduction) — REST API authentication and endpoints

---

> For additional documentation and navigation, see: https://docs.privy.io/llms.txt