import { createPublicClient, http, formatUnits } from "viem";
import {
  CHAIN,
  BASE_RPC_URL,
  TRADING_PAIRS,
  UNISWAP_V3_POOL_ABI,
} from "../config";

export interface PriceSnapshot {
  pair: string;
  price: number;
  sqrtPriceX96: bigint;
  tick: number;
  liquidity: bigint;
  timestamp: number;
}

export interface MarketSummary {
  pair: string;
  currentPrice: number;
  priceChange1h: number | null;
  priceChange5m: number | null;
  avgPrice1h: number | null;
  volatility1h: number | null;
  snapshots: number;
}

/**
 * Market data collector — reads Uniswap V3 pool state on Base via viem.
 */
export class MarketDataCollector {
  private client;
  private history: Map<string, PriceSnapshot[]> = new Map();
  private readonly maxHistory = 120; // keep ~2h at 1-min intervals

  constructor(rpcUrl?: string) {
    this.client = createPublicClient({
      chain: CHAIN,
      transport: http(rpcUrl ?? BASE_RPC_URL),
    });
  }

  /** Fetch current price from a Uniswap V3 pool. */
  async fetchPrice(pairIndex = 0): Promise<PriceSnapshot> {
    const pair = TRADING_PAIRS[pairIndex];

    const [slot0Result, liquidityResult] = await Promise.all([
      this.client.readContract({
        address: pair.pool,
        abi: UNISWAP_V3_POOL_ABI,
        functionName: "slot0",
      }),
      this.client.readContract({
        address: pair.pool,
        abi: UNISWAP_V3_POOL_ABI,
        functionName: "liquidity",
      }),
    ]);

    const sqrtPriceX96 = slot0Result[0];
    const tick = Number(slot0Result[1]);
    const liquidity = liquidityResult;

    const price = this.sqrtPriceToPrice(
      sqrtPriceX96,
      pair.token0.decimals,
      pair.token1.decimals
    );

    const snapshot: PriceSnapshot = {
      pair: pair.name,
      price,
      sqrtPriceX96,
      tick,
      liquidity,
      timestamp: Date.now(),
    };

    // Store history
    const hist = this.history.get(pair.name) ?? [];
    hist.push(snapshot);
    if (hist.length > this.maxHistory) hist.shift();
    this.history.set(pair.name, hist);

    return snapshot;
  }

  /** Build a human-readable market summary for LLM consumption. */
  getSummary(pairName: string): MarketSummary {
    const hist = this.history.get(pairName) ?? [];
    const current = hist[hist.length - 1];

    if (!current) {
      return {
        pair: pairName,
        currentPrice: 0,
        priceChange1h: null,
        priceChange5m: null,
        avgPrice1h: null,
        volatility1h: null,
        snapshots: 0,
      };
    }

    const now = Date.now();
    const oneHourAgo = now - 3_600_000;
    const fiveMinAgo = now - 300_000;

    const hourSnapshots = hist.filter((s) => s.timestamp >= oneHourAgo);
    const fiveMinSnapshot = hist.find((s) => s.timestamp >= fiveMinAgo);

    const avgPrice1h =
      hourSnapshots.length > 0
        ? hourSnapshots.reduce((s, h) => s + h.price, 0) / hourSnapshots.length
        : null;

    const volatility1h =
      hourSnapshots.length > 1
        ? Math.sqrt(
            hourSnapshots.reduce((s, h) => {
              const diff = h.price - (avgPrice1h ?? 0);
              return s + diff * diff;
            }, 0) / hourSnapshots.length
          )
        : null;

    const priceChange1h =
      hourSnapshots.length > 0
        ? ((current.price - hourSnapshots[0].price) / hourSnapshots[0].price) * 100
        : null;

    const priceChange5m =
      fiveMinSnapshot
        ? ((current.price - fiveMinSnapshot.price) / fiveMinSnapshot.price) * 100
        : null;

    return {
      pair: pairName,
      currentPrice: current.price,
      priceChange1h,
      priceChange5m,
      avgPrice1h,
      volatility1h,
      snapshots: hist.length,
    };
  }

  /** Format market data as a prompt string for LLM consumption. */
  formatForLLM(pairName: string): string {
    const summary = this.getSummary(pairName);
    const lines = [
      `Market Data for ${summary.pair}:`,
      `  Current Price: $${summary.currentPrice.toFixed(2)}`,
    ];
    if (summary.priceChange5m !== null)
      lines.push(`  5m Change: ${summary.priceChange5m.toFixed(3)}%`);
    if (summary.priceChange1h !== null)
      lines.push(`  1h Change: ${summary.priceChange1h.toFixed(3)}%`);
    if (summary.avgPrice1h !== null)
      lines.push(`  1h Avg Price: $${summary.avgPrice1h.toFixed(2)}`);
    if (summary.volatility1h !== null)
      lines.push(`  1h Volatility: $${summary.volatility1h.toFixed(2)}`);
    lines.push(`  Data Points: ${summary.snapshots}`);
    return lines.join("\n");
  }

  /** Get price history for a pair. */
  getHistory(pairName: string): PriceSnapshot[] {
    return this.history.get(pairName) ?? [];
  }

  /** Convert sqrtPriceX96 to human-readable price. */
  private sqrtPriceToPrice(
    sqrtPriceX96: bigint,
    decimals0: number,
    decimals1: number
  ): number {
    const num = Number(sqrtPriceX96);
    const price = (num / 2 ** 96) ** 2;
    const adjusted = price * 10 ** (decimals0 - decimals1);
    return adjusted;
  }
}
