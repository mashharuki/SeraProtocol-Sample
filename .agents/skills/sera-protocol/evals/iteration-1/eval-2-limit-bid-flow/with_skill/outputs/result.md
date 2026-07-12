# Sera Protocol - limitBid 完全手順ガイド

priceIndex=12000, rawAmount=500 で limit bid を出すための完全な手順を、viem を使ったコードとともに解説する。

---

## 前提条件

- **ネットワーク**: Ethereum Sepolia テストネット (Chain ID: 11155111)
- **Router コントラクト**: `0x82bfe1b31b6c1c3d201a0256416a18d93331d99e`
- **デフォルト Market (TWETH/TUSDC)**: `0x002930b390ac7d686f07cffb9d7ce39609d082d1`
- **秘密鍵**: 環境変数 `PRIVATE_KEY` に `0x` prefix 付きで設定
- **Sepolia ETH**: ガス代として必要
- **quote トークン (TUSDC)**: `rawAmount * quoteUnit` 分の残高が必要

## 全体フロー

```
1. マーケット情報取得 (GraphQL)
2. オーダーブック取得 & postOnly 安全チェック
3. approve 量の計算
4. ERC20 approve (allowance 不足時のみ)
5. limitBid シミュレーション (revert 事前検出)
6. limitBid トランザクション送信
7. トランザクション確認待ち
8. GraphQL ポーリングで注文状態監視
```

---

## Step 1: マーケット情報の取得

GraphQL サブグラフから `quoteUnit` を取得する。これは approve 量の計算に必須。

```typescript
const SUBGRAPH_URL =
  "https://api.goldsky.com/api/public/project_cmicv6kkbhyto01u3agb155hg/subgraphs/sera-pro/1.0.9/gn";

const data = await querySubgraph(`
  query($id: ID!) {
    market(id: $id) {
      quoteToken { id symbol decimals }
      baseToken { id symbol decimals }
      quoteUnit
      latestPriceIndex
    }
  }
`, { id: MARKET_ADDRESS.toLowerCase() });

const quoteUnit = BigInt(data.market.quoteUnit);
const quoteTokenAddress = data.market.quoteToken.id;
```

**重要**: `quoteUnit` はマーケットごとに異なる定数で、rawAmount からオンチェーンの実際のトークン量への変換に使う。

---

## Step 2: オーダーブック取得 & postOnly 安全チェック

`postOnly: true` で発注する場合、bid の priceIndex が best ask 以上だと即時約定してリバートする。事前に best ask を確認し、必要なら priceIndex を調整する。

```typescript
const depth = await getOrderBook(MARKET_ADDRESS);

function resolvePostOnlyBidPriceIndex(desired: number, asks: DepthLevel[]): number {
  if (asks.length === 0) return desired;
  const bestAsk = parseInt(asks[0].priceIndex, 10);
  return Math.min(desired, bestAsk - 1);
}

const resolvedPriceIndex = resolvePostOnlyBidPriceIndex(12000, depth.asks);
```

---

## Step 3: approve 量の計算

bid の場合、approve が必要なのは **quote トークン** (例: TUSDC)。

```
approveAmount = rawAmount * quoteUnit
```

priceIndex=12000, rawAmount=500 の場合:
```typescript
const approveAmount = 500n * quoteUnit;  // 例: quoteUnit=1000000 なら 500_000_000
```

---

## Step 4: ERC20 approve (allowance チェック付き)

まず現在の allowance を確認し、不足している場合のみ approve tx を送る。

```typescript
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const account = privateKeyToAccount(PRIVATE_KEY);
const publicClient = createPublicClient({ chain: sepolia, transport: http(RPC_URL) });
const walletClient = createWalletClient({ account, chain: sepolia, transport: http(RPC_URL) });

// allowance チェック
const currentAllowance = await publicClient.readContract({
  address: quoteTokenAddress,
  abi: ERC20_ABI,
  functionName: "allowance",
  args: [account.address, ROUTER_ADDRESS],
});

if (currentAllowance < approveAmount) {
  const approveHash = await walletClient.writeContract({
    address: quoteTokenAddress,
    abi: ERC20_ABI,
    functionName: "approve",
    args: [ROUTER_ADDRESS, approveAmount],
    account,
    chain: sepolia,
  });

  // approve の確認を待つ
  const approveReceipt = await publicClient.waitForTransactionReceipt({ hash: approveHash });
  if (approveReceipt.status !== "success") {
    throw new Error("approve failed");
  }
}
```

---

## Step 5: limitBid シミュレーション

実際にガスを消費する前に `simulateContract` で revert を事前検出する。

