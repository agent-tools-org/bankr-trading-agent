import { BankrClient, ConsensusResult, ModelResponse, parseTradeVote } from "../llm/bankr-client";
import { MarketDataCollector } from "../data/market-data";
import { CONSENSUS_MODELS, MIN_CONSENSUS_CONFIDENCE, SupportedModel } from "../config";

export interface AnalysisResult {
  pair: string;
  consensus: ConsensusResult;
  marketData: string;
  perModelBreakdown: ModelVote[];
  shouldTrade: boolean;
  timestamp: number;
}

export interface ModelVote {
  model: string;
  direction: "long" | "short" | "neutral";
  confidence: number;
  reasoning: string;
}

const SYSTEM_PROMPT = `You are a quantitative crypto trading analyst. Analyze the given market data and provide a clear trading signal.

You MUST respond in this exact format:
DIRECTION: <long|short|neutral>
CONFIDENCE: <number 0-100>%
REASONING: <1-2 sentence explanation>

Be concise. Base your analysis only on the provided data.`;

/**
 * Multi-Model Market Analyzer — sends market data to 3 different LLMs
 * via the Bankr Gateway and builds consensus from their responses.
 */
export class MultiModelAnalyzer {
  private bankr: BankrClient;
  private models: readonly string[];

  constructor(bankr: BankrClient, models?: readonly string[]) {
    this.bankr = bankr;
    this.models = models ?? CONSENSUS_MODELS;
  }

  /**
   * Analyze a trading pair by querying all models in parallel via Bankr.
   * Returns structured consensus with per-model breakdown.
   */
  async analyze(
    marketData: string,
    pair: string
  ): Promise<AnalysisResult> {
    const prompt = `Analyze this market data and provide a trading signal:\n\n${marketData}`;

    // Query all models in parallel through Bankr's single API
    const responses = await this.bankr.queryMultiple(
      [...this.models],
      prompt,
      SYSTEM_PROMPT
    );

    // Build consensus from all model responses
    const consensus = this.bankr.buildConsensus(responses);

    // Parse per-model breakdown for logging
    const perModelBreakdown = responses.map((r) => this.parseVote(r));

    // Only trade when 2/3+ models agree AND confidence threshold met
    const shouldTrade =
      consensus.direction !== "neutral" &&
      consensus.agreeing >= Math.ceil(this.models.length * 2 / 3) &&
      consensus.confidence >= MIN_CONSENSUS_CONFIDENCE;

    return {
      pair,
      consensus,
      marketData,
      perModelBreakdown,
      shouldTrade,
      timestamp: Date.now(),
    };
  }

  /** Parse a single model response into a structured vote. */
  private parseVote(response: ModelResponse): ModelVote {
    const { direction, confidence, reasoning } = parseTradeVote(response.content);
    return { model: response.model, direction, confidence, reasoning };
  }
}
