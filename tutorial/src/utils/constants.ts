import { defineChain, type Address } from "viem";

export const PRIVATE_KEY = process.env.PRIVATE_KEY;
export const RPC_URL = process.env.SEPOLIA_RPC_URL ?? "https://0xrpc.io/sep";

export const ROUTER_ADDRESS: Address = "0x82bfe1b31b6c1c3d201a0256416a18d93331d99e";
export const MARKET_ADDRESS: Address = "0x002930b390ac7d686f07cffb9d7ce39609d082d1";
export const SUBGRAPH_URL =
	"https://api.goldsky.com/api/public/project_cmicv6kkbhyto01u3agb155hg/subgraphs/sera-pro/1.0.9/gn";

export const UINT16_MAX = 65535;
export const UINT64_MAX = 18_446_744_073_709_551_615n;

export const sepolia = defineChain({
	id: 11155111,
	name: "Sepolia",
	network: "sepolia",
	nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
	rpcUrls: {
		default: { http: [RPC_URL] },
		public: { http: [RPC_URL] },
	},
});

export const ROUTER_ABI = [
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
	{
		name: "claim",
		type: "function",
		stateMutability: "nonpayable",
		inputs: [
			{ name: "deadline", type: "uint64" },
			{
				name: "claimParams",
				type: "tuple[]",
				components: [
					{ name: "market", type: "address" },
					{
						name: "orderKeys",
						type: "tuple[]",
						components: [
							{ name: "isBid", type: "bool" },
							{ name: "priceIndex", type: "uint16" },
							{ name: "orderIndex", type: "uint256" },
						],
					},
				],
			},
		],
		outputs: [],
	},
] as const;

export const ERC20_ABI = [
  {
    "constant": true,
    "inputs": [
      {
        "name": "_owner",
        "type": "address"
      }
    ],
    "name": "balanceOf",
    "outputs": [
      {
        "name": "balance",
        "type": "uint256"
      }
    ],
    "payable": false,
    "stateMutability": "view",
    "type": "function"
  },
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
