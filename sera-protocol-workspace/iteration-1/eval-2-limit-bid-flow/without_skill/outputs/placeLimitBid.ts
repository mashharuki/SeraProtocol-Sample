import "dotenv/config";
import {
  createPublicClient,
  createWalletClient,
  http,
  defineChain,
  type Address,
  type Hex,
  type PrivateKeyAccount,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

// ============================================================
// 1. Constants & Configuration
// ============================================================

const RPC_URL = process.env.SEPOLIA_RPC_URL ?? "https://0xrpc.io/sep";
const PRIVATE_KEY = process.env.PRIVATE_KEY as Hex;

const ROUTER_ADDRESS: Address = "0x82bfe1b31b6c1c3d201a0256416a18d93331d99e";
const MARKET_ADDRESS: Address = "0x002930b390ac7d686f07cffb9d7ce39609d082d1";

/** Quote token address — the token spent when placing a bid.
 *  Replace with the actual quote token of the market. */
const QUOTE_TOKEN_ADDRESS: Address =
  (process.env.QUOTE_TOKEN_ADDRESS as Address) ??
  "0x0000000000000000000000000000000000000000"; // ← set this

// Order parameters
const PRICE_INDEX = 12000;
const RAW_AMOUNT = 500n;

// ============================================================
// 2. Chain definition
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
// 3. ABIs (minimal)
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
    outputs: [{ name: "balance", type: "uint256" }],
  },
] as const;

// ============================================================
// 4. Helper: approve token if needed
// ============================================================

async function approveTokenIfNeeded(args: {
  publicClient: ReturnType<typeof createPublicClient>;
  walletClient: ReturnType<typeof createWalletClient>;
  account: PrivateKeyAccount;
  tokenAddress: Address;
  spender: Address;
  amount: bigint;
}): Promise<Hex | null> {
  const { publicClient, walletClient, account, tokenAddress, spender, amount } =
    args;

  // Step A: Check current allowance
  const allowance = await publicClient.readContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: [account.address, spender],
  });

  console.log(`  Current allowance: ${allowance}`);

  if (allowance >= amount) {
    console.log("  Allowance sufficient, skipping approve.");
    return null;
  }

  // Step B: Send approve tx
  console.log(`  Approving ${amount} to ${spender} ...`);
  const approveHash = await walletClient.writeContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: "approve",
    args: [spender, amount],
    account,
    chain: sepolia,
  });

  console.log(`  Approve tx sent: ${approveHash}`);

  // Step C: Wait for confirmation
  const receipt = await publicClient.waitForTransactionReceipt({
    hash: approveHash,
  });
  console.log(
    `  Approve confirmed in block ${receipt.blockNumber} (status: ${receipt.status})`,
  );

  return approveHash;
}

// ============================================================
// 5. Helper: place limit bid
// ============================================================

async function placeLimitBid(args: {
  publicClient: ReturnType<typeof createPublicClient>;
  walletClient: ReturnType<typeof createWalletClient>;
  account: PrivateKeyAccount;
  market: Address;
  priceIndex: number;
  rawAmount: bigint;
}): Promise<Hex> {
  const { publicClient, walletClient, account, market, priceIndex, rawAmount } =
    args;

  // Validation
  if (priceIndex < 0 || priceIndex > 65535) {
    throw new Error(`priceIndex out of uint16 range: ${priceIndex}`);
  }
  if (rawAmount <= 0n || rawAmount > 18_446_744_073_709_551_615n) {
    throw new Error(`rawAmount out of uint64 range: ${rawAmount}`);
  }

  const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600); // 1 hour

  const callArgs = [
    {
      market,
      deadline,
      claimBounty: 0,
      user: account.address,
      priceIndex,
      rawAmount,
      postOnly: true,
      useNative: false,
      baseAmount: 0n,
    },
  ] as const;

  // Step A: Simulate to catch revert early
  console.log("  Simulating limitBid ...");
  try {
    await publicClient.simulateContract({
      address: ROUTER_ADDRESS,
      abi: ROUTER_ABI,
      functionName: "limitBid",
      args: callArgs,
      account,
      chain: sepolia,
      value: 0n,
    });
    console.log("  Simulation passed.");
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    if (reason.includes("0xe450d38c")) {
      throw new Error(
        "limitBid simulation failed: ERC20InsufficientBalance. Quote token balance is not enough.",
      );
    }
    throw new Error(`limitBid simulation failed: ${reason}`);
  }

  // Step B: Send the real transaction
  console.log("  Sending limitBid tx ...");
  const txHash = await walletClient.writeContract({
    address: ROUTER_ADDRESS,
    abi: ROUTER_ABI,
    functionName: "limitBid",
    args: callArgs,
    account,
    chain: sepolia,
    value: 0n,
  });

  console.log(`  limitBid tx sent: ${txHash}`);

  // Step C: Wait for confirmation
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  console.log(
    `  Confirmed in block ${receipt.blockNumber} (status: ${receipt.status})`,
  );

  return txHash;
}

// ============================================================
// 6. Main
// ============================================================

async function main() {
  // --- Setup ---
  if (!PRIVATE_KEY) {
    throw new Error("PRIVATE_KEY env var is required");
  }

  const account = privateKeyToAccount(PRIVATE_KEY);
  console.log(`Wallet: ${account.address}`);

  const publicClient = createPublicClient({
    chain: sepolia,
    transport: http(RPC_URL),
  });

  const walletClient = createWalletClient({
    account,
    chain: sepolia,
    transport: http(RPC_URL),
  });

  // --- Step 1: Approve quote token ---
  console.log("\n[Step 1] Approve quote token to Router");
  const approveAmount = RAW_AMOUNT * 10_000n; // generous upper bound
  const approveTx = await approveTokenIfNeeded({
    publicClient,
    walletClient,
    account,
    tokenAddress: QUOTE_TOKEN_ADDRESS,
    spender: ROUTER_ADDRESS,
    amount: approveAmount,
  });

  if (approveTx) {
    console.log(`  Approve tx hash: ${approveTx}`);
  }

  // --- Step 2: Place limit bid ---
  console.log("\n[Step 2] Place limit bid");
  console.log(`  priceIndex = ${PRICE_INDEX}`);
  console.log(`  rawAmount  = ${RAW_AMOUNT}`);

  const orderTxHash = await placeLimitBid({
    publicClient,
    walletClient,
    account,
    market: MARKET_ADDRESS,
    priceIndex: PRICE_INDEX,
    rawAmount: RAW_AMOUNT,
  });

  // --- Step 3: Final summary ---
  console.log("\n[Done]");
  console.log(`  Order tx: ${orderTxHash}`);
  console.log(
    `  Explorer: https://sepolia.etherscan.io/tx/${orderTxHash}`,
  );
}

main().catch((err) => {
  console.error("Script failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
