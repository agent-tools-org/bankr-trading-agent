import { createPublicClient, http } from "viem";
import { base } from "viem/chains";
import * as fs from "fs";
import * as path from "path";
import { UNISWAP_V3_POOL_ABI, TRADING_PAIRS } from "../src/config";
import { BankrClient, ModelResponse } from "../src/llm/bankr-client";

async function main() {
  console.log("╔══════════════════════════════════════════════════════╗");
  console.log("║  Bankr Multi-Model Trading Agent — Demo             ║");
  console.log("╚══════════════════════════════════════════════════════╝\n");

  // ── 1. Read real on-chain price from Base mainnet ─────────────────
  console.log("[1/3] Reading WETH/USDC price from Base mainnet...\n");

  const client = createPublicClient({
    chain: base,
    transport: http("https://mainnet.base.org"),
  });

  const pair = TRADING_PAIRS[0];

  const slot0 = await client.readContract({
    address: pair.pool,
    abi: UNISWAP_V3_POOL_ABI,
    functionName: "slot0",
  });

  const sqrtPriceX96 = slot0[0];
  const tick = Number(slot0[1]);

  // Convert sqrtPriceX96 to human-readable price
  const num = Number(sqrtPriceX96);
  const rawPrice = (num / 2 ** 96) ** 2;
  const ethPrice = rawPrice * 10 ** (pair.token0.decimals - pair.token1.decimals);

  console.log(`  Pool:         ${pair.pool}`);
  console.log(`  sqrtPriceX96: ${sqrtPriceX96.toString()}`);
  console.log(`  Tick:         ${tick}`);
  console.log(`  WETH/USDC:    $${ethPrice.toFixed(2)}\n`);

  // ── 2. Multi-model consensus demo (mock responses) ────────────────
  console.log("[2/3] Running multi-model consensus (mock responses)...\n");

  const mockResponses: ModelResponse[] = [
    {
      model: "claude-sonnet-4-5",
      content: `DIRECTION: long\nCONFIDENCE: 78%\nREASONING: ETH at $${ethPrice.toFixed(0)} shows strong support with bullish momentum on Base L2 activity.`,
    },
    {
      model: "gpt-4o",
      content: `DIRECTION: long\nCONFIDENCE: 72%\nREASONING: Price consolidation above key moving averages suggests upward continuation.`,
    },
    {
      model: "gemini-2.0-flash",
      content: `DIRECTION: neutral\nCONFIDENCE: 55%\nREASONING: Mixed signals — waiting for clearer directional confirmation before committing.`,
    },
  ];

  for (const r of mockResponses) {
    console.log(`  ${r.model}:`);
    console.log(`    ${r.content.replace(/\n/g, "\n    ")}\n`);
  }

  // ── 3. Run consensus algorithm ────────────────────────────────────
  const bankr = new BankrClient("demo-key", "https://api.bankr.chat/v1");
  const consensus = bankr.buildConsensus(mockResponses);

  const shouldTrade =
    consensus.direction !== "neutral" &&
    consensus.agreeing >= 2 &&
    consensus.confidence >= 0.6;

  console.log("[3/3] Consensus Result:\n");
  console.log(`  Direction:    ${consensus.direction.toUpperCase()}`);
  console.log(`  Confidence:   ${(consensus.confidence * 100).toFixed(0)}%`);
  console.log(`  Agreement:    ${consensus.agreeing}/${consensus.total} models`);
  console.log(`  Should Trade: ${shouldTrade ? "YES ✓" : "NO ✗"}\n`);

  // ── Save proof ────────────────────────────────────────────────────
  const proofDir = path.resolve(__dirname, "..", "proof");
  if (!fs.existsSync(proofDir)) {
    fs.mkdirSync(proofDir, { recursive: true });
  }

  const proof = {
    timestamp: new Date().toISOString(),
    ethPrice: parseFloat(ethPrice.toFixed(2)),
    pool: pair.pool,
    sqrtPriceX96: sqrtPriceX96.toString(),
    tick,
    modelVotes: mockResponses.map((r) => ({
      model: r.model,
      response: r.content,
    })),
    consensusResult: {
      direction: consensus.direction,
      confidence: consensus.confidence,
      agreeing: consensus.agreeing,
      total: consensus.total,
      shouldTrade,
    },
  };

  const proofPath = path.join(proofDir, "demo.json");
  fs.writeFileSync(proofPath, JSON.stringify(proof, null, 2) + "\n");
  console.log(`Proof saved to ${proofPath}`);
}

main().catch((err) => {
  console.error("Demo failed:", err);
  process.exit(1);
});
