import {
  createPublicClient,
  createWalletClient,
  http,
  type Address,
  type Hex,
  type PrivateKeyAccount,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  ROUTER_ADDRESS,
  ROUTER_ABI,
  ERC20_ABI,
  RPC_URL,
  UINT16_MAX,
  UINT64_MAX,
  sepolia,
} from "../constants.js";

const publicClient = createPublicClient({
  chain: sepolia,
  transport: http(RPC_URL),
});

function getAccount(): PrivateKeyAccount {
  const key = process.env.PRIVATE_KEY;
  if (!key) {
    throw new Error(
      "PRIVATE_KEY environment variable is required for write operations. " +
        "Set it as a 0x-prefixed 64-character hex string.",
    );
  }
  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) {
    throw new Error("PRIVATE_KEY must be a 0x-prefixed 32-byte hex string");
  }
  return privateKeyToAccount(key as Hex);
}

function getWalletClient(account: PrivateKeyAccount) {
  return createWalletClient({
    account,
    chain: sepolia,
    transport: http(RPC_URL),
  });
}

export async function getTokenBalance(
  tokenAddress: Address,
  accountAddress: Address,
): Promise<{ balance: bigint; symbol: string; decimals: number }> {
  const [balance, symbol, decimals] = await Promise.all([
    publicClient.readContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [accountAddress],
    }),
    publicClient.readContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: "symbol",
    }),
    publicClient.readContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: "decimals",
    }),
  ]);

  return {
    balance: balance as bigint,
    symbol: symbol as string,
    decimals: decimals as number,
  };
}

export async function getAllowance(
  tokenAddress: Address,
  ownerAddress: Address,
  spenderAddress: Address,
): Promise<bigint> {
  return publicClient.readContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: [ownerAddress, spenderAddress],
  }) as Promise<bigint>;
}

export async function approveToken(
  tokenAddress: Address,
  spender: Address,
  amount: bigint,
): Promise<{ txHash: Hex; account: Address }> {
  const account = getAccount();
  const walletClient = getWalletClient(account);

  const txHash = await walletClient.writeContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: "approve",
    args: [spender, amount],
    account,
    chain: sepolia,
  });

  await publicClient.waitForTransactionReceipt({ hash: txHash });
  return { txHash, account: account.address };
}

export async function placeLimitOrder(params: {
  market: Address;
  priceIndex: number;
  rawAmount: bigint;
  isBid: boolean;
  postOnly: boolean;
}): Promise<{ txHash: Hex; account: Address }> {
  const { market, priceIndex, rawAmount, isBid, postOnly } = params;

  if (priceIndex < 0 || priceIndex > UINT16_MAX) {
    throw new Error(
      `priceIndex out of uint16 range (0-${UINT16_MAX}): ${priceIndex}`,
    );
  }
  if (rawAmount <= 0n || rawAmount > UINT64_MAX) {
    throw new Error(`rawAmount out of uint64 range: ${rawAmount.toString()}`);
  }

  const account = getAccount();
  const walletClient = getWalletClient(account);
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

  const orderParams = {
    market,
    deadline,
    claimBounty: 0,
    user: account.address,
    priceIndex,
    rawAmount,
    postOnly,
    useNative: false,
    baseAmount: 0n,
  } as const;

  const functionName = isBid ? "limitBid" : "limitAsk";

  // Simulate first
  try {
    await publicClient.simulateContract({
      address: ROUTER_ADDRESS,
      abi: ROUTER_ABI,
      functionName,
      args: [orderParams],
      account,
      chain: sepolia,
      value: 0n,
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    if (reason.includes("0xe450d38c")) {
      throw new Error(
        "Order simulation failed: ERC20InsufficientBalance. " +
          "Your token balance is not enough for this order.",
      );
    }
    throw new Error(`Order simulation failed: ${reason}`);
  }

  const txHash = await walletClient.writeContract({
    address: ROUTER_ADDRESS,
    abi: ROUTER_ABI,
    functionName,
    args: [orderParams],
    account,
    chain: sepolia,
    value: 0n,
  });

  await publicClient.waitForTransactionReceipt({ hash: txHash });
  return { txHash, account: account.address };
}

export async function claimOrder(params: {
  market: Address;
  isBid: boolean;
  priceIndex: number;
  orderIndex: bigint;
}): Promise<{ txHash: Hex; account: Address }> {
  const { market, isBid, priceIndex, orderIndex } = params;
  const account = getAccount();
  const walletClient = getWalletClient(account);
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 600);

  const txHash = await walletClient.writeContract({
    address: ROUTER_ADDRESS,
    abi: ROUTER_ABI,
    functionName: "claim",
    args: [
      deadline,
      [
        {
          market,
          orderKeys: [{ isBid, priceIndex, orderIndex }],
        },
      ],
    ],
    account,
    chain: sepolia,
  });

  await publicClient.waitForTransactionReceipt({ hash: txHash });
  return { txHash, account: account.address };
}

export function getConfiguredAddress(): Address | null {
  try {
    const account = getAccount();
    return account.address;
  } catch {
    return null;
  }
}
