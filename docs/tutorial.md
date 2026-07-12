# Tutorials

## Order Lifecycle Tutorial

Build a complete trading script using GraphQL and Smart Contracts

### Order Lifecycle Tutorial

This tutorial demonstrates how to build a complete trading script that uses both the GraphQL API (for reading data) and Smart Contracts (for executing trades) on Sera Protocol.

### What You'll Learn

- Query market information via GraphQL
- Fetch order book depth via GraphQL
- Place a limit order via Smart Contract
- Monitor order status via GraphQL
- Claim proceeds via Smart Contract

### Prerequisites

- Python 3.9+
- An Ethereum wallet with Sepolia testnet ETH
- Testnet stablecoins (users are airdropped 10M tokens of each supported stablecoin)

## Setup

### 1. Install Dependencies

```bash
pip install web3 requests python-dotenv
```

### 2. Create Environment File

Create a `.env` file with your private key:

```env
# Your wallet private key (NEVER share this!)
PRIVATE_KEY="0x..."

# Sepolia RPC endpoint (optional, has default)
SEPOLIA_RPC_URL="https://0xrpc.io/sep"
```

> **Note:** The script uses the live EURC/XSGD stablecoin market by default. All testnet users are airdropped 10M tokens of each supported stablecoin.
>
> Never commit your private key to version control. Add `.env` to your `.gitignore`.

### Contract ABIs

The script uses minimal ABI definitions to interact with the smart contracts. For the complete ABI reference, see the [Market Router documentation](#).

## The Complete Script

Below is a ~300-line Python script that demonstrates the complete order lifecycle.

## Step-by-Step Breakdown

### Step 1: Query Market Info (GraphQL)

First, we fetch market parameters using the GraphQL API:

```python
def get_market_info(market_id: str) -> Dict[str, Any]:
  query = """
  query GetMarket($id: ID!) {
    market(id: $id) {
      id
      quoteToken { id symbol decimals }
      baseToken { id symbol decimals }
      quoteUnit
      minPrice
      tickSpace
      latestPriceIndex
    }
  }
  """
  response = requests.post(SUBGRAPH_URL, json={"query": query, "variables": {"id": market_id.lower()}})
  return response.json()["data"]["market"]
```

This returns essential information like:

- Token addresses and symbols
- `quoteUnit` for amount conversions
- `minPrice` and `tickSpace` for price calculations

### Step 2: Fetch Order Book Depth (GraphQL)

Query current bids and asks:

```graphql
query GetDepth($market: String!) {
  bids: depths(
    where: { market: $market, isBid: true, rawAmount_gt: "0" }
    orderBy: priceIndex
    orderDirection: desc
    first: 10
  ) {
    priceIndex
    price
    rawAmount
  }
  asks: depths(
    where: { market: $market, isBid: false, rawAmount_gt: "0" }
    orderBy: priceIndex
    orderDirection: asc
    first: 10
  ) {
    priceIndex
    price
    rawAmount
  }
}
```

### Step 3: Place a Limit Order (Smart Contract)

Connect to the router contract and submit a limit bid:

```python
from web3 import Web3

w3 = Web3(Web3.HTTPProvider(RPC_URL))
router = w3.eth.contract(address=ROUTER_ADDRESS, abi=ROUTER_ABI)

params = (
  market_address,      # market
  deadline,            # Unix timestamp
  0,                   # claimBounty (unused)
  user_address,        # your address
  price_index,         # price book index
  raw_amount,          # quote amount in raw units
  True,                # postOnly
  False,               # useNative
  0                    # baseAmount (not used for bids)
)

tx = router.functions.limitBid(params).build_transaction({...})
signed = account.sign_transaction(tx)
tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
```

### Step 4: Monitor Order Status (GraphQL)

Poll for order updates:

```graphql
query GetOrders($user: String!, $market: String!) {
  openOrders(
    where: { user: $user, market: $market }
    orderBy: createdAt
    orderDirection: desc
  ) {
    priceIndex
    rawAmount
    rawFilledAmount
    claimableAmount
    status
  }
}
```

Order statuses:

| Status | Description |
|--------|-------------|
| `open` | Order is active on the book |
| `partial` | Partially filled |
| `filled` | Completely filled |
| `cancelled` | Cancelled by user |
| `claimed` | Proceeds have been claimed |

### Step 5: Claim Proceeds (Smart Contract)

When your order is filled, claim your tokens:

```python
claim_params = [(
  market_address,
  [(is_bid, price_index, order_index)]  # OrderKey
)]

tx = router.functions.claim(deadline, claim_params).build_transaction({...})
```

## Running the Demo

```bash
# Set up environment
export PRIVATE_KEY="0x..."

# Run the script
python order_lifecycle.py
```

Expected output:

```
============================================================
  Sera Protocol - Order Lifecycle Demo
============================================================

[1/6] Connecting to Ethereum Sepolia...
  ✓ Connected to chain ID: 11155111
  ✓ Wallet address: 0x...

[2/6] Fetching market info (GraphQL)...
  ✓ Market: TWETH/TUSDC
  ✓ Quote unit: 1000

[3/6] Fetching order book depth (GraphQL)...
  BIDS                 |                 ASKS
  100.0000 @ 9950000   |   10000 @ 100.0100

[4/6] Checking your existing orders (GraphQL)...
  Found 5 order(s)

[5/6] Placing a limit bid order (Smart Contract)...
  Transaction sent: 0x1db79ea...
  ✓ Order placed in block 9802274

[6/6] Verifying order status (GraphQL)...
  Status: pending
```

## Key Takeaways

| Operation | API Used | Description |
|-----------|----------|-------------|
| Read market data | GraphQL | Fast, no gas cost |
| Read order book | GraphQL | Real-time depth |
| Read order status | GraphQL | Polling for updates |
| Place orders | Smart Contract | Requires gas + approval |
| Cancel orders | Smart Contract | Via OrderCanceler |
| Claim proceeds | Smart Contract | Via Router.claim() |

**Best Practice:** Use GraphQL for all read operations (free and fast). Only use smart contracts when you need to modify state (place/cancel/claim).

## Next Steps

- [Markets Query Reference](#) - Full market query options
- [Orders Query Reference](#) - Order tracking queries
- [Router Contract Reference](#) - All router functions
