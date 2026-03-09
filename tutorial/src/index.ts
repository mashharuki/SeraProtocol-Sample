#!/usr/bin/env bun
import "dotenv/config";
import { formatUnits, isAddress, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  approveTokenIfNeeded,
  claimOrder,
  createViemClients,
  getTokenBalance,
  placeLimitBid,
} from "./lib/viem";
import {
  MARKET_ADDRESS,
  PRIVATE_KEY,
  ROUTER_ADDRESS,
  RPC_URL,
} from "./utils/constants";
import {
  getMarketInfo,
  getOrderBook,
  getUserOrders,
  parseCliOptions,
  requirePrivateKey,
  resolvePostOnlyBidPriceIndex,
  sleep,
  type OpenOrder,
} from "./utils/helpers";

/**
 * メイン関数
 * Sera Protocolの注文ライフサイクルをデモンストレーションするスクリプトです。
 * 1. 市場情報の取得
 * 2. 注文板の深さの取得
 * 3. 既存の注文の確認
 * 4. リミット注文の配置  
 * 5. GraphQLを介した注文状況の監視
 * 6. 利益の請求（利用可能な場合）
 * 
 * コマンドライン引数:
 * --price-index <number> : 注文の価格インデックス（省略時は最新価格から100下）
 * --raw-amount <bigint> : 注文の原始数量（省略時は1000）
 */
