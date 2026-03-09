import {
  createPublicClient,
  createWalletClient,
  http,
  type Address,
  type Hex,
  type PrivateKeyAccount,
} from "viem";
import {
  ERC20_ABI,
  ROUTER_ABI,
  ROUTER_ADDRESS,
  RPC_URL,
  UINT16_MAX,
  UINT64_MAX,
  sepolia,
} from "../utils/constants";
import type { OpenOrder } from "../utils/helpers";

/**
 * Viemクライアントの作成
 * Bun環境でのイーサリアムクライアントを初期化します。
 * 公開クライアントはチェーンデータの読み取りに使用され、ウォレットクライアントは署名付きトランザクションの送信に使用されます。
 * @param account 
 * @returns 
 */
export function createViemClients(account: PrivateKeyAccount) {
	const publicClient = createPublicClient({
		chain: sepolia,
		transport: http(RPC_URL),
	});

	const walletClient = createWalletClient({
		account,
		chain: sepolia,
		transport: http(RPC_URL),
	});

	return { publicClient, walletClient };
}

export async function getTokenBalance(args: {
	publicClient: ReturnType<typeof createPublicClient>;
	account: Address;
	tokenAddress: Address;
}): Promise<bigint> {
	const { publicClient, account, tokenAddress } = args;

	return publicClient.readContract({
		address: tokenAddress,
		abi: ERC20_ABI,
		functionName: "balanceOf",
		args: [account],
	});
}

/**
 * 必要な場合にERC20トークンの承認を行うユーティリティ関数
 * 指定された量のトークンがspenderに対してすでに承認されているかを確認し、必要に応じてapproveトランザクションを送信します。
 * @param args 
 * @returns 
 */
export async function approveTokenIfNeeded(args: {
	publicClient: ReturnType<typeof createPublicClient>;
	walletClient: ReturnType<typeof createWalletClient>;
	account: PrivateKeyAccount;
	tokenAddress: Address;
	spender: Address;
	amount: bigint;
}): Promise<Hex | null> {
	const { publicClient, walletClient, account, tokenAddress, spender, amount } = args;

	const allowance = await publicClient.readContract({
		address: tokenAddress,
		abi: ERC20_ABI,
		functionName: "allowance",
		args: [account.address, spender],
	});

	if (allowance >= amount) {
		return null;
	}

	const approvalHash = await walletClient.writeContract({
		address: tokenAddress,
		abi: ERC20_ABI,
		functionName: "approve",
		args: [spender, amount],
		account,
		chain: sepolia,
	});

	await publicClient.waitForTransactionReceipt({ hash: approvalHash });
	return approvalHash;
}

/**
 * リミット注文を配置するユーティリティ関数
 * 指定された市場、価格インデックス、数量でリミット注文を作成します。
 * @param args 
 * @returns 
 */
export async function placeLimitBid(args: {
	publicClient: ReturnType<typeof createPublicClient>;
	walletClient: ReturnType<typeof createWalletClient>;
	account: PrivateKeyAccount;
	market: Address;
	priceIndex: number;
	rawAmount: bigint;
}): Promise<Hex> {
	const { publicClient, walletClient, account, market, priceIndex, rawAmount } = args;

	if (priceIndex < 0 || priceIndex > UINT16_MAX) {
		throw new Error(`priceIndex out of uint16 range: ${priceIndex}`);
	}
	if (rawAmount <= 0n || rawAmount > UINT64_MAX) {
		throw new Error(`rawAmount out of uint64 range: ${rawAmount.toString()}`);
	}

	const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
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
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error);
		if (reason.includes("0xe450d38c")) {
			throw new Error(
				"limitBid simulation failed: ERC20InsufficientBalance. Your quote token balance is not enough for this order size/price.",
			);
		}
		throw new Error(`limitBid simulation failed: ${reason}`);
	}

	const txHash = await walletClient.writeContract({
		address: ROUTER_ADDRESS,
		abi: ROUTER_ABI,
		functionName: "limitBid",
		args: callArgs,
		account,
		chain: sepolia,
		value: 0n,
	});

	const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
	console.log(`Order placed in block ${receipt.blockNumber}`);
	return txHash;
}

/**
 * オーダーを請求するユーティリティ関数
 * 指定された注文が約定している場合に、利益を請求するためのトランザクションを送信します。
 * @param args 
 * @returns 
 */
export async function claimOrder(args: {
	publicClient: ReturnType<typeof createPublicClient>;
	walletClient: ReturnType<typeof createWalletClient>;
	account: PrivateKeyAccount;
	market: Address;
	order: OpenOrder;
}): Promise<Hex> {
	const { publicClient, walletClient, account, market, order } = args;
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
					orderKeys: [
						{
							isBid: order.isBid,
							priceIndex: Number(order.priceIndex),
							orderIndex: BigInt(order.orderIndex),
						},
					],
				},
			],
		],
		account,
		chain: sepolia,
	});

	await publicClient.waitForTransactionReceipt({ hash: txHash });
	return txHash;
}
