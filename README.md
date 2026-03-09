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