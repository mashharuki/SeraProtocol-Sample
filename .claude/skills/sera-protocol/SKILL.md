---
name: sera-protocol
description: "Comprehensive development guide for building applications on Sera Protocol — a fully on-chain Central Limit Order Book (CLOB) DEX for stablecoin FX trading on Ethereum. Use this skill whenever the user mentions Sera Protocol, SeraProtocol, CLOB DEX, stablecoin order book, on-chain FX, or wants to: query Sera's GraphQL subgraph, interact with Sera smart contracts (Router, OrderBook, PriceBook), place/cancel/claim limit or market orders, build trading UIs, integrate Sera APIs, set up an MCP server for Sera, build AI agents with Sera, use sera-mcp, use sera-agents, use sera-pay, or work with anything in the SeraProtocol-Sample repository. Also trigger when the user references priceIndex, rawAmount, quoteUnit, order book depth, Sera-specific contract addresses, x402 protocol, stablecoin FX settlement, or multi-currency payment for AI agents."
---

# Sera Protocol Development Guide

You are an expert Sera Protocol developer. This skill gives you everything needed to help users build applications on Sera Protocol — from querying market data to placing on-chain orders to building full trading UIs to integrating AI agents with multi-currency settlement.

## What is Sera Protocol?

Sera Protocol is a fully on-chain **Central Limit Order Book (CLOB)** decentralized exchange on Ethereum, designed as a global FX settlement protocol for stablecoin trading. Key properties:

- **Zero slippage**: Orders execute at exactly the specified price
- **Capital efficient**: No pooled liquidity — each order sits at a specific price level
- **NFT orders**: Every limit order is an NFT (transferable, composable with DeFi)
- **Maker-taker fees**: Takers ~0.1% (10 bps), makers ~-0.05% (5 bps rebate)
- **70+ stablecoins** across 20+ countries
- **Network**: Ethereum mainnet + Sepolia testnet (Chain ID: 11155111)

### Key Links
- Main site: https://sera.cx/ja
- 2025 site: https://2025.sera.cx/
- Docs: https://docs.sera.cx/introduction
- Tutorial: https://docs.sera.cx/tutorials/order-lifecycle
- API Reference: https://docs.sera.cx/api-reference/overview
- **Official MCP**: https://github.com/sera-cx/sera-mcp
- **AI Agents**: https://github.com/sera-cx/sera-agents
- **Merchant Pay**: https://github.com/sera-cx/sera-pay
- **Contract v2**: https://github.com/sera-cx/orderbook-contract-v2

## Ecosystem Overview (2025–2026)

Sera has expanded from a DEX into a full multi-currency settlement infrastructure. The ecosystem now has four layers:

| Layer | Repo | Purpose |
|---|---|---|
| **Protocol** | `sera-cx/orderbook-contract-v2` | On-chain CLOB with SOR, dual-auth withdrawals |
| **MCP Server** | `sera-cx/sera-mcp` | 32-tool MCP for AI agents (production-grade) |
| **Agent Framework** | `sera-cx/sera-agents` | Templates + x402 protocol for AI payment agents |
| **Merchant Payments** | `sera-cx/sera-pay` | Dashboard + QR payment links for merchants |

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
- **GraphQL/API queries** → read `references/graphql-api.md`
- **Smart contract interactions** → read `references/smart-contracts.md`
- **Frontend patterns** → read `references/frontend-patterns.md`
- **MCP server (local sample)** → read `references/mcp-server.md`
- **AI Agents / official MCP** → read `references/sera-agents.md`

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

### Orderbook Contract v2

The v2 contract (`sera-cx/orderbook-contract-v2`) introduces major upgrades over v1:

| Feature | Details |
|---|---|
| **SOR (Smart Order Router)** | Multi-leg atomic route matching with transient balance optimization |
| **Dual-authorization withdrawals** | Both delayed (~24h) and instant paths via dual EIP-712 signatures |
| **EIP-712 / EIP-1271** | Structured signatures + smart contract wallet (AA) support |
| **Dynamic fee structure** | BPS denominator 1e14 for sub-basis-point precision |
| **Reentrancy protection** | EIP-1153 transient storage |
| **Token support** | Standard ERC20 only (no fee-on-transfer or rebasing tokens) |
| **Audit** | CertiK audit completed 2026-04-30 |
| **License** | PolyForm Noncommercial 1.0.0 |

Key contracts: `Sera.sol` (core), `SeraSOR.sol` (routing), `SeraBatcher.sol` (batch execution), `Vault.sol` (custody).

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

## Sera Pay (sera-cx/sera-pay)

Merchant-facing stablecoin payment application. Full-stack app (React + Express + Drizzle ORM).

### Features

- Wallet-based merchant authentication
- Dashboard: payment history, settings, menu management, developer tools
- Branded QR payment links (logo, colors, style per merchant)
- Stablecoin payment flow with FX rate display
- Cloudflare R2 storage for logos and menu images
- API server integration (secrets protected server-side)

### Setup

```bash
git clone https://github.com/sera-cx/sera-pay
pnpm install
cp .env.example .env
pnpm run dev
```

### Key Environment Variables

```bash
DATABASE_URL=...
SESSION_SECRET=...                 # Min 32 bytes, stable random value
SERA_CONFIG_ENCRYPTION_KEY=...     # Min 32 bytes, stable random value
SERA_API_BASE_URL=...
SERA_API_TESTNET_BASE_URL=...
CLOUDFLARE_R2_ACCOUNT_ID=...
CLOUDFLARE_R2_ACCESS_KEY_ID=...
CLOUDFLARE_R2_SECRET_ACCESS_KEY=...
CLOUDFLARE_R2_BUCKET=...
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
1. Ensure `PRIVATE_KEY` is set in `.env`
2. Fetch market info first (need `quoteUnit`, `minPrice`, `tickSpace`)
3. Calculate correct `priceIndex` from desired price
4. Approve the Router to spend your tokens
5. Call `limitBid` or `limitAsk` — read `references/smart-contracts.md` for full ABI details
6. Monitor via GraphQL, then claim when filled

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
1. For merchant-facing: use `sera-cx/sera-pay` (full-stack dashboard + QR links)
2. For agent-to-agent: implement x402 via `sera-cx/sera-agents/x402-service/`
3. For programmatic: call Sera API directly via `SERA_API_KEY` + `SERA_API_SECRET`

### "I want to cancel an order"
1. Use the Order Canceller contract at `0x53ad1ffcd7afb1b14c5f18be8f256606efb11b1b`
2. Each order is an NFT — cancel via token ID
3. Functions: `cancel()`, `cancelTo()` (cancel and redirect proceeds)

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
| Backend (sera-pay) | Express | — |
| ORM (sera-pay) | Drizzle ORM | — |
| Package manager (sera-pay) | pnpm | — |

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
