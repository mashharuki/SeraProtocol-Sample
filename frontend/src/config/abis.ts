export const ROUTER_ABI = [
  {
    inputs: [
      {
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
        name: "params",
        type: "tuple",
      },
    ],
    name: "limitBid",
    outputs: [],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [
      {
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
        name: "params",
        type: "tuple",
      },
    ],
    name: "limitAsk",
    outputs: [],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [
      { name: "deadline", type: "uint64" },
      {
        components: [
          { name: "market", type: "address" },
          {
            components: [
              { name: "isBid", type: "bool" },
              { name: "priceIndex", type: "uint16" },
              { name: "orderIndex", type: "uint256" },
            ],
            name: "orderKeys",
            type: "tuple[]",
          },
        ],
        name: "claimParams",
        type: "tuple[]",
      },
    ],
    name: "claim",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

export const ERC20_ABI = [
  {
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    name: "approve",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    name: "allowance",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "decimals",
    outputs: [{ name: "", type: "uint8" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "symbol",
    outputs: [{ name: "", type: "string" }],
    stateMutability: "view",
    type: "function",
  },
] as const;
