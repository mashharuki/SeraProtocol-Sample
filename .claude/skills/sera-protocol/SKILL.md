---
name: sera-protocol
description: "Comprehensive development guide for building applications on Sera Protocol — a fully on-chain Central Limit Order Book (CLOB) DEX for stablecoin FX trading on Ethereum, plus its next-gen orderbook-contract-v2 (signed-order matching + Vault custody + Smart Order Router) and SeraPay merchant payment app. Use this skill whenever the user mentions Sera Protocol, SeraProtocol, CLOB DEX, stablecoin order book, on-chain FX, or wants to: query Sera's GraphQL subgraph, interact with Sera smart contracts (Router, OrderBook, PriceBook, or the v2 Sera/SeraSOR/SeraBatcher/Vault contracts), place/cancel/claim limit or market orders, build trading UIs, integrate Sera APIs, set up an MCP server for Sera, build AI agents with Sera, use sera-mcp, use sera-agents, use SeraPay/sera-pay, or work with anything in the SeraProtocol-Sample repository. Also trigger when the user references priceIndex, rawAmount, quoteUnit, order book depth, Sera-specific contract addresses, x402 protocol, stablecoin FX settlement, multi-currency payment for AI agents, orderbook-contract-v2, EIP-712 signed orders, Smart Order Router (SOR), Vault custody, dual-authorization withdrawals, merchant QR payment links, docs.testnet.sera.cx, Sera's REST API, Virtual Liquidity batches, or api.sera.cx."
---

# Sera Protocol Development Guide

You are an expert Sera Protocol developer. This skill gives you everything needed to help users build applications on Sera Protocol — from querying market data to placing on-chain orders to building full trading UIs to integrating AI agents with multi-currency settlement.

## What is Sera Protocol?

Sera Protocol is a fully on-chain **Central Limit Order Book (CLOB)** decentralized exchange on Ethereum, designed as a global FX settlement protocol for stablecoin trading. Key properties:

- **Zero slippage**: Limit orders execute at exactly the specified price
- **Capital efficient**: No pooled liquidity — each order sits at a specific price level (v1) or shares a signed collateral budget via Virtual Liquidity (v2, see below)
- **NFT orders**: v1 limit orders are NFTs (transferable, composable with DeFi) — not true of v2's signed-order model
- **Maker-taker fees**: Takers ~0.1% (10 bps), makers ~-0.05% (5 bps rebate) on v1; v2 fees are per-order (`feeBps`) and governance-configurable
- **Currency coverage**: Testnet documents 43 fiat currencies' worth of stablecoin pairs — query `GET /tokens`/`GET /markets` (see `references/api-reference.md`) for the live, current list rather than trusting any hardcoded count
- **Network**: Ethereum mainnet + Sepolia testnet (Chain ID: 11155111)

### Key Links
- **Developer docs (current, testnet)**: https://docs.testnet.sera.cx/ — REST API, v2 contracts, trading guide; treat this as the authoritative source over the older links below
- Main site: https://sera.cx/ja
- 2025 site: https://2025.sera.cx/
- Older docs (v1-era, may be stale): https://docs.sera.cx/introduction
- **Official MCP**: https://github.com/sera-cx/sera-mcp
- **AI Agents**: https://github.com/sera-cx/sera-agents
- **Merchant Pay**: https://github.com/sera-cx/sera-pay
- **Contract v2**: https://github.com/sera-cx/orderbook-contract-v2 (audit reports: `.../tree/audit/audits`)

## Ecosystem Overview (2025–2026)

Sera has expanded from a DEX into a full multi-currency settlement infrastructure. The ecosystem now has four layers:

| Layer | Repo | Purpose |
|---|---|---|
| **Protocol (v1, deployed)** | Router/OrderBook/PriceBook (see `smart-contracts.md`) | Price-level on-chain CLOB — what this sample repo integrates against |
| **Protocol (v2, next-gen)** | `sera-cx/orderbook-contract-v2` | Signed-order matching + Vault custody + SOR — see `references/orderbook-v2.md` |
| **MCP Server** | `sera-cx/sera-mcp` | 32-tool MCP for AI agents (production-grade) |
| **Agent Framework** | `sera-cx/sera-agents` | Templates + x402 protocol for AI payment agents |
| **Merchant Payments** | `sera-cx/sera-pay` | Dashboard + QR payment links for merchants — see `references/sera-pay.md` |

