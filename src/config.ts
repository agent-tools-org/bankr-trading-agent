import { base } from "viem/chains";

export const BANKR_API_URL = "https://api.bankr.chat/v1";

export const BANKR_API_KEY = process.env.BANKR_API_KEY ?? "";

export const BASE_RPC_URL =
  process.env.BASE_RPC_URL ?? "https://mainnet.base.org";

export const PRIVATE_KEY = process.env.PRIVATE_KEY ?? "";

export const CHAIN = base;

export const CONSENSUS_MODELS = [
  "claude-sonnet-4-5",
  "gpt-4o",
  "gemini-2.0-flash",
] as const;

export type SupportedModel = (typeof CONSENSUS_MODELS)[number];

/** Uniswap V3 pool addresses on Base */
export const TRADING_PAIRS = [
  {
    name: "WETH/USDC",
    pool: "0xd0b53D9277642d899DF5C87A3966A349A798F224" as const,
    token0: {
      symbol: "WETH",
      address: "0x4200000000000000000000000000000000000006" as const,
      decimals: 18,
    },
    token1: {
      symbol: "USDC",
      address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const,
      decimals: 6,
    },
  },
] as const;

export const UNISWAP_V3_POOL_ABI = [
  {
    inputs: [],
    name: "slot0",
    outputs: [
      { internalType: "uint160", name: "sqrtPriceX96", type: "uint160" },
      { internalType: "int24", name: "tick", type: "int24" },
      { internalType: "uint16", name: "observationIndex", type: "uint16" },
      {
        internalType: "uint16",
        name: "observationCardinality",
        type: "uint16",
      },
      {
        internalType: "uint16",
        name: "observationCardinalityNext",
        type: "uint16",
      },
      { internalType: "uint8", name: "feeProtocol", type: "uint8" },
      { internalType: "bool", name: "unlocked", type: "bool" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "liquidity",
    outputs: [
      { internalType: "uint128", name: "", type: "uint128" },
    ],
    stateMutability: "view",
    type: "function",
  },
] as const;

export const UNISWAP_V3_ROUTER = "0x2626664c2603336E57B271c5C0b26F421741e481" as const;

export const SWAP_ROUTER_ABI = [
  {
    inputs: [
      {
        components: [
          { internalType: "address", name: "tokenIn", type: "address" },
          { internalType: "address", name: "tokenOut", type: "address" },
          { internalType: "uint24", name: "fee", type: "uint24" },
          { internalType: "address", name: "recipient", type: "address" },
          { internalType: "uint256", name: "amountIn", type: "uint256" },
          { internalType: "uint256", name: "amountOutMinimum", type: "uint256" },
          { internalType: "uint160", name: "sqrtPriceLimitX96", type: "uint160" },
        ],
        internalType: "struct IV3SwapRouter.ExactInputSingleParams",
        name: "params",
        type: "tuple",
      },
    ],
    name: "exactInputSingle",
    outputs: [{ internalType: "uint256", name: "amountOut", type: "uint256" }],
    stateMutability: "payable",
    type: "function",
  },
] as const;

/** Polling interval in ms */
export const POLL_INTERVAL_MS = 60_000;

/** Minimum consensus confidence to execute a trade */
export const MIN_CONSENSUS_CONFIDENCE = 0.6;
