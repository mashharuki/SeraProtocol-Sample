# SeraProtocol-Sample

Sera Protocol Sample Repo

## Sample Query

### Market

```bash
curl -s -X POST \
  -H "Content-Type: application/json" \
  -d '{"query": "{ market(id: \"0xd99802ee8f16d6ff929e27546de15d03fdcce4bd\") { id quoteToken { symbol decimals } baseToken { symbol decimals } quoteUnit makerFee takerFee minPrice tickSpace latestPrice } }"}' \
  https://api.goldsky.com/api/public/project_cmicv6kkbhyto01u3agb155hg/subgraphs/sera-pro/1.0.9/gn | jq
```

list

```bash
curl -s -X POST \
  -H "Content-Type: application/json" \
  -d '{"query": "{ markets(first: 5) { id quoteToken { symbol } baseToken { symbol } latestPrice latestPriceIndex } }"}' \
  https://api.goldsky.com/api/public/project_cmicv6kkbhyto01u3agb155hg/subgraphs/sera-pro/1.0.9/gn | jq
```

### Order

```bash
curl -s -X POST \
  -H "Content-Type: application/json" \
  -d '{"query": "{ openOrders(first: 10, where: { user: \"0xda6e605db8c3221f4b3706c1da9c4e28195045f5\" }) { id market { id } priceIndex isBid rawAmount status } }"}' \
  https://api.goldsky.com/api/public/project_cmicv6kkbhyto01u3agb155hg/subgraphs/sera-pro/1.0.9/gn | jq
```

### Depths

```bash
curl -s -X POST \
  -H "Content-Type: application/json" \
  -d '{"query": "{ depths(first: 10, where: { market: \"0xd99802ee8f16d6ff929e27546de15d03fdcce4bd\", isBid: true, rawAmount_gt: \"0\" }, orderBy: priceIndex, orderDirection: desc) { priceIndex price rawAmount } }"}' \
  https://api.goldsky.com/api/public/project_cmicv6kkbhyto01u3agb155hg/subgraphs/sera-pro/1.0.9/gn | jq
```

### Charts

```bash
curl -s -X POST \
  -H "Content-Type: application/json" \
  -d '{"query": "{ chartLogs(first: 7, where: { market: \"0xd99802ee8f16d6ff929e27546de15d03fdcce4bd\", intervalType: \"1d\" }, orderBy: timestamp, orderDirection: desc) { timestamp open high low close baseVolume } }"}' \
  https://api.goldsky.com/api/public/project_cmicv6kkbhyto01u3agb155hg/subgraphs/sera-pro/1.0.9/gn | jq
```

### Tokens

```bash
curl -s -X POST \
  -H "Content-Type: application/json" \
  -d '{"query": "{ tokens(where: { symbol_contains_nocase: \"USD\" }) { id symbol name decimals } }"}' \
  https://api.goldsky.com/api/public/project_cmicv6kkbhyto01u3agb155hg/subgraphs/sera-pro/1.0.9/gn | jq
```

## Reference
- [Testnet App](https://testnet.sera.cx/)
- [Sera Agent Page](https://agents.sera.cx/)
- [GitHub sera-cx/sera-agents](https://github.com/sera-cx/sera-agents/tree/main)
- [GitHub Sera MCP](https://github.com/sera-cx/sera-mcp)
- [DeepWiki GitHub Sera MCP](https://deepwiki.com/sera-cx/sera-mcp)
- [Deepwiki sera-cx/sera-agents](https://deepwiki.com/sera-cx/sera-agents)
- [DeepWiki Sera Agent Guide](https://deepwiki.com/search/_108fa0cb-1bd7-4ff8-8e34-9fad481690c4)
- [GitHub SeraProtocol OrderBook Contract V2](https://github.com/sera-cx/orderbook-contract-v2)
- [GitHub Sera Pay](https://github.com/sera-cx/sera-pay)
- [Deepwiki SeraProtocol OrderBook Contract V2](https://deepwiki.com/sera-cx/orderbook-contract-v2)
- [Deepwiki Sera Pay](https://deepwiki.com/sera-cx/sera-pay)
- [ドキュメント](https://docs.testnet.sera.cx/)