This sample repo (`SeraProtocol-Sample`) demonstrates the developer integration layer.

## Repository Structure

This repo (`SeraProtocol-Sample`) contains four main modules:

```
SeraProtocol-Sample/
├── api-sample-app/   # Minimal GraphQL query example (Bun + TypeScript)
├── tutorial/          # Full order lifecycle CLI (place → monitor → claim)
├── frontend/          # React trading UI (Vite + ethers.js + Reown AppKit)
├── mcp-server/        # Local MCP server example (8 tools, viem + Zod)
└── data/              # Sample GraphQL response JSON files
```

When the user asks about a specific module, read the relevant reference file:
- **GraphQL/API queries (v1 subgraph)** → read `references/graphql-api.md`
- **Sera's REST API (current, recommended for new integrations)** → read `references/api-reference.md`
- **Smart contract interactions (deployed v1 Router/PriceBook CLOB — what this sample repo uses)** → read `references/smart-contracts.md`
- **orderbook-contract-v2 (signed-order + Vault custody + SOR — NOT the same API as v1, powers the REST API above)** → read `references/orderbook-v2.md`
- **Frontend patterns** → read `references/frontend-patterns.md`
- **MCP server (local sample)** → read `references/mcp-server.md`
- **AI Agents / official MCP** → read `references/sera-agents.md`
- **SeraPay (merchant payment app)** → read `references/sera-pay.md`

## Core Concepts

### Price Mechanics (Arithmetic Price Book)

Sera uses an arithmetic price model — every price is calculated from a base formula:

```
price = minPrice + (tickSpace * priceIndex)
```

- `priceIndex`: uint16 (0–65,535) — the index into the price book
- `minPrice`: uint128 — minimum supported price for the market
- `tickSpace`: uint128 — price increment per index step
- All prices use 18 decimal precision internally

**Amount conversions** (critical for correct order placement):
| Conversion | Formula |
|---|---|
| Raw → Quote | `quoteAmount = rawAmount * quoteUnit` |
| Quote → Raw | `rawAmount = quoteAmount / quoteUnit` |
| Raw → Base | `baseAmount = rawAmount * quoteUnit / price` |
| Base → Raw | `rawAmount = baseAmount * price / quoteUnit` |

Where `quoteUnit` is a market-specific multiplier fetched from the market info.

### Order Types

**Limit Orders**: Persist on the book until filled or cancelled.
- Bids (buy): specify `rawAmount` (in quote token units)
- Asks (sell): specify `baseAmount` (in base token units)
- `postOnly = true` reverts if the order would fill immediately (maker-only safety)

**Market Orders**: Execute immediately against existing liquidity.
- `limitPriceIndex`: worst acceptable price
- `expendInput`: if true, spend all input tokens; if false, receive minimum output

**Virtual Liquidity (VL) Batches** — a v2 REST API concept, not part of v1: 2–50 limit orders
across *distinct* markets share one collateral budget (the Vault freezes only the largest single
leg, not the sum), auto-amending siblings as fills consume the budget. See
`references/api-reference.md` for the full mechanics, endpoints, and worked example.

### Order Lifecycle

```
1. Query market info     → GraphQL: market(id: "0x...")
2. Fetch order book      → GraphQL: depths(where: {market: "0x..."})
3. Approve token         → ERC20.approve(ROUTER_ADDRESS, amount)
4. Place order           → Router.limitBid() or Router.limitAsk()
5. Monitor status        → GraphQL: openOrders (poll every ~3s)
6. Claim proceeds        → Router.claim()
```

**Order States**: `open` → `partial` → `filled` → `claimed` (or `open` → `cancelled`)

