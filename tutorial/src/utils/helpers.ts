import type { Address, Hex } from "viem";
import { SUBGRAPH_URL, UINT16_MAX, UINT64_MAX } from "./constants";

export type MarketInfo = {
	id: string;
	quoteToken: { id: string; symbol: string; decimals: string };
	baseToken: { id: string; symbol: string; decimals: string };
	quoteUnit: string;
	minPrice: string;
	tickSpace: string;
	latestPrice: string;
	latestPriceIndex: string;
};

export type DepthLevel = {
	priceIndex: string;
	price: string;
	rawAmount: string;
};

export type OpenOrder = {
	id: string;
	priceIndex: string;
	isBid: boolean;
	rawAmount: string;
	rawFilledAmount: string;
	claimableAmount: string;
	status: string;
	orderIndex: string;
};

export type CliOptions = {
	priceIndex?: number;
	rawAmount?: bigint;
	claimOnly?: boolean;
	claimPriceIndex?: number;
	claimOrderIndex?: bigint;
	claimIsBid?: boolean;
};

export function resolvePostOnlyBidPriceIndex(args: {
	desiredPriceIndex: number;
	bids: DepthLevel[];
	asks: DepthLevel[];
}): number {
	const { desiredPriceIndex, bids, asks } = args;
	let resolved = desiredPriceIndex;

	const bestBidIndex = bids.length > 0 ? Number.parseInt(bids[0].priceIndex, 10) : undefined;
	const bestAskIndex = asks.length > 0 ? Number.parseInt(asks[0].priceIndex, 10) : undefined;

	if (Number.isInteger(bestBidIndex) && resolved < (bestBidIndex as number)) {
		resolved = bestBidIndex as number;
	}

	if (asks.length > 0) {
		const bestAskIndex = Number.parseInt(asks[0].priceIndex, 10);
		if (Number.isInteger(bestAskIndex) && resolved >= bestAskIndex) {
			resolved = bestAskIndex - 1;
		}
	}

	// If spread is too tight (bestAsk == bestBid), prioritize staying strictly below ask.
	if (Number.isInteger(bestAskIndex) && resolved >= (bestAskIndex as number)) {
		resolved = (bestAskIndex as number) - 1;
	}

	if (resolved < 1) {
		throw new Error("Resolved priceIndex is below minimum (1). Adjust your input price.");
	}

	if (resolved > UINT16_MAX) {
		throw new Error(`Resolved priceIndex exceeds uint16 max (${UINT16_MAX}).`);
	}

	return resolved;
}

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function requirePrivateKey(value: string | undefined): Hex {
	if (!value) {
		throw new Error("PRIVATE_KEY is required in .env");
	}
	if (!/^0x[0-9a-fA-F]{64}$/.test(value)) {
		throw new Error("PRIVATE_KEY must be a 0x-prefixed 32-byte hex string");
	}
	return value as Hex;
}

export function parseCliOptions(argv: string[]): CliOptions {
	const options: CliOptions = {};

	for (let i = 0; i < argv.length; i += 1) {
		const arg = argv[i];
		const next = argv[i + 1];

		if (arg === "--price-index") {
			if (!next) throw new Error("--price-index requires a value");
			const parsed = Number.parseInt(next, 10);
			if (!Number.isInteger(parsed) || parsed < 0 || parsed > UINT16_MAX) {
				throw new Error(`--price-index must be an integer in range [0, ${UINT16_MAX}]`);
			}
			options.priceIndex = parsed;
			i += 1;
			continue;
		}

		if (arg === "--raw-amount") {
			if (!next) throw new Error("--raw-amount requires a value");
			if (!/^\d+$/.test(next)) {
				throw new Error("--raw-amount must be a positive integer string");
			}
			const parsed = BigInt(next);
			if (parsed <= 0n || parsed > UINT64_MAX) {
				throw new Error("--raw-amount must be in uint64 range and > 0");
			}
			options.rawAmount = parsed;
			i += 1;
			continue;
		}

		if (arg === "--help" || arg === "-h") {
			console.log(
				"Usage: bun run start -- [--price-index <uint16>] [--raw-amount <uint64>] [--claim-only --claim-price-index <uint16> --claim-order-index <uint256> --claim-is-bid <true|false>]",
			);
			process.exit(0);
		}

		if (arg === "--claim-only") {
			options.claimOnly = true;
			continue;
		}

		if (arg === "--claim-price-index") {
			if (!next) throw new Error("--claim-price-index requires a value");
			const parsed = Number.parseInt(next, 10);
			if (!Number.isInteger(parsed) || parsed < 0 || parsed > UINT16_MAX) {
				throw new Error(`--claim-price-index must be in range [0, ${UINT16_MAX}]`);
			}
			options.claimPriceIndex = parsed;
			i += 1;
			continue;
		}

		if (arg === "--claim-order-index") {
			if (!next) throw new Error("--claim-order-index requires a value");
			if (!/^\d+$/.test(next)) {
				throw new Error("--claim-order-index must be an integer string");
			}
			options.claimOrderIndex = BigInt(next);
			i += 1;
			continue;
		}

		if (arg === "--claim-is-bid") {
			if (!next) throw new Error("--claim-is-bid requires true or false");
			if (next !== "true" && next !== "false") {
				throw new Error("--claim-is-bid must be true or false");
			}
			options.claimIsBid = next === "true";
			i += 1;
			continue;
		}

		if (arg.startsWith("--")) {
			throw new Error(`Unknown option: ${arg}`);
		}
	}

	if (options.claimOnly && options.claimIsBid === undefined) {
		options.claimIsBid = true;
	}

	return options;
}