async function main() {
  console.log("Sera Protocol - Order Lifecycle Demo (Bun + TypeScript + viem)\n");
  const cli = parseCliOptions(process.argv.slice(2));

  const privateKey = requirePrivateKey(PRIVATE_KEY);
  const account = privateKeyToAccount(privateKey);
  const { publicClient, walletClient } = createViemClients(account);

  if (!isAddress(MARKET_ADDRESS) || !isAddress(ROUTER_ADDRESS)) {
    throw new Error("Invalid configured address");
  }

  console.log(`Wallet: ${account.address}`);
  console.log(`RPC: ${RPC_URL}`);

  // 1. Get market info
  const market = await getMarketInfo(MARKET_ADDRESS);
  console.log(`Market: ${market.baseToken.symbol}/${market.quoteToken.symbol}`);
  console.log(
    `Latest: index=${market.latestPriceIndex}, price=${formatUnits(BigInt(market.latestPrice), Number(market.quoteToken.decimals))}`,
  );

  const baseTokenAddress = market.baseToken.id as Address;
  const quoteTokenAddress = market.quoteToken.id as Address;
  const [baseBalance, quoteBalance] = await Promise.all([
    getTokenBalance({
      publicClient,
      account: account.address,
      tokenAddress: baseTokenAddress,
    }),
    getTokenBalance({
      publicClient,
      account: account.address,
      tokenAddress: quoteTokenAddress,
    }),
  ]);

  console.log(
    `Balances: ${market.baseToken.symbol}=${formatUnits(baseBalance, Number(market.baseToken.decimals))}, ${market.quoteToken.symbol}=${formatUnits(quoteBalance, Number(market.quoteToken.decimals))}`,
  );

  // 2. Get order book depth
  const depth = await getOrderBook(MARKET_ADDRESS);
  console.log(`Depth: bids=${depth.bids.length}, asks=${depth.asks.length}`);
  const bestBid = depth.bids[0]?.priceIndex ?? "-";
  const bestAsk = depth.asks[0]?.priceIndex ?? "-";
  console.log(`Top of book: bestBidIndex=${bestBid}, bestAskIndex=${bestAsk}`);

  // 3. Check existing orders
  const existingOrders = await getUserOrders(account.address, MARKET_ADDRESS);
  console.log(`Your open orders (before): ${existingOrders.length}`);

  if (cli.claimOnly) {
    let targetOrder: OpenOrder | undefined;

    if (cli.claimPriceIndex !== undefined && cli.claimOrderIndex !== undefined) {
      targetOrder = existingOrders.find(
        (order) =>
          Number(order.priceIndex) === cli.claimPriceIndex &&
          BigInt(order.orderIndex) === cli.claimOrderIndex &&
          order.isBid === (cli.claimIsBid ?? true),
      );
    } else {
      targetOrder = existingOrders.find((order) => BigInt(order.claimableAmount) > 0n);
    }

    if (!targetOrder) {
      throw new Error(
        "No claim target found. Use --claim-price-index and --claim-order-index, or wait until claimableAmount > 0.",
      );
    }

    console.log(
      `Claim target: isBid=${targetOrder.isBid}, priceIndex=${targetOrder.priceIndex}, orderIndex=${targetOrder.orderIndex}, claimable=${targetOrder.claimableAmount}`,
    );

    const claimTx = await claimOrder({
      publicClient,
      walletClient,
      account,
      market: MARKET_ADDRESS,
      order: targetOrder,
    });
    console.log(`Claimed proceeds: ${claimTx}`);
    return;
  }

  // 4. Place a limit order
  const latestPriceIndex = Number(market.latestPriceIndex);
  const requestedPriceIndex = cli.priceIndex ?? Math.max(1, latestPriceIndex - 100);
  const priceIndex = resolvePostOnlyBidPriceIndex({
    desiredPriceIndex: requestedPriceIndex,
    bids: depth.bids,
    asks: depth.asks,
  });
  const rawAmount = cli.rawAmount ?? 1000n;
  const approveAmount = rawAmount * BigInt(market.quoteUnit);

  if (priceIndex !== requestedPriceIndex) {
    console.log(
      `Adjusted priceIndex for postOnly safety: requested=${requestedPriceIndex} -> resolved=${priceIndex}`,
    );
  }

  console.log(
    `Placing limit bid: priceIndex=${priceIndex}, rawAmount=${rawAmount.toString()}, approve=${approveAmount.toString()}`,
  );

  const approveTx = await approveTokenIfNeeded({
    publicClient,
    walletClient,
    account,
    tokenAddress: quoteTokenAddress,
    spender: ROUTER_ADDRESS,
    amount: approveAmount,
  });

  if (approveTx) {
    console.log(`Approved quote token: ${approveTx}`);
  } else {
    console.log("Allowance already sufficient; skipping approve");
  }

  const orderTx = await placeLimitBid({
    publicClient,
    walletClient,
    account,
    market: MARKET_ADDRESS,
    priceIndex,
    rawAmount,
  });
  console.log(`Order tx: ${orderTx}`);

  // 5. Monitor order status via GraphQL
  console.log("Monitoring order status...");
  let latestOrders: OpenOrder[] = [];
  for (let i = 1; i <= 6; i += 1) {
    await sleep(3000);
    latestOrders = await getUserOrders(account.address, MARKET_ADDRESS);

    const top = latestOrders[0];
    if (!top) {
      console.log(`[poll ${i}] no orders yet`);
      continue;
    }

    console.log(
      `[poll ${i}] status=${top.status}, filled=${top.rawFilledAmount}/${top.rawAmount}, claimable=${top.claimableAmount}, key={isBid:${top.isBid},priceIndex:${top.priceIndex},orderIndex:${top.orderIndex}}`,
    );
  }

  // 6. Claim proceeds if available
  const claimableOrder = latestOrders.find((order) => BigInt(order.claimableAmount) > 0n);

  if (!claimableOrder) {
    console.log("No claimable order found yet. Try re-running after more fills.");
    const pending = latestOrders[0];
    if (pending) {
      console.log(
        `Pending order key: isBid=${pending.isBid}, priceIndex=${pending.priceIndex}, orderIndex=${pending.orderIndex}`,
      );
      console.log(
        `Claim-only command: bun run start -- --claim-only --claim-price-index ${pending.priceIndex} --claim-order-index ${pending.orderIndex} --claim-is-bid ${pending.isBid}`,
      );
    }
  } else {
    const claimTx = await claimOrder({
      publicClient,
      walletClient,
      account,
      market: MARKET_ADDRESS,
      order: claimableOrder,
    });
    console.log(`Claimed proceeds: ${claimTx}`);
  }

  const updatedOrders = await getUserOrders(account.address, MARKET_ADDRESS);
  console.log(`Your open orders (after): ${updatedOrders.length}`);
}

main().catch((error) => {
  console.error("\nScript failed:");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