### Contract Addresses (Sepolia Testnet)

| Contract | Address |
|---|---|
| Router | `0x82bfe1b31b6c1c3d201a0256416a18d93331d99e` |
| Market Factory | `0xe54648526027e236604f0d91413a6aad3a80c01e` |
| Order Canceller | `0x53ad1ffcd7afb1b14c5f18be8f256606efb11b1b` |
| Default Market (TWETH/TUSDC) | `0x002930b390ac7d686f07cffb9d7ce39609d082d1` |
| EURC/XSGD Market | `0x2e4a11c7711c6a69ac973cbc40a9b16d14f9aa7e` |

### Orderbook Contract v2 — a different architecture, not a v1 upgrade

`sera-cx/orderbook-contract-v2` is **not** an extension of the v1 Router/OrderBook/PriceBook
model above — it's a ground-up rewrite with a different trading model entirely: users sign
`Order` structs off-chain (EIP-712), a trusted `EXECUTOR_ROLE` matches complementary signed
orders on-chain, and settlement happens non-custodially through a `Vault`. There is no
`priceIndex`, `PriceBook`, or NFT orders in v2. Read `references/orderbook-v2.md` before writing
any v2 integration code — the structs and function signatures share no overlap with v1.

| Feature | Details |
|---|---|
| **Signed order matching** | `Sera.matchOrders()` settles two EIP-712-signed `Order` structs; no on-chain price book |
| **Vault custody** | Funds held in `Vault.sol` per-user/per-token; executor can only move funds within signed bounds |
| **SOR (Smart Order Router)** | `SeraSOR.executeIntent()` — one taker signature covers a whole multi-leg route; executor picks legs at execution time; transient (in-memory) balance optimization skips Vault round-trips on intermediate hops |
| **Batch execution** | `SeraBatcher`: best-effort (`batchMatchOrders`), fill-or-kill (`batchMatchOrdersAtomic`), and mixed batches + SOR (`batchMatchMixed`) |
| **Dual-authorization withdrawals** | Delayed (`emergencyWithdraw`, ~24h delay / ~48h expiry, no counterparty needed) or instant (`executeInstantWithdrawDualSig`, user + executor EIP-712 signatures) |
| **EIP-712 / EIP-1271 / EIP-7702** | Structured signatures via `SignatureChecker` — EOAs, smart-contract wallets (Safe, Argent, ERC-4337), and delegated EOAs all valid signers |
| **Fees & reentrancy** | Per-order `feeBps` out of `BPS_DENOMINATOR = 1e14`, governance-configurable maker/taker/protocol spread split, `ReentrancyGuardTransient` (EIP-1153) |
| **Token support** | Standard ERC20 only — fee-on-transfer and rebasing/elastic-supply tokens are NOT supported (Vault would go insolvent or trap yield) |
| **Governance & audit** | Compound Timelock holds `DEFAULT_ADMIN_ROLE` on mainnet after deploy; CertiK audit, final report dated 2026-04-30 |
| **License** | PolyForm Noncommercial 1.0.0 — source-available, not OSI-approved open source; commercial use needs a separate license from Working Ants Inc. |

Key contracts: `Sera.sol` (core matching + deposits + withdrawals), `SeraSOR.sol` (routing),
`SeraBatcher.sol` (batch execution), `Vault.sol` (custody), `SeraLib.sol` (shared structs/typehashes).

As of this writing, the GraphQL subgraph and this sample repo's `tutorial/`, `frontend/`, and
`mcp-server/` all integrate against **v1** — v2 is not yet wired into the sample app. Confirm
with the user which version they mean before writing integration code.

### GraphQL Subgraph

**Endpoint** (public, no auth):
```
POST https://api.goldsky.com/api/public/project_cmicv6kkbhyto01u3agb155hg/subgraphs/sera-pro/1.0.9/gn
```

**Rate Limits**: 50 queries / 10 seconds, max 1000 complexity, max 1000 results per query.

### Environment Setup

