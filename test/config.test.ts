import { describe, it, expect } from "vitest";
import {
  BANKR_API_URL,
  CONSENSUS_MODELS,
  TRADING_PAIRS,
  MIN_CONSENSUS_CONFIDENCE,
  POLL_INTERVAL_MS,
  UNISWAP_V3_ROUTER,
  UNISWAP_V3_POOL_ABI,
  SWAP_ROUTER_ABI,
  CHAIN,
} from "../src/config";

describe("config exports", () => {
  it("BANKR_API_URL is a valid https URL", () => {
    expect(BANKR_API_URL).toBe("https://api.bankr.chat/v1");
  });

  it("CONSENSUS_MODELS has 3 expected models", () => {
    expect(CONSENSUS_MODELS).toHaveLength(3);
    expect(CONSENSUS_MODELS).toContain("claude-sonnet-4-5");
    expect(CONSENSUS_MODELS).toContain("gpt-4o");
    expect(CONSENSUS_MODELS).toContain("gemini-2.0-flash");
  });

  it("TRADING_PAIRS contains WETH/USDC pair with correct structure", () => {
    expect(TRADING_PAIRS).toHaveLength(1);
    const pair = TRADING_PAIRS[0];
    expect(pair.name).toBe("WETH/USDC");
    expect(pair.pool).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(pair.token0.symbol).toBe("WETH");
    expect(pair.token0.decimals).toBe(18);
    expect(pair.token1.symbol).toBe("USDC");
    expect(pair.token1.decimals).toBe(6);
  });

  it("MIN_CONSENSUS_CONFIDENCE is between 0 and 1", () => {
    expect(MIN_CONSENSUS_CONFIDENCE).toBeGreaterThan(0);
    expect(MIN_CONSENSUS_CONFIDENCE).toBeLessThanOrEqual(1);
    expect(MIN_CONSENSUS_CONFIDENCE).toBe(0.6);
  });

  it("POLL_INTERVAL_MS is a positive number", () => {
    expect(POLL_INTERVAL_MS).toBeGreaterThan(0);
    expect(POLL_INTERVAL_MS).toBe(60_000);
  });

  it("UNISWAP_V3_ROUTER is a valid address", () => {
    expect(UNISWAP_V3_ROUTER).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });

  it("UNISWAP_V3_POOL_ABI has slot0 and liquidity functions", () => {
    const names = UNISWAP_V3_POOL_ABI.map((e) => e.name);
    expect(names).toContain("slot0");
    expect(names).toContain("liquidity");
  });

  it("SWAP_ROUTER_ABI has exactInputSingle function", () => {
    const names = SWAP_ROUTER_ABI.map((e) => e.name);
    expect(names).toContain("exactInputSingle");
  });

  it("CHAIN is Base (chainId 8453)", () => {
    expect(CHAIN.id).toBe(8453);
  });
});
