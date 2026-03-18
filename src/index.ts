import { TradingLoop } from "./agent/trading-loop";
import { BANKR_API_KEY, CONSENSUS_MODELS } from "./config";

async function main(): Promise<void> {
  console.log("╔══════════════════════════════════════════════════╗");
  console.log("║   Bankr Multi-Model Trading Agent               ║");
  console.log("║   Consensus-driven autonomous trading on Base   ║");
  console.log("╚══════════════════════════════════════════════════╝\n");

  if (!BANKR_API_KEY) {
    console.error("ERROR: BANKR_API_KEY is not set.");
    console.error("Get your key at https://bankr.chat and set it in .env");
    process.exit(1);
  }

  console.log(`Models: ${CONSENSUS_MODELS.join(", ")}`);
  console.log(`Mode: dry-run (set DRY_RUN=false to execute real trades)\n`);

  const dryRun = process.env.DRY_RUN !== "false";
  const loop = new TradingLoop({ dryRun });

  // Graceful shutdown
  const shutdown = () => {
    console.log("\nShutting down gracefully...");
    loop.stop();
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  await loop.start();
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