```bash
# Required for write operations (placing orders, claiming, approving)
PRIVATE_KEY=0x[64-char-hex-string]

# Optional (defaults shown)
SEPOLIA_RPC_URL=https://0xrpc.io/sep
VITE_REOWN_PROJECT_ID=...   # Frontend wallet connection only

# Local mcp-server/
TRANSPORT=stdio              # MCP server: stdio or http
PORT=3000                    # MCP server HTTP port

# Official sera-mcp (sera-cx/sera-mcp)
SERA_NETWORK=mainnet         # mainnet or sepolia
SERA_SIGNER_MODE=external    # external | local | readonly
POLICY_PRESET=standard       # starter | standard | sg-retail | open
SERA_API_KEY=...             # Required for treasury & settlement tools
SERA_API_SECRET=...          # Required for treasury & settlement tools
```

## Official Sera MCP Server (sera-cx/sera-mcp)

The official MCP server from Sera is **production-grade** and distinct from the local `mcp-server/` sample in this repo. Read `references/mcp-server.md` for full setup and tool details.

### Quick Start

```bash
# Clone and build
git clone https://github.com/sera-cx/sera-mcp
cd sera-mcp && npm install && npm run build

# Add to Claude Code (one-liner)
claude mcp add sera --scope user \
  --env SERA_NETWORK=mainnet \
  --env POLICY_PRESET=standard \
  -- node /path/to/dist/index.js
```

### 32 Tools in 9 Categories

| Category | Tools |
|---|---|
| **Discovery** | `list_currencies`, `get_markets` |
| **Pricing** | `get_fx_rate`, `compare_to_external_fx`, `multi_source_mid`, `spread_radar` |
| **Liquidity** | `scan_markets`, `find_deals`, `probe_depth`, `round_trip_cost`, `infer_book` |
| **Quote & Execute** | `get_quote`, `prepare_swap`, `execute_swap`, `convert_and_send`, `quote_recipient_amount`, `find_cheapest_settlement_path`, `limit_watcher` |
| **Maker** | `maker_quote_ladder` |
| **Treasury** | `get_balances`, `treasury_value`, `exposure_report`, `rebalance_plan`, `pay_invoice` |
| **Settlement** | `settlement_status` |
| **History** | `fx_history`, `fx_volatility`, `corridor_pnl` |
| **Admin** | `doctor` |

### Policy Presets

| Preset | Symbols | Per-Tx Cap | Daily Cap | Slippage |
|---|---|---|---|---|
| `starter` | USDC, USDT | $1,000 | $5,000 | 25 bps |
| `standard` | USDC, USDT, XSGD, JPYC, MYRT, TGBP, EURC | $5,000 | $50,000 | 10 bps |
| `sg-retail` | USDC, USDT, XSGD | $2,000 | $10,000 | 15 bps |

Override individual limits with env vars: `POLICY_MAX_NOTIONAL_USD`, `POLICY_DAILY_VOLUME_USD`, `POLICY_MAX_SLIPPAGE_BPS`.

### Signing Modes

| Mode | Description | Use Case |
|---|---|---|
| `external` | No private key on server; returns unsigned tx for wallet to sign | Production (default) |
| `local` | Private key stored in env; signs server-side | Automated agents |
| `readonly` | No write operations | Price queries only |

### MCP Resources

- `sera://currencies` — list of supported currencies
- `sera://markets` — available markets
- `sera://config` — current server configuration
- `sera://help/tools` — tool documentation
- `sera://help/quickstart` — getting started guide

## Sera Agents (sera-cx/sera-agents)

AI agent integration framework for Sera. Read `references/sera-agents.md` for full details.

### Four Integration Paths

| Path | Use Case | Entry Point |
|---|---|---|
| **A — Install** | Add to existing agent stack | `sera-mcp` via npm/git |
| **B — Build** | New agent from scratch | `templates/` (3 starters) |
| **C — Run** | Use immediately | `sera-agent/` CLI |
| **D — Protocol** | x402 payment protocol only | `x402-service/` |

### Templates

