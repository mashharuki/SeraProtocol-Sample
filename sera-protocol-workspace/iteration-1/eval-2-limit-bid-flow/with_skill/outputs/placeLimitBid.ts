/**
 * Sera Protocol - Limit Bid 完全フロー
 *
 * priceIndex = 12000, rawAmount = 500 で limit bid を発注する。
 * 手順: マーケット情報取得 -> approve -> simulate -> send -> 確認待ち -> ポーリング監視
 *
 * 実行方法:
 *   PRIVATE_KEY=0x... npx tsx placeLimitBid.ts
 *
 * 依存パッケージ:
 *   npm install viem dotenv
 */

import "dotenv/config";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  formatUnits,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

// ============================================================
// 定数
// ============================================================

const RPC_URL = process.env.SEPOLIA_RPC_URL ?? "https://0xrpc.io/sep";
const PRIVATE_KEY = process.env.PRIVATE_KEY as Hex;

const ROUTER_ADDRESS: Address = "0x82bfe1b31b6c1c3d201a0256416a18d93331d99e";
const MARKET_ADDRESS: Address = "0x002930b390ac7d686f07cffb9d7ce39609d082d1";
const SUBGRAPH_URL =
  "https://api.goldsky.com/api/public/project_cmicv6kkbhyto01u3agb155hg/subgraphs/sera-pro/1.0.9/gn";

/** 注文パラメータ */
const PRICE_INDEX = 12000;
const RAW_AMOUNT = 500n;

// ============================================================
// Chain 定義
// ============================================================

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

// ============================================================
// ABI (必要最小限)
// ============================================================

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
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

// ============================================================
// GraphQL ヘルパー
// ============================================================

async function querySubgraph<T>(
  query: string,
  variables: Record<string, unknown> = {},
): Promise<T> {
  const res = await fetch(SUBGRAPH_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`GraphQL request failed: ${res.status}`);
  const json = (await res.json()) as {
    data?: T;
    errors?: Array<{ message: string }>;
  };
  if (json.errors?.length) throw new Error(`GraphQL Error: ${json.errors[0]?.message}`);
  if (!json.data) throw new Error("GraphQL response has no data");
  return json.data;
}

type MarketInfo = {
  id: string;
  quoteToken: { id: string; symbol: string; decimals: string };
  baseToken: { id: string; symbol: string; decimals: string };
  quoteUnit: string;
  latestPrice: string;
  latestPriceIndex: string;
};

type DepthLevel = { priceIndex: string; rawAmount: string };

type OpenOrder = {
  id: string;
  priceIndex: string;
  isBid: boolean;
  rawAmount: string;
  rawFilledAmount: string;
  claimableAmount: string;
  status: string;
  orderIndex: string;
};

async function getMarketInfo(marketId: Address): Promise<MarketInfo> {
  const data = await querySubgraph<{ market: MarketInfo | null }>(
    `query($id: ID!) {
      market(id: $id) {
        id
        quoteToken { id symbol decimals }
        baseToken { id symbol decimals }
        quoteUnit
        latestPrice
        latestPriceIndex
      }
    }`,
    { id: marketId.toLowerCase() },
  );
  if (!data.market) throw new Error(`Market not found: ${marketId}`);
  return data.market;
}

async function getOrderBook(
  marketId: Address,
): Promise<{ bids: DepthLevel[]; asks: DepthLevel[] }> {
  return querySubgraph<{ bids: DepthLevel[]; asks: DepthLevel[] }>(
    `query($market: String!) {
      bids: depths(
        where: { market: $market, isBid: true, rawAmount_gt: "0" }
        orderBy: priceIndex, orderDirection: desc, first: 10
      ) { priceIndex rawAmount }
      asks: depths(
        where: { market: $market, isBid: false, rawAmount_gt: "0" }
        orderBy: priceIndex, orderDirection: asc, first: 10
      ) { priceIndex rawAmount }
    }`,
    { market: marketId.toLowerCase() },
  );
}

