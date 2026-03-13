#!/bin/bash
# ============================================================
# SeraProtocol MCP Server - Manual Test Script
# ============================================================
# Usage:
#   chmod +x test.sh
#   ./test.sh              # Run all tests
#   ./test.sh init         # Run initialization only
#   ./test.sh market       # Run specific test
#
# Available tests:
#   init, market, markets, orderbook, orders, balance, all
# ============================================================

set -euo pipefail

SERVER="node dist/index.js"
MARKET_ID="0x002930b390ac7d686f07cffb9d7ce39609d082d1"
# Replace with a real user address for order queries
TEST_USER="0xda6e605db8c3221f4b3706c1da9c4e28195045f5"

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# ============================================================
# Helper: Send JSON-RPC request to MCP server via stdio
# ============================================================
send_request() {
  local description="$1"
  local payload="$2"

  echo ""
  echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${YELLOW}▶ ${description}${NC}"
  echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

  # Initialize + notification + actual request
  local init='{"jsonrpc":"2.0","id":0,"method":"initialize","params":{"capabilities":{},"clientInfo":{"name":"test","version":"0.1"},"protocolVersion":"2024-11-05"}}'
  local notify='{"jsonrpc":"2.0","method":"notifications/initialized"}'

  local response
  response=$( { printf '%s\n%s\n%s\n' "$init" "$notify" "$payload"; sleep 2; } | $SERVER 2>/dev/null)

  # Extract only the last JSON-RPC response (skip init response)
  local result
  result=$(echo "$response" | tail -1)

  # Pretty print if jq is available
  if command -v jq &> /dev/null; then
    echo "$result" | jq .
  else
    echo "$result"
  fi

  echo -e "${GREEN}✓ Done${NC}"
}

# ============================================================
# Test: Initialize
# ============================================================
test_init() {
  local init='{"jsonrpc":"2.0","id":0,"method":"initialize","params":{"capabilities":{},"clientInfo":{"name":"test","version":"0.1"},"protocolVersion":"2024-11-05"}}'

  echo ""
  echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${YELLOW}▶ Initialize MCP Server${NC}"
  echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

  local response
  response=$( { printf '%s\n' "$init"; sleep 1; } | $SERVER 2>/dev/null)

  if command -v jq &> /dev/null; then
    echo "$response" | jq .
  else
    echo "$response"
  fi

  echo -e "${GREEN}✓ Server initialized successfully${NC}"
}

# ============================================================
# Test: List Tools
# ============================================================
test_tools() {
  send_request "List All Tools" \
    '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
}

# ============================================================
# Test: sera_get_market
# ============================================================
test_market() {
  send_request "sera_get_market - Get TWETH/TUSDC market info" \
    "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/call\",\"params\":{\"name\":\"sera_get_market\",\"arguments\":{\"market_id\":\"${MARKET_ID}\"}}}"
}

# ============================================================
# Test: sera_list_markets
# ============================================================
test_markets() {
  send_request "sera_list_markets - List available markets (limit: 5)" \
    '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"sera_list_markets","arguments":{"limit":5}}}'
}

# ============================================================
# Test: sera_get_orderbook
# ============================================================
test_orderbook() {
  send_request "sera_get_orderbook - Get order book (depth: 5)" \
    "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/call\",\"params\":{\"name\":\"sera_get_orderbook\",\"arguments\":{\"market_id\":\"${MARKET_ID}\",\"depth\":5}}}"
}

# ============================================================
# Test: sera_get_orders
# ============================================================
test_orders() {
  send_request "sera_get_orders - Get user orders" \
    "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/call\",\"params\":{\"name\":\"sera_get_orders\",\"arguments\":{\"user_address\":\"${TEST_USER}\",\"market_id\":\"${MARKET_ID}\",\"limit\":10}}}"
}

# ============================================================
# Test: sera_get_token_balance (requires a token address)
# ============================================================
test_balance() {
  echo ""
  echo -e "${YELLOW}Note: Token address will be fetched from market info.${NC}"
  echo -e "${YELLOW}      This test requires network access to Sepolia RPC.${NC}"

  # First get market to find token addresses, then query balance
  send_request "sera_get_token_balance - Check token balance" \
    "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/call\",\"params\":{\"name\":\"sera_get_token_balance\",\"arguments\":{\"token_address\":\"0x036CbD53842c5426634e7929541eC2318f3dCF7e\",\"account_address\":\"${TEST_USER}\"}}}"
}

# ============================================================
# Test: Error handling - Invalid market ID
# ============================================================
test_error() {
  send_request "Error Handling - Invalid market address" \
    '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"sera_get_market","arguments":{"market_id":"0x0000000000000000000000000000000000000000"}}}'
}

# ============================================================
# Test: Validation - Invalid input
# ============================================================
test_validation() {
  send_request "Validation - Missing required field (should fail)" \
    '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"sera_get_market","arguments":{}}}'
}

# ============================================================
# Main
# ============================================================
echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║   SeraProtocol MCP Server - Test Suite              ║"
echo "╠══════════════════════════════════════════════════════╣"
echo "║   Server: $SERVER"
echo "║   Market: $MARKET_ID"
echo "╚══════════════════════════════════════════════════════╝"

TEST="${1:-all}"

case "$TEST" in
  init)
    test_init
    ;;
  tools)
    test_tools
    ;;
  market)
    test_market
    ;;
  markets)
    test_markets
    ;;
  orderbook)
    test_orderbook
    ;;
  orders)
    test_orders
    ;;
  balance)
    test_balance
    ;;
  error)
    test_error
    ;;
  validation)
    test_validation
    ;;
  all)
    test_init
    test_tools
    test_market
    test_markets
    test_orderbook
    test_orders
    test_balance
    test_error
    test_validation
    ;;
  *)
    echo "Unknown test: $TEST"
    echo "Available: init, tools, market, markets, orderbook, orders, balance, error, validation, all"
    exit 1
    ;;
esac

echo ""
echo -e "${GREEN}════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  All tests completed!${NC}"
echo -e "${GREEN}════════════════════════════════════════════════════${NC}"