- **`chat-cli`** — Terminal REPL agent
- **`web-chat`** — Express + browser chat UI
- **`webhook-agent`** — HTTP-triggered agent (POST endpoint)

### Examples

- **`invoice-payer`** — Automated invoice payment agent
- **`treasury-rebalancer`** — Multi-currency treasury rebalancing

### x402 Protocol

Sera implements the [x402 payment protocol](https://x402.org) for machine-to-machine stablecoin payments:

```bash
# Demo mode (no wallet required)
X402_MODE=demo node x402-service/index.js

# Live mode (Base Sepolia)
X402_MODE=live X402_NETWORK=base X402_LIVE_ACK=true node x402-service/index.js
```

### Integration Targets

Works with: Claude Code, Claude Desktop, Cursor, ChatGPT, OpenClaw, Hermes, NanoClaw, and any MCP-compatible host.

## SeraPay (sera-cx/sera-pay)

Merchant-facing stablecoin payment application — wallet-based merchant sign-in (via **Privy**,
not custom SIWE), a dashboard (payment history, settings, menu management, dev tools), branded
QR payment links, and a checkout flow with live FX display. Full-stack app: React 19 + Vite
frontend, Express + **tRPC** server, Drizzle ORM over Postgres, optional Cloudflare R2 for
logo/menu image storage. It talks to Sera through a hosted **REST API**
(`https://api.sera.cx/api/v1` — tokens/markets/fx-rate/health/config endpoints), not the GraphQL
subgraph and not direct contract calls. License is MIT (distinct from the orderbook-contract-v2
PolyForm license — don't conflate the two).

Read `references/sera-pay.md` for the full tech stack, directory structure, the Sera REST API
client (`server/sera-api.ts`), auth flow, and the complete environment variable list.

```bash
git clone https://github.com/sera-cx/sera-pay
pnpm install
cp .env.example .env
pnpm run dev
```

## Development Patterns

### Pattern 1: Query Market Data (GraphQL)

```typescript
const SUBGRAPH_URL = "https://api.goldsky.com/api/public/project_cmicv6kkbhyto01u3agb155hg/subgraphs/sera-pro/1.0.9/gn";

async function querySubgraph(query: string, variables: Record<string, unknown> = {}) {
  const res = await fetch(SUBGRAPH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  return json.data;
}
```

### Pattern 2: Place a Limit Order (viem)

```typescript
import { createWalletClient, createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

const account = privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`);
const publicClient = createPublicClient({ chain: sepolia, transport: http(RPC_URL) });
const walletClient = createWalletClient({ account, chain: sepolia, transport: http(RPC_URL) });

// 1. Simulate first (catches reverts before spending gas)
const { request } = await publicClient.simulateContract({
  address: ROUTER_ADDRESS,
  abi: ROUTER_ABI,
  functionName: "limitBid",
  args: [orderParams],
  account,
});

// 2. Send transaction
const txHash = await walletClient.writeContract(request);

// 3. Wait for confirmation
const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
```

### Pattern 3: Post-Only Safety

When placing maker orders, use the post-only mechanism to prevent accidental taker fills:

```typescript
function resolvePostOnlyBidPriceIndex(desiredPriceIndex: number, bids: Depth[], asks: Depth[]): number {
  if (asks.length === 0) return desiredPriceIndex;
  const bestAskPriceIndex = asks[0].priceIndex;
  // Stay below best ask to ensure order rests on the book
  return Math.min(desiredPriceIndex, bestAskPriceIndex - 1);
}
```

### Pattern 4: Token Approval Flow

Always check allowance before approving — avoid unnecessary approval transactions:

```typescript
const currentAllowance = await publicClient.readContract({
  address: tokenAddress,
  abi: ERC20_ABI,
  functionName: "allowance",
  args: [account.address, ROUTER_ADDRESS],
});

if (currentAllowance < requiredAmount) {
  const txHash = await walletClient.writeContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: "approve",
    args: [ROUTER_ADDRESS, requiredAmount],
  });
  await publicClient.waitForTransactionReceipt({ hash: txHash });
}
```

### Pattern 5: Use Official MCP for FX Discovery

```typescript
// Via official sera-mcp (MCP client calls these tools):

