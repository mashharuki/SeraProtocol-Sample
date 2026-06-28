# サンプルコードを動かしてみた時のメモ

## x402のサンプルコード

```bash
cd sera-agents/x402-service && npm install && npm run demo
```

```bash
sera-x402 v0.3.0 starting on 127.0.0.1:8402 (mode=demo, network=base, mcp=/Users/harukikondo/Desktop/SERA MCP and AGENT/sera-mcp/dist/index.js, persistence=memory)
```

```bash
curl -X POST localhost:8402/x402/swap \
  -H 'Content-Type: application/json' \
  -d '{"from_currency":"USDC","to_currency":"MYR",
       "amount":100,"recipient":"0x51908F598A5e0d8F1A3bAbFa6DF76F9704daD072"}'
```

```json
{"payment_required":{"scheme":"exact","asset":"USDC","amount":"21.000000","chain":1,"network":"base","pay_to":"0x000000000000000000000000000000000000dEaD","payment_id":"ee6d507a-b387-483d-ba2e-7c8ffc5f4258","expires_at":1782622228},"quote_preview":{"target_currency":"MYR","target_amount":100,"recipient":"0x51908F598A5e0d8F1A3bAbFa6DF76F9704daD072","estimated_usdc_in":21,"surcharge_bps":0,"quote_source":"demo_mock"},"instructions":"Construct an EIP-3009 transferWithAuthorization for USDC to pay_to in the amount above, then retry this request with X-PAYMENT: <payment_id>:<authorization-base64> header.","demo":true}
```

## MCPの導入方法

```bash
cd sera-mcp && npm install && npm run build
```

以下を加えること

```json
"sera": {
  "command": "node",
  "args": ["/absolute/path/to/sera-mcp/dist/index.js"],
  "env": {
    "SERA_NETWORK": "mainnet",
    "POLICY_PRESET": "standard"
  }
}
```

ツール一覧

```bash

```