async function getUserOrders(user: Address, marketId: Address): Promise<OpenOrder[]> {
  const data = await querySubgraph<{ openOrders: OpenOrder[] }>(
    `query($user: String!, $market: String!) {
      openOrders(
        where: { user: $user, market: $market }
        orderBy: createdAt, orderDirection: desc, first: 20
      ) { id priceIndex isBid rawAmount rawFilledAmount claimableAmount status orderIndex }
    }`,
    { user: user.toLowerCase(), market: marketId.toLowerCase() },
  );
  return data.openOrders;
}

// ============================================================
// postOnly 安全チェック
// ============================================================

function resolvePostOnlyBidPriceIndex(
  desired: number,
  asks: DepthLevel[],
): number {
  if (asks.length === 0) return desired;
  const bestAsk = parseInt(asks[0].priceIndex, 10);
  // bid は bestAsk より下でないと即時約定 => postOnly revert
  return Math.min(desired, bestAsk - 1);
}

// ============================================================
// メイン処理
// ============================================================

async function main() {
  // --- 0. バリデーション ---
  if (!PRIVATE_KEY || !/^0x[0-9a-fA-F]{64}$/.test(PRIVATE_KEY)) {
    throw new Error("PRIVATE_KEY が未設定です。環境変数に 0x... 形式で設定してください。");
  }

  const account = privateKeyToAccount(PRIVATE_KEY);
  const publicClient = createPublicClient({ chain: sepolia, transport: http(RPC_URL) });
  const walletClient = createWalletClient({ account, chain: sepolia, transport: http(RPC_URL) });

  console.log("=== Sera Protocol - Limit Bid フロー ===");
  console.log(`Wallet       : ${account.address}`);
  console.log(`Market       : ${MARKET_ADDRESS}`);
  console.log(`priceIndex   : ${PRICE_INDEX}`);
  console.log(`rawAmount    : ${RAW_AMOUNT}`);
  console.log();

  // --- 1. マーケット情報取得 ---
  console.log("[Step 1] マーケット情報を取得中...");
  const market = await getMarketInfo(MARKET_ADDRESS);
  const quoteUnit = BigInt(market.quoteUnit);
  const quoteTokenAddress = market.quoteToken.id as Address;

  console.log(`  ペア         : ${market.baseToken.symbol}/${market.quoteToken.symbol}`);
  console.log(`  quoteUnit    : ${quoteUnit.toString()}`);
  console.log(`  最新価格Index : ${market.latestPriceIndex}`);
  console.log();

  // --- 2. オーダーブック取得 & postOnly チェック ---
  console.log("[Step 2] オーダーブックを取得中...");
  const depth = await getOrderBook(MARKET_ADDRESS);
  console.log(`  bids: ${depth.bids.length} levels, asks: ${depth.asks.length} levels`);

  const resolvedPriceIndex = resolvePostOnlyBidPriceIndex(PRICE_INDEX, depth.asks);
  if (resolvedPriceIndex !== PRICE_INDEX) {
    console.log(
      `  postOnly 安全調整: ${PRICE_INDEX} -> ${resolvedPriceIndex} (bestAsk=${depth.asks[0]?.priceIndex})`,
    );
  } else {
    console.log(`  priceIndex=${PRICE_INDEX} は postOnly 安全範囲内`);
  }
  console.log();

  // --- 3. 必要 approve 量を計算 ---
  //   bid の場合: approveAmount = rawAmount * quoteUnit
  const approveAmount = RAW_AMOUNT * quoteUnit;
  console.log("[Step 3] トークン残高と allowance を確認中...");

  const [balance, currentAllowance] = await Promise.all([
    publicClient.readContract({
      address: quoteTokenAddress,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [account.address],
    }),
    publicClient.readContract({
      address: quoteTokenAddress,
      abi: ERC20_ABI,
      functionName: "allowance",
      args: [account.address, ROUTER_ADDRESS],
    }),
  ]);

  console.log(
    `  ${market.quoteToken.symbol} 残高    : ${formatUnits(balance, Number(market.quoteToken.decimals))}`,
  );
  console.log(`  現在 allowance : ${currentAllowance.toString()}`);
  console.log(`  必要 approve量 : ${approveAmount.toString()}`);

  if (balance < approveAmount) {
    console.warn(
      `  WARNING: 残高不足の可能性があります。必要=${approveAmount}, 残高=${balance}`,
    );
  }
  console.log();

  // --- 4. Approve (必要な場合のみ) ---
  if (currentAllowance < approveAmount) {
    console.log("[Step 4] approve トランザクションを送信中...");
    const approveHash = await walletClient.writeContract({
      address: quoteTokenAddress,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [ROUTER_ADDRESS, approveAmount],
      account,
      chain: sepolia,
    });
    console.log(`  approve tx : ${approveHash}`);
    console.log("  確認待ち...");

    const approveReceipt = await publicClient.waitForTransactionReceipt({ hash: approveHash });
    console.log(`  確認完了 (block ${approveReceipt.blockNumber}, status=${approveReceipt.status})`);
    if (approveReceipt.status !== "success") {
      throw new Error("approve トランザクションが失敗しました。");
    }
  } else {
    console.log("[Step 4] allowance 十分 - approve スキップ");
  }
  console.log();

  // --- 5. limitBid を simulate ---
  console.log("[Step 5] limitBid をシミュレーション中...");
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600); // 1時間後
  const orderParams = {
    market: MARKET_ADDRESS,
    deadline,
    claimBounty: 0,
    user: account.address,
    priceIndex: resolvedPriceIndex,
    rawAmount: RAW_AMOUNT,
    postOnly: true,
    useNative: false,
    baseAmount: 0n,
  } as const;

  try {
    await publicClient.simulateContract({
      address: ROUTER_ADDRESS,
      abi: ROUTER_ABI,
      functionName: "limitBid",
      args: [orderParams],
      account,
      chain: sepolia,
      value: 0n,
    });
    console.log("  シミュレーション成功");
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes("0xe450d38c")) {
      throw new Error("ERC20InsufficientBalance: quote トークン残高が不足しています。");
    }
    throw new Error(`limitBid シミュレーション失敗: ${msg}`);
  }
  console.log();

  // --- 6. limitBid トランザクション送信 ---
  console.log("[Step 6] limitBid トランザクションを送信中...");
  const txHash = await walletClient.writeContract({
    address: ROUTER_ADDRESS,
    abi: ROUTER_ABI,
    functionName: "limitBid",
    args: [orderParams],
    account,
    chain: sepolia,
    value: 0n,
  });
  console.log(`  tx hash : ${txHash}`);
  console.log(`  Etherscan: https://sepolia.etherscan.io/tx/${txHash}`);
  console.log();

  // --- 7. トランザクション確認待ち ---
  console.log("[Step 7] トランザクション確認待ち...");
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  console.log(`  確認完了!`);
  console.log(`  block    : ${receipt.blockNumber}`);
  console.log(`  status   : ${receipt.status}`);
  console.log(`  gasUsed  : ${receipt.gasUsed.toString()}`);

  if (receipt.status !== "success") {
    throw new Error("limitBid トランザクションがリバートしました。");
  }
  console.log();

  // --- 8. GraphQL で注文状態をポーリング ---
  console.log("[Step 8] 注文状態をポーリング (3秒間隔 x 5回)...");
  for (let i = 1; i <= 5; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    const orders = await getUserOrders(account.address, MARKET_ADDRESS);
    const latest = orders[0];
    if (!latest) {
      console.log(`  [poll ${i}/5] 注文なし (まだインデックス未反映)`);
      continue;
    }
    console.log(
      `  [poll ${i}/5] status=${latest.status}, filled=${latest.rawFilledAmount}/${latest.rawAmount}, claimable=${latest.claimableAmount}`,
    );
    // filled の場合はポーリング終了
    if (latest.status === "filled" || latest.status === "claimed") {
      console.log("  注文が約定しました!");
      break;
    }
  }

  console.log();
  console.log("=== 完了 ===");
}

main().catch((err) => {
  console.error("\nエラーが発生しました:");
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
