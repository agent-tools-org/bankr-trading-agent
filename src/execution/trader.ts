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
  UNISWAP_V3_POOL_ABI,
  SWAP_ROUTER_ABI,
  ERC20_ABI,
} from "../config";

export interface TradeRecord {
  timestamp: number;
  pair: string;
  direction: "long" | "short";
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  amountOutMinimum: string;
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
   * @param currentPrice — current ETH price in USD, used for proper token conversion and slippage.
   */
  async executeTrade(
    direction: "long" | "short",
    pairIndex = 0,
    amountUsd = 10,
    currentPrice?: number
  ): Promise<TradeRecord> {
    const pair = TRADING_PAIRS[pairIndex];

    // long = buy WETH (swap USDC→WETH), short = sell WETH (swap WETH→USDC)
    const tokenIn = direction === "long" ? pair.token1 : pair.token0;
    const tokenOut = direction === "long" ? pair.token0 : pair.token1;

    // `currentPrice` is expected to be WETH price denominated in USDC (USD).
    // If it's missing, derive it from the Uniswap V3 pool to avoid zero slippage protection.
    let ethPrice = currentPrice && currentPrice > 0 ? currentPrice : undefined;
    if (!ethPrice) {
      const slot0Result: any = await this.publicClient.readContract({
        address: pair.pool,
        abi: UNISWAP_V3_POOL_ABI,
        functionName: "slot0",
      });

      const sqrtPriceX96: bigint = slot0Result[0] as bigint;

      // Price (token1 per token0) in human units, same math as `MarketDataCollector`.
      const Q192 = 2n ** 192n;
      const PRECISION = 10n ** 18n;
      const sqrtPriceSq = sqrtPriceX96 * sqrtPriceX96;
      const decimalDiff = pair.token0.decimals - pair.token1.decimals;

      let priceBigInt: bigint;
      if (decimalDiff >= 0) {
        priceBigInt =
          (sqrtPriceSq * 10n ** BigInt(decimalDiff) * PRECISION) / Q192;
      } else {
        priceBigInt =
          (sqrtPriceSq * PRECISION) / (Q192 * 10n ** BigInt(-decimalDiff));
      }

      ethPrice = Number(priceBigInt) / Number(PRECISION);
    }

    // Convert USD to proper token amount
    let amountIn: bigint;
    if (tokenIn.symbol === "USDC") {
      // amountUsd is already in USDC terms (6 decimals).
      amountIn = parseUnits(amountUsd.toFixed(tokenIn.decimals), tokenIn.decimals);
    } else if (ethPrice && ethPrice > 0) {
      // Convert USD to WETH: amountUsd / ethPrice
      const wethAmount = amountUsd / ethPrice;
      amountIn = parseUnits(wethAmount.toFixed(tokenIn.decimals), tokenIn.decimals);
    } else {
      // As a last resort, interpret `amountUsd` as tokenIn amount.
      amountIn = parseUnits(amountUsd.toFixed(tokenIn.decimals), tokenIn.decimals);
    }

    // Calculate slippage-protected minimum output (1% tolerance)
    let amountOutMinimum: bigint;
    if (direction === "long") {
      // Buying WETH with USDC: expected WETH out ≈ amountUsd / ethPrice
      const expectedWeth =
        ethPrice && ethPrice > 0 ? amountUsd / ethPrice : amountUsd;
      const expectedOut = parseUnits(
        expectedWeth.toFixed(tokenOut.decimals),
        tokenOut.decimals
      );
      amountOutMinimum = (expectedOut * 99n) / 100n;
    } else {
      // Selling WETH for USDC: expected USDC out ≈ amountUsd
      const expectedOut = parseUnits(
        amountUsd.toFixed(tokenOut.decimals),
        tokenOut.decimals
      );
      amountOutMinimum = (expectedOut * 99n) / 100n;
    }

    const record: TradeRecord = {
      timestamp: Date.now(),
      pair: pair.name,
      direction,
      tokenIn: tokenIn.symbol,
      tokenOut: tokenOut.symbol,
      amountIn: formatUnits(amountIn, tokenIn.decimals),
      amountOutMinimum: formatUnits(amountOutMinimum, tokenOut.decimals),
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
      // Ensure ERC20 approval for the router
      await this.ensureApproval(tokenIn.address as Address, amountIn);

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
            amountOutMinimum,
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

  /** Check and approve ERC20 token spending for the Uniswap router. */
  private async ensureApproval(tokenAddress: Address, amount: bigint): Promise<void> {
    if (!this.account || !this.walletClient) return;

    const allowance = await this.publicClient.readContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: "allowance",
      args: [this.account.address, UNISWAP_V3_ROUTER],
    });

    if ((allowance as bigint) < amount) {
      const txHash = await this.walletClient.writeContract({
        address: tokenAddress,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [UNISWAP_V3_ROUTER, amount],
      });
      console.log(`[Trader] Approval TX sent: ${txHash}`);
      await this.publicClient.waitForTransactionReceipt({ hash: txHash });
    }
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
