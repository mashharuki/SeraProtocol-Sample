# Sera Protocol: limitBid を出す完全な手順

## 概要

Sera Protocol は Ethereum Sepolia 上の CLOB (Central Limit Order Book) DEX です。`limitBid` は指値の買い注文を出すための Router コントラクトの関数です。

- **Router**: `0x82bfe1b31b6c1c3d201a0256416a18d93331d99e`
- **Market**: `0x002930b390ac7d686f07cffb9d7ce39609d082d1`
- **Network**: Ethereum Sepolia (chainId: 11155111)

---

## 手順の全体像

```
1. ウォレット & viem クライアントのセットアップ
2. Quote トークンの approve（Router への支出許可）
3. limitBid トランザクションの送信
4. トランザクションの確認待ち
```

---

## Step 1: viem クライアントのセットアップ

```typescript
import {
  createPublicClient,
  createWalletClient,
  http,
  defineChain,
  type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const RPC_URL = "https://0xrpc.io/sep";

const sepolia = defineChain({
  id: 11155111,
  name: "Sepolia",
  network: "sepolia",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: [RPC_URL] },
    public: { http: [RPC_URL] },
  },
});

const account = privateKeyToAccount("0x...");  // your private key

const publicClient = createPublicClient({
  chain: sepolia,
  transport: http(RPC_URL),
});

const walletClient = createWalletClient({
  account,
  chain: sepolia,
  transport: http(RPC_URL),
});
```

---

## Step 2: Quote トークンの approve

`limitBid`（買い注文）では **Quote トークン**を消費します。Router コントラクトが Quote トークンを transfer できるよう、事前に `approve` が必要です。

### 2-1. 現在の allowance を確認

```typescript
const ROUTER_ADDRESS: Address = "0x82bfe1b31b6c1c3d201a0256416a18d93331d99e";
const QUOTE_TOKEN_ADDRESS: Address = "0x..."; // マーケットの quote token

const ERC20_ABI = [
  {
    name: "approve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "allowance",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

const currentAllowance = await publicClient.readContract({
  address: QUOTE_TOKEN_ADDRESS,
  abi: ERC20_ABI,
  functionName: "allowance",
  args: [account.address, ROUTER_ADDRESS],
});
```

### 2-2. 不足していれば approve を送信 & 確認待ち

```typescript
const approveAmount = 500n * 10_000n; // 十分な額を承認

if (currentAllowance < approveAmount) {
  const approveHash = await walletClient.writeContract({
    address: QUOTE_TOKEN_ADDRESS,
    abi: ERC20_ABI,
    functionName: "approve",
    args: [ROUTER_ADDRESS, approveAmount],
    account,
    chain: sepolia,
  });

  // トランザクション確認待ち
  const approveReceipt = await publicClient.waitForTransactionReceipt({
    hash: approveHash,
  });
  console.log(`Approve confirmed: block ${approveReceipt.blockNumber}`);
}
```

---

## Step 3: limitBid トランザクションの送信

### 3-0. ABI 定義

```typescript
const ROUTER_ABI = [
  {
    name: "limitBid",
    type: "function",
    stateMutability: "payable",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "market", type: "address" },
          { name: "deadline", type: "uint64" },
          { name: "claimBounty", type: "uint32" },
          { name: "user", type: "address" },
          { name: "priceIndex", type: "uint16" },
          { name: "rawAmount", type: "uint64" },
          { name: "postOnly", type: "bool" },
          { name: "useNative", type: "bool" },
          { name: "baseAmount", type: "uint256" },
        ],
      },
    ],
    outputs: [],
  },
] as const;
```

### 3-1. パラメータの構築

| パラメータ | 型 | 値 | 説明 |
|---|---|---|---|
| `market` | `address` | `0x002930b...082d1` | 対象マーケット |
| `deadline` | `uint64` | 現在時刻 + 3600 | 注文の有効期限（Unix秒） |
| `claimBounty` | `uint32` | `0` | 第三者による claim 実行時の報酬 |
| `user` | `address` | `account.address` | 注文者のアドレス |
| `priceIndex` | `uint16` | `12000` | 指定された価格インデックス |
| `rawAmount` | `uint64` | `500` | 注文数量（raw単位） |
| `postOnly` | `bool` | `true` | Maker のみ（即時約定を避ける） |
| `useNative` | `bool` | `false` | ETH を直接使わない |
| `baseAmount` | `uint256` | `0` | limit 注文では 0 |