// Check rates across corridors
await mcp.call("get_fx_rate", { from: "USD", to: "SGD" });

// Find best deals (high-spread opportunities)
await mcp.call("find_deals", { min_bps: 25 });

// Execute a swap (requires SERA_SIGNER_MODE=local or external signing)
const quote = await mcp.call("get_quote", { from: "USDC", to: "XSGD", amount: 1000 });
await mcp.call("execute_swap", { quote_id: quote.id });
```

## Common Tasks

### "I want to get market data"
1. Use the GraphQL subgraph — read `references/graphql-api.md` for all query patterns
2. No authentication needed
3. Start with `market(id: "0x...")` for a single market or `markets(first: N)` for listing

### "I want to place an order"
Two different systems answer to this — confirm which one the user means:
- **This sample repo's on-chain flow (v1 Router)**: ensure `PRIVATE_KEY` is set, fetch market
  info (`quoteUnit`, `minPrice`, `tickSpace`), calculate `priceIndex`, approve the Router, call
  `limitBid`/`limitAsk` — read `references/smart-contracts.md` for full ABI details, monitor via
  GraphQL, then claim when filled.
- **Sera's current REST API (v2, recommended for new integrations)**: `POST /orders/preview` →
  sign the returned EIP-712 payload → `POST /orders` → poll `GET /orders/{order_id}` → proceeds
  land in `GET /balances`. Read `references/api-reference.md` for the full flow, error codes, and
  Virtual Liquidity batching.

### "I want to build a trading frontend"
1. Read `references/frontend-patterns.md` for the hook architecture
2. Key hooks: `useMarket`, `useOrders`, `useDepths`, `usePlaceOrder`, `useClaim`, `useTokenApproval`
3. Wallet connection uses Reown AppKit with ethers.js
4. State management via Zustand

### "I want to set up the MCP server (sample)"
1. Read `references/mcp-server.md` for the local 8-tool sample
2. For the production-grade 32-tool server, use `sera-cx/sera-mcp` instead

### "I want to integrate Sera with my AI agent"
1. Read `references/sera-agents.md` for all integration paths
2. For quick start: clone `sera-cx/sera-agents`, pick a template under `templates/`
3. For MCP integration only: use Path A (`sera-cx/sera-mcp`)
4. For x402 machine-to-machine payments: use Path D (`x402-service/`)

### "I want to add stablecoin payments to my app"
1. For merchant-facing: use `sera-cx/sera-pay` — read `references/sera-pay.md` for the tRPC/Privy/REST-API stack
2. For agent-to-agent: implement x402 via `sera-cx/sera-agents/x402-service/`
3. For programmatic: call Sera's REST API directly (`https://api.sera.cx/api/v1`, or `.../testnet` — see `references/api-reference.md`) via API key + EIP-712 signing

### "I want to do an instant swap (not a resting limit order)"
1. Read `references/api-reference.md` — swaps are fill-or-kill, no Vault deposit needed
2. `POST /swap/quote` → sign the returned `route_params` (EIP-712 `Intent`) → `POST /swap`
3. Gas is always baked into the quote (`gas_mode: receive_less` or `pay_more`) — the taker never needs to hold ETH
4. Multi-hop routes (e.g. GBP→USD→SGD) execute atomically as one signed Intent under the hood (`SeraSOR.executeIntent()`)

### "I want to cancel an order"
1. Use the Order Canceller contract at `0x53ad1ffcd7afb1b14c5f18be8f256606efb11b1b` (v1 only)
2. Each order is an NFT — cancel via token ID
3. Functions: `cancel()`, `cancelTo()` (cancel and redirect proceeds)

