import { describe, it, expect } from "vitest";
import { formatUnits, parseUnits } from "viem";
import { Trader } from "../src/execution/trader";

describe("Trader slippage protection (dry run)", () => {
  it("long: computes USDC input and 1% amountOutMinimum for WETH", async () => {
    const trader = new Trader(undefined, undefined, true);

    const trade = await trader.executeTrade("long", 0, 10, 2000);

    expect(trade.tokenIn).toBe("USDC");
    expect(trade.tokenOut).toBe("WETH");
    expect(trade.amountIn).toBe("10");

    const expectedOut = parseUnits((10 / 2000).toFixed(18), 18); // WETH
    const expectedMin = (expectedOut * 99n) / 100n;

    expect(trade.amountOutMinimum).toBe(formatUnits(expectedMin, 18));
  });

  it("short: computes WETH input from USD and 1% amountOutMinimum for USDC", async () => {
    const trader = new Trader(undefined, undefined, true);

    const trade = await trader.executeTrade("short", 0, 10, 2000);

    expect(trade.tokenIn).toBe("WETH");
    expect(trade.tokenOut).toBe("USDC");
    expect(trade.amountIn).toBe("0.005");

    const expectedOut = parseUnits((10).toFixed(6), 6); // USDC
    const expectedMin = (expectedOut * 99n) / 100n;

    expect(trade.amountOutMinimum).toBe(formatUnits(expectedMin, 6));
  });
});