```typescript
const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

const orderParams = {
  market: MARKET_ADDRESS,
  deadline,
  claimBounty: 0,
  user: account.address,
  priceIndex: resolvedPriceIndex,  // 12000 (またはpostOnly調整後の値)
  rawAmount: 500n,
  postOnly: true,
  useNative: false,
  baseAmount: 0n,
};

await publicClient.simulateContract({
  address: ROUTER_ADDRESS,
  abi: ROUTER_ABI,
  functionName: "limitBid",
  args: [orderParams],
  account,
  chain: sepolia,
  value: 0n,
});
```

**LimitOrderParams の各フィールド解説**:

| フィールド | 型 | 値 | 説明 |
|---|---|---|---|
| `market` | address | `0x002930...` | OrderBook コントラクトアドレス |
| `deadline` | uint64 | 現在+3600秒 | この時刻を過ぎるとtxがリバート |
| `claimBounty` | uint32 | 0 | 第三者による claim 報酬 (通常0) |
| `user` | address | 自分のアドレス | 約定後の受取先 |
| `priceIndex` | uint16 | 12000 | 価格レベルのインデックス |
| `rawAmount` | uint64 | 500 | quote トークンの raw 単位での数量 |
| `postOnly` | bool | true | maker-only (即時約定ならリバート) |
| `useNative` | bool | false | ETH直接使用しない (WETH使用) |
| `baseAmount` | uint256 | 0 | bid では 0 (ask の時に使用) |

---

## Step 6: limitBid トランザクション送信

```typescript
const txHash = await walletClient.writeContract({
  address: ROUTER_ADDRESS,
  abi: ROUTER_ABI,
  functionName: "limitBid",
  args: [orderParams],
  account,
  chain: sepolia,
  value: 0n,
});

console.log(`tx: https://sepolia.etherscan.io/tx/${txHash}`);
```

---

## Step 7: トランザクション確認待ち

```typescript
const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

console.log(`block: ${receipt.blockNumber}`);
console.log(`status: ${receipt.status}`);  // "success" or "reverted"
console.log(`gasUsed: ${receipt.gasUsed}`);
```

ガス目安: limitBid は約 500,000 gas。

---

## Step 8: 注文状態のポーリング監視

サブグラフのインデックスにはブロック確認後数秒かかるため、3秒間隔でポーリングする。

```typescript
for (let i = 1; i <= 5; i++) {
  await new Promise((r) => setTimeout(r, 3000));
  const orders = await getUserOrders(account.address, MARKET_ADDRESS);
  const latest = orders[0];
  if (!latest) continue;

  console.log(`status=${latest.status}, filled=${latest.rawFilledAmount}/${latest.rawAmount}`);

  if (latest.status === "filled") break;
}
```

**注文ステータス遷移**: `open` -> `partial` -> `filled` -> `claimed` (または `open` -> `cancelled`)

---

## Router ABI (limitBid 部分)

```json
{
  "name": "limitBid",
  "type": "function",
  "stateMutability": "payable",
  "inputs": [{
    "name": "params",
    "type": "tuple",
    "components": [
      { "name": "market", "type": "address" },
      { "name": "deadline", "type": "uint64" },
      { "name": "claimBounty", "type": "uint32" },
      { "name": "user", "type": "address" },
      { "name": "priceIndex", "type": "uint16" },
      { "name": "rawAmount", "type": "uint64" },
      { "name": "postOnly", "type": "bool" },
      { "name": "useNative", "type": "bool" },
      { "name": "baseAmount", "type": "uint256" }
    ]
  }],
  "outputs": []
}
```

---

## ERC20 ABI (最小限)

```json
[
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)"
]
```

---

## トラブルシューティング

| エラー | 原因 | 対処 |
|---|---|---|
| `ERC20InsufficientBalance` (0xe450d38c) | quote トークン残高不足 | テストネットでトークンを入手 |
| `execution reverted` | priceIndex 範囲外、approve 不足 | priceIndex を 0-65535 に、approve 量を再確認 |
| `postOnly` revert | 注文が即時約定する価格 | priceIndex を下げるか `resolvePostOnlyBidPriceIndex()` で調整 |
| `insufficient funds for gas` | Sepolia ETH 不足 | faucet から取得 |
| `INVALID_PRICE` | 価格が市場の有効範囲外 | `minPrice <= price <= priceUpperBound` を確認 |

---

## 完全な実行可能コード

同ディレクトリの `placeLimitBid.ts` に、上記すべてのステップを統合した単一ファイルのスクリプトを用意した。

```bash
# 実行方法
PRIVATE_KEY=0x... npx tsx placeLimitBid.ts
```

このスクリプトは以下を順番に実行する:
1. GraphQL でマーケット情報 + オーダーブック取得
2. postOnly 安全チェック
3. allowance 確認 + 必要なら approve 送信 + 確認待ち
4. limitBid simulate で事前検証
5. limitBid tx 送信 + 確認待ち
6. 3秒 x 5回のポーリングで注文状態監視
