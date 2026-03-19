import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

describe("MultiModelTradeLog indexing", () => {
  it("uses model-hash mapping to avoid unbounded iteration", () => {
    const filePath = path.resolve(
      __dirname,
      "..",
      "contracts",
      "MultiModelTradeLog.sol"
    );
    const src = fs.readFileSync(filePath, "utf8");

    expect(src).toContain(
      "mapping(bytes32 => uint256[]) private _indicesByModelHash"
    );
    // The old implementation iterated over _decisions to filter by model.
    expect(src).not.toMatch(/for\s*\(uint256\s+i\s*=\s*0;\s*i\s*<\s*_decisions\.length;\s*i\+\+\)/);
    // getDecisionsByModel should read from the mapping directly.
    expect(src).toMatch(
      /return\s+_indicesByModelHash\s*\[\s*keccak256\s*\(\s*bytes\s*\(\s*model\s*\)\s*\)\s*\]\s*;/
    );
  });
});

