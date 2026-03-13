# SeraProtocol MCP Server

This is a [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server for the decentralized order book trading protocol, SeraProtocol, operable via **natural language**.

By connecting with MCP-compatible clients like Claude Code or Claude Desktop, you can read and write on-chain order books simply by conversing, e.g., "Show me the order book" or "Place a buy order".

---

## Overview

```
┌──────────────────────┐      stdio / JSON-RPC       ┌──────────────────────┐
│                      │ ◄──────────────────────────► │                      │
│   MCP Client         │                              │  sera-mcp-server     │
│   (Claude Code,      │                              │                      │
│    Claude Desktop)   │                              │  ┌────────────────┐  │
│                      │                              │  │ Subgraph API   │──┼──► GraphQL (Read)
│   Natural Language   │                              │  └────────────────┘  │
│   "Show order book"  │                              │  ┌────────────────┐  │
│                      │                              │  │ viem + RPC     │──┼──► Ethereum Sepolia (Write)
└──────────────────────┘                              │  └────────────────┘  │
                            └──────────────────────┘
```

### Features

- **No wallet required for read operations** — Instantly fetch market info, order book, and order list via subgraph
- **Simulate write operations before sending transactions** — Detect potentially failing orders in advance
- **Schema validation with Zod** — Invalid parameters are blocked on the MCP side
- **Responses include Etherscan links** — Instantly check transaction results

---

## Tool List

### Read-only Tools (No PRIVATE_KEY required)

| Tool | Description | Main Use |
|------|-------------|----------|
| `sera_get_market` | Get market info | Check token pairs, fees, latest price |
| `sera_list_markets` | List available markets | Find out which markets exist |
| `sera_get_orderbook` | Get order book | Check bid/ask prices and amounts |
| `sera_get_orders` | List user orders | Check your order status and claimable orders |
| `sera_get_token_balance` | Check token balance | View ERC20 balance in wallet |

### Write Tools (PRIVATE_KEY required)

| Tool | Description | Main Use |
|------|-------------|----------|
| `sera_place_order` | Place limit order | Submit buy/sell orders at specified price |
| `sera_claim_order` | Claim filled order | Collect tokens from filled orders |
| `sera_approve_token` | Approve token | ERC20 approve for Router contract |

---

## Setup

### Prerequisites

- Node.js >= 24
- npm

### 1. Build

```bash
cd mcp-server
npm install
npm run build
```

### 2. Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `TRANSPORT` | No | `stdio` (default) or `http` |
| `PORT` | No | HTTP port (default: `3000`, only used with `TRANSPORT=http`) |
| `PRIVATE_KEY` | For write operations only | `0x` + 64 hex chars. Not needed for read-only |
| `SEPOLIA_RPC_URL` | No | Custom RPC URL (default: `https://0xrpc.io/sep`) |

> **Note**: Use only testnet keys for PRIVATE_KEY. Never set mainnet private keys.

### 3. Start the Server

```bash
# stdio mode (default) - for Claude Code / Claude Desktop
npm start

# HTTP mode - for remote access / ChatGPT / web clients
npm run start:http          # default port 3000
PORT=8080 npm run start:http  # custom port
```

HTTP mode exposes the following endpoints:

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/mcp` | MCP JSON-RPC endpoint |
| `GET` | `/health` | Health check |
| `DELETE` | `/mcp` | Close session |

---

## Client Configuration

### Claude Code

Add to `.claude/settings.local.json` in your project:

```json
{
  "mcpServers": {
  "sera": {
    "command": "node",
    "args": ["./mcp-server/dist/index.js"],
    "env": {
    "PRIVATE_KEY": "0x...",
    "SEPOLIA_RPC_URL": "https://0xrpc.io/sep"
    }
  }
  }
}
```

### Claude Desktop

`~/Library/Application Support/Claude/claude_desktop_config.json` (macOS):

```json
{
  "mcpServers": {
  "sera": {
    "command": "node",
    "args": ["/absolute/path/to/mcp-server/dist/index.js"],
    "env": {
    "PRIVATE_KEY": "0x..."
    }
  }
  }
}
```

---

## Usage

After connecting with an MCP client, you can operate SeraProtocol using natural language instructions.

### Check Market Info

```
> Show me the market info

# Market: TWETH/TUSDC
- Latest Price: 100.0000 TUSDC
- Maker Fee: 0 / Taker Fee: 0
- Quote Unit: 1000
...
```

### Check Order Book

```
> Show me the order book for TWETH/TUSDC

# Order Book: TWETH/TUSDC
## Asks (Sell Orders)
| Price Index | Price   | Amount |
|-------------|---------|--------|
| 105         | 105.00  | 500    |
...

## Bids (Buy Orders)
| Price Index | Price   | Amount |
|-------------|---------|--------|
| 99          | 99.00   | 1,000  |
...
```

### Place an Order

```
> Place a buy order at price index 100 for 1000

# Order Placed Successfully
- Type: BID (Buy)
- Price Index: 100
- Transaction: 0xabc...
- Explorer: https://sepolia.etherscan.io/tx/0xabc...
```

### Claim an Order

```
> Claim filled orders

# Order Claimed Successfully
- Transaction: 0xdef...
- Explorer: https://sepolia.etherscan.io/tx/0xdef...
```

### Typical Workflow

```
1. sera_list_markets        → Find markets
2. sera_get_market          → Check details
3. sera_get_orderbook       → Decide price from order book
4. sera_get_token_balance   → Check balance
5. sera_approve_token       → Approve token for Router
6. sera_place_order         → Place order
7. sera_get_orders          → Monitor order status
8. sera_claim_order         → Claim after filled
```

---

## Project Structure

```
mcp-server/
├── src/
│   ├── index.ts              # Entry point (stdio transport)
│   ├── constants.ts          # ABI, contract addresses, chain settings
│   ├── types.ts              # TypeScript type definitions
│   ├── schemas/
│   │   └── index.ts          # Zod validation schemas
│   ├── services/
│   │   ├── subgraph.ts       # GraphQL subgraph queries
│   │   ├── blockchain.ts     # On-chain operations via viem
│   │   └── format.ts         # Price/amount formatter
│   └── tools/
│       ├── read-tools.ts     # Read-only tools (5)
│       └── write-tools.ts    # Write tools (3)
├── dist/                     # Build output
├── package.json
├── tsconfig.json
└── README.md
```

---

## Network Info

| Item | Value |
|------|-------|
| Chain | Ethereum Sepolia Testnet |
| Chain ID | `11155111` |
| Router | `0x82bfe1b31b6c1c3d201a0256416a18d93331d99e` |
| Default Market | `0x002930b390ac7d686f07cffb9d7ce39609d082d1` (TWETH/TUSDC) |
| Subgraph | `https://api.goldsky.com/.../sera-pro/1.0.9/gn` |
| Block Explorer | `https://sepolia.etherscan.io` |

---

## Tech Stack

| Tech | Purpose |
|------|---------|
| [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk) | MCP protocol implementation |
| [viem](https://viem.sh/) | Ethereum client (transaction sending, contract calls) |
| [Zod](https://zod.dev/) | Runtime input validation |
| [Goldsky Subgraph](https://goldsky.com/) | On-chain data via GraphQL |

---

## Development

```bash
# Development mode - stdio (auto reload on file changes)
npm run dev

# Development mode - HTTP
npm run dev:http

# Build
npm run build

# Run - stdio
npm start

# Run - HTTP (port 3000)
npm run start:http
```

### Test with HTTP Client

Start the server in HTTP mode, then use `test.http` (VS Code REST Client / IntelliJ HTTP Client):

```bash
npm run start:http
# Open test.http in your editor and run requests in order
```

Or use curl:

```bash
# Health check
curl http://localhost:3000/health

# Initialize session
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":0,"method":"initialize","params":{"capabilities":{},"clientInfo":{"name":"test","version":"0.1"},"protocolVersion":"2024-11-05"}}'

# Call tool (replace SESSION_ID with mcp-session-id from init response)
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "mcp-session-id: SESSION_ID" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"sera_get_market","arguments":{"market_id":"0x002930b390ac7d686f07cffb9d7ce39609d082d1"}}}'
```

### Test with MCP Inspector

```bash
npx @modelcontextprotocol/inspector node dist/index.js
```

### Test with ChatGPT

```bash
ngrok http 3000
```

---

## License

This project is part of the [SeraProtocol-Sample](https://github.com/SeraProtocol/SeraProtocol-Sample) repository.