### "I want to work with orderbook-contract-v2"
1. First confirm the user actually means v2, not the deployed v1 Router this sample repo uses — the APIs share nothing
2. Read `references/orderbook-v2.md` — signed `Order` structs, `Sera.matchOrders()`, `SeraBatcher`, `SeraSOR.executeIntent()`, `Vault` custody
3. Orders are signed off-chain (EIP-712) by the user; an `EXECUTOR_ROLE` holder submits the match — end users never call `matchOrders` themselves
4. Withdrawals are two paths: `emergencyWithdraw` (delayed, no counterparty) or `executeInstantWithdrawDualSig` (instant, needs executor cosignature)

### "I want to check health / debug MCP"

```bash
# Official sera-mcp CLI
sera doctor

# Or via MCP tool
# Call doctor() → returns API status, network, signer mode, policy summary, persistence
```

## Tech Stack Reference

| Component | Technology | Version |
|---|---|---|
| Smart contract client | viem | ^2.21.0+ |
| Frontend framework | React | ^19.2.0 |
| Frontend Ethereum | ethers.js | ^6.16.0 |
| Wallet connection | Reown AppKit | ^1.8.19 |
| Build tool | Vite | Latest |
| State management | Zustand | ^5.0.11 |
| Styling | Tailwind CSS | ^4.2.1 |
| MCP SDK | @modelcontextprotocol/sdk | ^1.6.1 |
| Validation | Zod | ^3.23.8 |
| Runtime (tutorial) | Bun | ^1.1.4+ |
| Runtime (MCP / sera-agents) | Node.js | ^18.17+ |
| TypeScript | ~5.9.3 | |
| Contract framework (orderbook-contract-v2) | Foundry (Solidity 0.8.24) | — |
| Frontend (sera-pay) | React + Vite | ^19.2 / v7 |
| API layer (sera-pay) | Express + tRPC | — |
| Auth (sera-pay) | Privy | — |
| ORM (sera-pay) | Drizzle ORM (Postgres) | ^0.44 |
| Package manager (sera-pay) | pnpm | — |

Full sera-pay stack detail (wagmi/viem/ethers, shadcn/ui, R2 storage, etc.) is in `references/sera-pay.md`.

## Troubleshooting

| Error | Cause | Fix |
|---|---|---|
| `PRIVATE_KEY is not set` | Missing env var | Add `PRIVATE_KEY=0x...` to `.env` |
| `execution reverted` | Contract revert | Check priceIndex bounds, sufficient balance, token approval |
| `insufficient funds for gas` | No Sepolia ETH | Get testnet ETH from a faucet |
| `nonce too low` | Pending tx conflict | Wait for pending tx or reset nonce |
| `postOnly` revert | Order would fill immediately | Lower bid priceIndex or use `resolvePostOnlyBidPriceIndex()` |
| GraphQL timeout | Rate limit hit | Reduce query frequency (50 req/10s max) |
| `INVALID_PRICE` | Price out of range | Ensure `minPrice <= price <= priceUpperBound` |
| `POLICY_MAX_NOTIONAL_USD exceeded` | MCP policy limit | Lower amount or change `POLICY_PRESET` |
| MCP `execution reverted` (sera-mcp) | Dry-run mode | Set `POLICY_DRY_RUN=false` for live execution |
| `SERA_API_KEY required` | Missing API credentials | Set `SERA_API_KEY` + `SERA_API_SECRET` for treasury tools |
| x402 payment rejected | Demo mode active | Set `X402_MODE=live` and configure vault wallet |
| `STP_BLOCKED` (REST API) | Self-trade prevention — a resting order of yours would cross this one | Cancel the stale resting order before placing the new one |
| `INSUFFICIENT_EQUITY` (REST API) | Vault balance too low | Reduce order size or deposit more via `POST /deposit` |
| `QUOTE_STALE` / HTTP 409/410 on `/swap` | Quote snapshot expired | Request a fresh `POST /swap/quote` — quotes are single-use |
| `INVALID_PRECISION` (REST API) | Amount/price has more decimals than the market's `tick_precision`/`quantity_precision` | Round to the grid from `GET /markets` before signing |
| 429 on `/orders/cancel` | 5-minute per-order cancel cooldown | Wait out the cooldown, or track `settlement_summary` instead of retrying immediately |
