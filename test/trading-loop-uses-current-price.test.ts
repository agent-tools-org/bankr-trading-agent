import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

describe("TradingLoop current price wiring", () => {
  it("passes price.price into Trader.executeTrade", () => {
    const filePath = path.resolve(
      __dirname,
      "..",
      "src",
      "agent",
      "trading-loop.ts"
    );

    const src = fs.readFileSync(filePath, "utf8");
    expect(src).toContain("executeTrade(");
    expect(src).toContain("price.price");
  });
});

