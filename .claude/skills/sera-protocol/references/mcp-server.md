# Sera Protocol MCP Server Reference

## Table of Contents
1. [Overview](#overview)
2. [Tools](#tools)
3. [Setup](#setup)
4. [Client Configuration](#client-config)
5. [HTTP Transport](#http)
6. [Service Layer](#services)
7. [Schemas](#schemas)

---

## Overview {#overview}

The MCP server at `mcp-server/` provides AI-friendly access to Sera Protocol through 8 tools. It enables natural language trading — ask Claude to check markets, place orders, and claim proceeds.

**Tech stack**: MCP SDK v1.6.1, viem, Zod, TypeScript
**Transports**: stdio (default, for Claude Code/Desktop) or HTTP (remote access)

---

## Tools {#tools}

### Read-Only Tools (no PRIVATE_KEY required)

| Tool | Description | Input |
|---|---|---|
| `sera_get_market` | Get market info (tokens, fees, price range) | `market_id`: address |
| `sera_list_markets` | List available markets | `limit`: 1–100 (default 10) |
| `sera_get_orderbook` | Get order book (bids + asks) | `market_id`: address, `depth`: 1–50 (default 10) |
| `sera_get_orders` | Get user's orders | `user_address`: address, `market_id`: address, `limit`: 1–100 |
| `sera_get_token_balance` | Check ERC20 token balance | `token_address`: address, `account_address?`: address |

### Write Tools (PRIVATE_KEY required)

| Tool | Description | Input |
|---|---|---|
| `sera_place_order` | Place limit bid/ask | `market_id`, `price_index`, `raw_amount`, `is_bid`, `post_only?` |
| `sera_claim_order` | Claim filled order proceeds | `market_id`, `is_bid`, `price_index`, `order_index` |
| `sera_approve_token` | Approve ERC20 for Router | `token_address`, `amount`, `spender?` (default: Router) |

---

## Setup {#setup}

```bash
cd mcp-server

# Install
npm install

# Build
npm run build

# Configure environment
cp .env.example .env
# Required for write operations:
#   PRIVATE_KEY=0x[64-hex-chars]
# Optional:
#   SEPOLIA_RPC_URL=https://0xrpc.io/sep

# Run (stdio mode — for Claude Code/Desktop)
npm start

# Run (HTTP mode — for remote access)
TRANSPORT=http npm run start:http
# Listens on http://localhost:3000/mcp
```

---

## Client Configuration {#client-config}

### Claude Code (`~/.claude/settings.json` or project `.mcp.json`)

```json
{
  "mcpServers": {
    "sera-protocol": {
      "command": "node",
      "args": ["<path>/mcp-server/dist/index.js"],
      "env": {
        "PRIVATE_KEY": "0x...",
        "SEPOLIA_RPC_URL": "https://0xrpc.io/sep"
      }
    }
  }
}
```

### Claude Desktop (`claude_desktop_config.json`)

```json
{
  "mcpServers": {
    "sera-protocol": {
      "command": "node",
      "args": ["<path>/mcp-server/dist/index.js"],
      "env": {
        "PRIVATE_KEY": "0x...",
        "SEPOLIA_RPC_URL": "https://0xrpc.io/sep"
      }
    }
  }
}
```

---

## HTTP Transport {#http}

When `TRANSPORT=http`, the server provides a Streamable HTTP endpoint:

**Endpoint**: `POST /mcp`

Supports MCP session management with `Mcp-Session-Id` header.

```bash
# Test with MCP Inspector
npx @modelcontextprotocol/inspector http://localhost:3000/mcp
```

---

## Service Layer {#services}

### subgraph.ts — GraphQL Query Functions

```typescript
getMarketInfo(marketId: string): Promise<Market>
listMarkets(limit: number): Promise<Market[]>
getOrderBook(marketId: string, depth: number): Promise<{ bids: Depth[], asks: Depth[] }>
getUserOrders(userAddress: string, marketId: string, limit: number): Promise<OpenOrder[]>
```

### blockchain.ts — Transaction Functions

```typescript
getTokenBalance(tokenAddress: string, accountAddress?: string): Promise<bigint>
getAllowance(tokenAddress: string, ownerAddress: string, spenderAddress: string): Promise<bigint>
approveToken(tokenAddress: string, amount: bigint, spenderAddress?: string): Promise<string>
placeLimitOrder(params: PlaceOrderParams): Promise<string>
claimOrder(params: ClaimOrderParams): Promise<string>
getConfiguredAddress(): string  // Returns address derived from PRIVATE_KEY
```

### format.ts — Display Formatting

```typescript
formatPrice(price: string, decimals?: number): string          // "1234567890000000000" → "1.23"
formatAmount(rawAmount: string, quoteUnit: string): string      // Raw to human-readable
formatTokenAmount(amount: bigint, decimals: number): string     // BigInt to decimal string
truncateAddress(address: string): string                        // "0x1234...5678"
```

---

## Schemas (Zod) {#schemas}

```typescript
// Address validation
const AddressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/);

// Place order input
const PlaceOrderInputSchema = z.object({
  market_id: AddressSchema,
  price_index: z.number().int().min(0).max(65535),
  raw_amount: z.number().int().min(1),
  is_bid: z.boolean(),
  post_only: z.boolean().optional().default(true),
});

// Claim order input
const ClaimOrderInputSchema = z.object({
  market_id: AddressSchema,
  is_bid: z.boolean(),
  price_index: z.number().int().min(0).max(65535),
  order_index: z.number().int().min(0),
});

// Approve token input
const ApproveTokenInputSchema = z.object({
  token_address: AddressSchema,
  amount: z.string(),
  spender: AddressSchema.optional(),  // Defaults to Router address
});
```

---

## Typical MCP Workflow

```
User: "Show me the TWETH/TUSDC market"
→ sera_get_market(market_id: "0x002930b390ac7d686f07cffb9d7ce39609d082d1")

User: "What does the order book look like?"
→ sera_get_orderbook(market_id: "0x...", depth: 10)

User: "Place a bid at price index 12000 for 1000 raw units"
→ sera_approve_token(token_address: quoteTokenAddress, amount: "...")
→ sera_place_order(market_id: "0x...", price_index: 12000, raw_amount: 1000, is_bid: true)

User: "Check my orders"
→ sera_get_orders(user_address: "0x...", market_id: "0x...", limit: 10)

User: "Claim my filled order"
→ sera_claim_order(market_id: "0x...", is_bid: true, price_index: 12000, order_index: 0)
```
