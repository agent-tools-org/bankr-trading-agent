import { describe, it, expect, afterAll } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { compileSol, compileAndWrite } from "../src/compile";

const CONTRACT_PATH = path.resolve(
  __dirname,
  "..",
  "contracts",
  "MultiModelTradeLog.sol"
);
const TMP_OUT = path.resolve(__dirname, "..", ".test-artifacts");

afterAll(() => {
  // Clean up temp artifacts
  if (fs.existsSync(TMP_OUT)) {
    fs.rmSync(TMP_OUT, { recursive: true, force: true });
  }
});

describe("compileSol", () => {
  it("compiles the MultiModelTradeLog contract and returns abi + bytecode", () => {
    const result = compileSol(CONTRACT_PATH);

    expect(result.contractName).toBe("MultiModelTradeLog");
    expect(Array.isArray(result.abi)).toBe(true);
    expect(result.abi.length).toBeGreaterThan(0);
    expect(typeof result.bytecode).toBe("string");
    expect(result.bytecode.length).toBeGreaterThan(0);
  });

  it("abi contains logDecision, getDecisionCount, getDecision, getDecisionsByModel", () => {
    const { abi } = compileSol(CONTRACT_PATH);
    const names = (abi as { name?: string }[])
      .filter((e) => e.name)
      .map((e) => e.name);

    expect(names).toContain("logDecision");
    expect(names).toContain("getDecisionCount");
    expect(names).toContain("getDecision");
    expect(names).toContain("getDecisionsByModel");
  });

  it("abi contains DecisionLogged event", () => {
    const { abi } = compileSol(CONTRACT_PATH);
    const events = (abi as { type?: string; name?: string }[]).filter(
      (e) => e.type === "event"
    );
    const eventNames = events.map((e) => e.name);
    expect(eventNames).toContain("DecisionLogged");
  });

  it("throws on invalid Solidity source", () => {
    const badPath = path.join(TMP_OUT, "Bad.sol");
    fs.mkdirSync(TMP_OUT, { recursive: true });
    fs.writeFileSync(badPath, "this is not valid solidity");

    expect(() => compileSol(badPath)).toThrow();
  });
});

describe("compileAndWrite", () => {
  it("writes ABI and bytecode files to the output directory", () => {
    const { abiPath, bytecodePath } = compileAndWrite(CONTRACT_PATH, TMP_OUT);

    expect(fs.existsSync(abiPath)).toBe(true);
    expect(fs.existsSync(bytecodePath)).toBe(true);

    const abi = JSON.parse(fs.readFileSync(abiPath, "utf8"));
    expect(Array.isArray(abi)).toBe(true);
    expect(abi.length).toBeGreaterThan(0);

    const bin = fs.readFileSync(bytecodePath, "utf8");
    expect(bin.length).toBeGreaterThan(0);
  });
});
