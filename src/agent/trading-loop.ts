import * as fs from "fs";
import * as path from "path";
import { BankrClient } from "../llm/bankr-client";
import { MarketDataCollector } from "../data/market-data";
import { MultiModelAnalyzer, AnalysisResult } from "../strategy/multi-model-analyzer";
import { Trader, TradeRecord } from "../execution/trader";
import { TRADING_PAIRS, POLL_INTERVAL_MS, CONSENSUS_MODELS } from "../config";

export interface TradeLogEntry {
  timestamp: string;
  pair: string;
  consensus: {
    direction: string;
    confidence: number;
    agreeing: number;
    total: number;
  };
  perModelVotes: Array<{
    model: string;
    direction: string;
    confidence: number;
    reasoning: string;
  }>;
  trade: TradeRecord | null;
  shouldTrade: boolean;
}

/**
 * Main agent loop — orchestrates the full pipeline:
 * 1. Poll market data from Uniswap V3 on Base
 * 2. Query multiple models via Bankr LLM Gateway
 * 3. Build multi-model consensus
 * 4. Execute trade if consensus reached
 * 5. Log all decisions with per-model breakdown
 */
export class TradingLoop {
  private bankr: BankrClient;
  private market: MarketDataCollector;
  private analyzer: MultiModelAnalyzer;
  private trader: Trader;
  private logPath: string;
  private running = false;
  private cycleCount = 0;

  constructor(options?: { dryRun?: boolean; logDir?: string }) {
    const dryRun = options?.dryRun ?? true;
    const logDir = options?.logDir ?? path.resolve(process.cwd(), "logs");

    this.bankr = new BankrClient();
    this.market = new MarketDataCollector();
    this.analyzer = new MultiModelAnalyzer(this.bankr);
    this.trader = new Trader(undefined, undefined, dryRun);

    // Ensure log directory exists
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    this.logPath = path.join(logDir, "trades.jsonl");
  }

  /** Start the autonomous trading loop. */
  async start(): Promise<void> {
    this.running = true;
    console.log("═══════════════════════════════════════════════════════");
    console.log("  Multi-Model Trading Agent — Powered by Bankr LLM Gateway");
    console.log(`  Models: ${CONSENSUS_MODELS.join(", ")}`);
    console.log(`  Pairs: ${TRADING_PAIRS.map((p) => p.name).join(", ")}`);
    console.log(`  Poll interval: ${POLL_INTERVAL_MS / 1000}s`);
    console.log("═══════════════════════════════════════════════════════\n");

    while (this.running) {
      try {
        await this.cycle();
      } catch (err) {
        console.error("[TradingLoop] Cycle error:", err);
      }

      if (this.running) {
        await this.sleep(POLL_INTERVAL_MS);
      }
    }
  }

  /** Stop the trading loop. */
  stop(): void {
    this.running = false;
    console.log("[TradingLoop] Stopping...");
  }

  /** Run a single analysis + trade cycle. */
  async cycle(): Promise<AnalysisResult | null> {
    this.cycleCount++;
    console.log(`\n--- Cycle #${this.cycleCount} [${new Date().toISOString()}] ---`);

    // 1. Fetch market data
    console.log("[1/4] Fetching market data from Uniswap V3 on Base...");
    let price;
    try {
      price = await this.market.fetchPrice(0);
      console.log(`  ${price.pair}: $${price.price.toFixed(2)}`);
    } catch (err) {
      console.error("[TradingLoop] Failed to fetch price:", err);
      return null;
    }

    // 2. Query multiple models via Bankr
    const marketStr = this.market.formatForLLM(price.pair);
    console.log(`[2/4] Querying ${CONSENSUS_MODELS.length} models via Bankr Gateway...`);

    const analysis = await this.analyzer.analyze(marketStr, price.pair);

    // 3. Log per-model breakdown
    console.log("[3/4] Model Votes:");
    for (const vote of analysis.perModelBreakdown) {
      console.log(
        `  ${vote.model}: ${vote.direction.toUpperCase()} (${(vote.confidence * 100).toFixed(0)}%) — ${vote.reasoning.slice(0, 80)}`
      );
    }
    console.log(
      `  Consensus: ${analysis.consensus.direction.toUpperCase()} ` +
        `(${analysis.consensus.agreeing}/${analysis.consensus.total} agree, ` +
        `${(analysis.consensus.confidence * 100).toFixed(0)}% confidence)`
    );

    // 4. Execute or skip
    let trade: TradeRecord | null = null;
    if (analysis.shouldTrade) {
      console.log("[4/4] Consensus reached — executing trade...");
      trade = await this.trader.executeTrade(analysis.consensus.direction as "long" | "short");
    } else {
      console.log("[4/4] No consensus — skipping trade.");
    }

    // 5. Log to JSONL
    this.appendLog({
      timestamp: new Date().toISOString(),
      pair: price.pair,
      consensus: {
        direction: analysis.consensus.direction,
        confidence: analysis.consensus.confidence,
        agreeing: analysis.consensus.agreeing,
        total: analysis.consensus.total,
      },
      perModelVotes: analysis.perModelBreakdown,
      trade,
      shouldTrade: analysis.shouldTrade,
    });

    return analysis;
  }

  /** Append a log entry to the JSONL trade log. */
  private appendLog(entry: TradeLogEntry): void {
    try {
      fs.appendFileSync(this.logPath, JSON.stringify(entry) + "\n");
    } catch (err) {
      console.error("[TradingLoop] Failed to write log:", err);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