### 3-2. シミュレーション（オプション・推奨）

本番送信前に `simulateContract` で revert を検知できます。

```typescript
const MARKET_ADDRESS: Address = "0x002930b390ac7d686f07cffb9d7ce39609d082d1";
const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

const callArgs = [
  {
    market: MARKET_ADDRESS,
    deadline,
    claimBounty: 0,
    user: account.address,
    priceIndex: 12000,
    rawAmount: 500n,
    postOnly: true,
    useNative: false,
    baseAmount: 0n,
  },
] as const;

await publicClient.simulateContract({
  address: ROUTER_ADDRESS,
  abi: ROUTER_ABI,
  functionName: "limitBid",
  args: callArgs,
  account,
  chain: sepolia,
  value: 0n,
});
```

### 3-3. トランザクション送信

```typescript
const txHash = await walletClient.writeContract({
  address: ROUTER_ADDRESS,
  abi: ROUTER_ABI,
  functionName: "limitBid",
  args: callArgs,
  account,
  chain: sepolia,
  value: 0n,
});

console.log(`Tx sent: ${txHash}`);
```

---

## Step 4: トランザクション確認待ち

```typescript
const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

console.log(`Status: ${receipt.status}`);           // "success" or "reverted"
console.log(`Block:  ${receipt.blockNumber}`);
console.log(`Explorer: https://sepolia.etherscan.io/tx/${txHash}`);
```

---

## パラメータ解説

### priceIndex (uint16)

Sera Protocol の CLOB では価格を離散的なインデックスで表現します。`priceIndex = 12000` は板上の特定の価格レベルに対応します。範囲は 0 ~ 65535 (uint16)。

### rawAmount (uint64)

注文の数量を raw 単位で指定します。`rawAmount = 500` はマーケットの `quoteUnit` に基づいた内部単位です。範囲は 1 ~ 18,446,744,073,709,551,615 (uint64)。

### postOnly

`true` に設定すると、即座に約定する注文（taker 注文）は拒否されます。確実に板に載る maker 注文のみ許可されます。手数料の観点で推奨。

### deadline

Unix タイムスタンプ（秒）で注文の有効期限を指定します。期限を過ぎるとトランザクションは revert します。

---

## エラーハンドリング

| エラー | 原因 | 対処 |
|---|---|---|
| `ERC20InsufficientBalance` (0xe450d38c) | Quote トークン残高不足 | トークンを入手してから再試行 |
| `execution reverted` | パラメータ不正 or allowance 不足 | approve を確認、priceIndex の範囲を確認 |
| `insufficient funds` | ガス代の ETH 不足 | Sepolia ETH を faucet から取得 |

---

## 完全なスクリプト

`placeLimitBid.ts` を参照してください。環境変数の設定:

```bash
export PRIVATE_KEY="0x..."
export SEPOLIA_RPC_URL="https://0xrpc.io/sep"
export QUOTE_TOKEN_ADDRESS="0x..."  # マーケットの quote token アドレス
```

実行:

```bash
bun run placeLimitBid.ts
# or
npx tsx placeLimitBid.ts
```

---

## フロー図

```
[Start]
  |
  v
[Create viem clients (publicClient + walletClient)]
  |
  v
[Check allowance: ERC20.allowance(owner, router)]
  |
  +-- allowance >= required --> skip
  |
  +-- allowance < required -->  [ERC20.approve(router, amount)]
  |                                 |
  |                                 v
  |                             [waitForTransactionReceipt]
  |
  v
[simulateContract: Router.limitBid(params)]  <-- revert をここで検知
  |
  v
[writeContract: Router.limitBid(params)]  <-- 実際の tx 送信
  |
  v
[waitForTransactionReceipt]  <-- 確認待ち
  |
  v
[Done - tx hash & block number を取得]
```
