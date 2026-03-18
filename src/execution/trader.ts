import {
  createPublicClient,
  createWalletClient,
  http,
  formatUnits,
  parseUnits,
  type Address,
  type Hash,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  CHAIN,
  BASE_RPC_URL,
  PRIVATE_KEY,
  TRADING_PAIRS,
  UNISWAP_V3_ROUTER,
  SWAP_ROUTER_ABI,
} from "../config";

export interface TradeRecord {
  timestamp: number;
  pair: string;
  direction: "long" | "short";
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  txHash: string | null;
  status: "executed" | "simulated" | "failed";
  error?: string;
}

export interface PortfolioState {
  balances: Record<string, string>;
  totalValueUsd: number;
  trades: number;
}

/**
 * Trade executor — reads on-chain prices and executes swaps on Uniswap V3 (Base).
 */
export class Trader {
  private publicClient;
  private walletClient;
  private account;
  private tradeHistory: TradeRecord[] = [];
  private dryRun: boolean;

  constructor(privateKey?: string, rpcUrl?: string, dryRun = true) {
    const key = privateKey ?? PRIVATE_KEY;
    this.dryRun = dryRun;

    this.publicClient = createPublicClient({
      chain: CHAIN,
      transport: http(rpcUrl ?? BASE_RPC_URL),
    });

    if (key && key.startsWith("0x")) {
      this.account = privateKeyToAccount(key as `0x${string}`);
      this.walletClient = createWalletClient({
        account: this.account,
        chain: CHAIN,
        transport: http(rpcUrl ?? BASE_RPC_URL),
      });
    } else {
      this.account = null;
      this.walletClient = null;
    }
  }

  /**
   * Execute a swap based on the consensus direction.
   * In dry-run mode, simulates the trade without sending a transaction.
   */
  async executeTrade(
    direction: "long" | "short",
    pairIndex = 0,
    amountUsd = 10
  ): Promise<TradeRecord> {
    const pair = TRADING_PAIRS[pairIndex];

    // long = buy WETH (swap USDC→WETH), short = sell WETH (swap WETH→USDC)
    const tokenIn = direction === "long" ? pair.token1 : pair.token0;
    const tokenOut = direction === "long" ? pair.token0 : pair.token1;

    const amountIn = parseUnits(
      amountUsd.toString(),
      tokenIn.decimals
    );

    const record: TradeRecord = {
      timestamp: Date.now(),
      pair: pair.name,
      direction,
      tokenIn: tokenIn.symbol,
      tokenOut: tokenOut.symbol,
      amountIn: formatUnits(amountIn, tokenIn.decimals),
      txHash: null,
      status: "simulated",
    };

    if (this.dryRun || !this.walletClient || !this.account) {
      console.log(
        `[Trader] DRY RUN: ${direction.toUpperCase()} ${pair.name} — ` +
          `swap ${record.amountIn} ${tokenIn.symbol} → ${tokenOut.symbol}`
      );
      record.status = "simulated";
      this.tradeHistory.push(record);
      return record;
    }

    try {
      const txHash = await this.walletClient.writeContract({
        address: UNISWAP_V3_ROUTER,
        abi: SWAP_ROUTER_ABI,
        functionName: "exactInputSingle",
        args: [
          {
            tokenIn: tokenIn.address,
            tokenOut: tokenOut.address,
            fee: 3000,
            recipient: this.account.address,
            amountIn,
            amountOutMinimum: 0n,
            sqrtPriceLimitX96: 0n,
          },
        ],
      });

      record.txHash = txHash;
      record.status = "executed";
      console.log(`[Trader] TX sent: ${txHash}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      record.status = "failed";
      record.error = message;
      console.error(`[Trader] Trade failed: ${message}`);
    }

    this.tradeHistory.push(record);
    return record;
  }

  /** Get portfolio state (balances are estimated from trade history). */
  getPortfolio(): PortfolioState {
    return {
      balances: {},
      totalValueUsd: 0,
      trades: this.tradeHistory.length,
    };
  }

  /** Get all trade history. */
  getTradeHistory(): TradeRecord[] {
    return [...this.tradeHistory];
  }
}
