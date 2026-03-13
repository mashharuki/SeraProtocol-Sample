---
name: sera-protocol
description: "Comprehensive development guide for building applications on Sera Protocol — a fully on-chain Central Limit Order Book (CLOB) DEX for stablecoin FX trading on Ethereum. Use this skill whenever the user mentions Sera Protocol, SeraProtocol, CLOB DEX, stablecoin order book, on-chain FX, or wants to: query Sera's GraphQL subgraph, interact with Sera smart contracts (Router, OrderBook, PriceBook), place/cancel/claim limit or market orders, build trading UIs, integrate Sera APIs, set up an MCP server for Sera, or work with anything in the SeraProtocol-Sample repository. Also trigger when the user references priceIndex, rawAmount, quoteUnit, order book depth, or Sera-specific contract addresses. Even if the user just says 'place an order' or 'get market data' in the context of this repo, use this skill."
---

# Sera Protocol Development Guide

You are an expert Sera Protocol developer. This skill gives you everything needed to help users build applications on Sera Protocol — from querying market data to placing on-chain orders to building full trading UIs.

## What is Sera Protocol?

Sera Protocol is a fully on-chain **Central Limit Order Book (CLOB)** decentralized exchange on Ethereum, designed as a global FX settlement protocol for stablecoin trading. Key properties:

- **Zero slippage**: Orders execute at exactly the specified price
- **Capital efficient**: No pooled liquidity — each order sits at a specific price level
- **NFT orders**: Every limit order is an NFT (transferable, composable with DeFi)
- **Maker-taker fees**: Takers ~0.1% (10 bps), makers ~-0.05% (5 bps rebate)
- **70+ stablecoins** across 20+ countries
- **Network**: Currently live on Ethereum Sepolia testnet (Chain ID: 11155111)

### Key Links
- Main site: https://sera.cx/ja
- 2025 site: https://2025.sera.cx/
- Docs: https://docs.sera.cx/introduction
- Tutorial: https://docs.sera.cx/tutorials/order-lifecycle
- API Reference: https://docs.sera.cx/api-reference/overview

## Repository Structure

This repo (`SeraProtocol-Sample`) contains four main modules:

```
SeraProtocol-Sample/
├── api-sample-app/   # Minimal GraphQL query example (Bun + TypeScript)
├── tutorial/          # Full order lifecycle CLI (place → monitor → claim)
├── frontend/          # React trading UI (Vite + ethers.js + Reown AppKit)
├── mcp-server/        # AI-friendly MCP trading server (viem + Zod)
└── data/              # Sample GraphQL response JSON files
```

When the user asks about a specific module, read the relevant reference file for implementation details:
- **GraphQL/API queries** → read `references/graphql-api.md`
- **Smart contract interactions** → read `references/smart-contracts.md`
- **Frontend patterns** → read `references/frontend-patterns.md`
- **MCP server** → read `references/mcp-server.md`

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
TRANSPORT=stdio              # MCP server: stdio or http
PORT=3000                    # MCP server HTTP port
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

### "I want to set up the MCP server"
1. Read `references/mcp-server.md` for tool definitions and setup
2. 8 tools: 5 read-only + 3 write operations
3. Supports stdio (Claude Code/Desktop) and HTTP transports

### "I want to cancel an order"
1. Use the Order Canceller contract at `0x53ad1ffcd7afb1b14c5f18be8f256606efb11b1b`
2. Each order is an NFT — cancel via token ID
3. Functions: `cancel()`, `cancelTo()` (cancel and redirect proceeds)

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
| Runtime (MCP) | Node.js | ^18+ |
| TypeScript | ~5.9.3 | |

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