/**
 * GraphQLサブグラフにクエリを送信するユーティリティ関数
 * @param query 
 * @param variables 
 * @returns 
 */
export async function querySubgraph<T>(
	query: string,
	variables: Record<string, unknown> = {},
): Promise<T> {
	const res = await fetch(SUBGRAPH_URL, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ query, variables }),
	});

	if (!res.ok) {
		throw new Error(`GraphQL request failed (${res.status} ${res.statusText})`);
	}

	const json = (await res.json()) as {
		data?: T;
		errors?: Array<{ message: string }>;
	};

	if (json.errors?.length) {
		throw new Error(`GraphQL Error: ${json.errors[0]?.message ?? "unknown"}`);
	}
	if (!json.data) {
		throw new Error("GraphQL response did not include data");
	}
	return json.data;
}

/**
 * マーケット情報を取得するユーティリティ関数
 * 指定された市場IDに関連するマーケットの詳細情報をGraphQLサブグラフから取得します。
 * @param marketId 
 * @returns 
 */
export async function getMarketInfo(marketId: Address): Promise<MarketInfo> {
	const query = `
		query GetMarket($id: ID!) {
			market(id: $id) {
				id
				quoteToken { id symbol decimals }
				baseToken { id symbol decimals }
				quoteUnit
				minPrice
				tickSpace
				latestPrice
				latestPriceIndex
			}
		}
	`;

	const data = await querySubgraph<{ market: MarketInfo | null }>(query, {
		id: marketId.toLowerCase(),
	});

	if (!data.market) {
		throw new Error(`Market not found: ${marketId}`);
	}
	return data.market;
}

/**
 * オーダーブックの深さを取得するユーティリティ関数
 * 指定された市場の注文板の深さ（上位10件のビッドとアスク）をGraphQLサブグラフから取得します。
 * @param marketId 
 * @returns 
 */
export async function getOrderBook(
	marketId: Address,
): Promise<{ bids: DepthLevel[]; asks: DepthLevel[] }> {
	const query = `
		query GetDepth($market: String!) {
			bids: depths(
				where: { market: $market, isBid: true, rawAmount_gt: "0" }
				orderBy: priceIndex, orderDirection: desc, first: 10
			) { priceIndex price rawAmount }
			asks: depths(
				where: { market: $market, isBid: false, rawAmount_gt: "0" }
				orderBy: priceIndex, orderDirection: asc, first: 10
			) { priceIndex price rawAmount }
		}
	`;

	return querySubgraph<{ bids: DepthLevel[]; asks: DepthLevel[] }>(query, {
		market: marketId.toLowerCase(),
	});
}

/**
 * ユーザーのOrder情報を取得するユーティリティ関数
 * 指定されたユーザーと市場に関連するオープンオーダーのリストをGraphQLサブグラフから取得します。
 * @param user 
 * @param marketId 
 * @returns 
 */
export async function getUserOrders(user: Address, marketId: Address): Promise<OpenOrder[]> {
	const query = `
		query GetOrders($user: String!, $market: String!) {
			openOrders(
				where: { user: $user, market: $market }
				orderBy: createdAt, orderDirection: desc, first: 20
			) {
				id
				priceIndex
				isBid
				rawAmount
				rawFilledAmount
				claimableAmount
				status
				orderIndex
			}
		}
	`;

	const data = await querySubgraph<{ openOrders: OpenOrder[] }>(query, {
		user: user.toLowerCase(),
		market: marketId.toLowerCase(),
	});
	return data.openOrders;
}
