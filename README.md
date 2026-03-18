# Bankr Multi-Model Trading Agent

> **Hackathon Track: Best Bankr LLM Gateway Use**

An autonomous trading agent that achieves consensus-driven decisions by querying **3 different LLMs** (Claude, GPT, Gemini) through the **Bankr LLM Gateway** — a single API for 20+ models — before executing any on-chain trade.

## Key Differentiator

**No single model hallucination can cause a bad trade.**

The agent queries Claude Sonnet 4.5, GPT-4o, and Gemini 2.0 Flash in parallel through Bankr's unified API. A trade only executes when **2/3+ models agree** on direction with sufficient confidence. This multi-model consensus eliminates single-point-of-failure AI decisions.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                 Bankr LLM Gateway                   │
│            api.bankr.chat/v1 (OpenAI-compatible)    │
│     ┌──────────┬──────────┬──────────────────┐      │
│     │ Claude   │  GPT-4o  │ Gemini 2.0 Flash │      │
│     │Sonnet 4.5│          │                  │      │
│     └────┬─────┴────┬─────┴────────┬─────────┘      │
└──────────┼──────────┼──────────────┼─────────────────┘
           │          │              │
           ▼          ▼              ▼
     ┌─────────────────────────────────────┐
     │       Multi-Model Consensus         │
     │   Majority vote + weighted conf.    │
     │   2/3+ agreement required           │
     └──────────────────┬──────────────────┘
                        │
              ┌─────────▼──────────┐
              │   Trade Executor   │
              │  Uniswap V3 / Base │
              └────────────────────┘
```

## Pipeline

1. **Market Data** — Reads Uniswap V3 pool prices on Base via `viem`
2. **Multi-Model Query** — Sends data to 3 models via Bankr Gateway (parallel)
3. **Consensus** — Majority vote with confidence weighting
4. **Execution** — Swaps on Uniswap V3 when consensus is reached
5. **Logging** — Every decision logged with per-model vote breakdown

## Setup

```bash
npm install
cp .env.example .env
# Edit .env with your Bankr API key
```

## Configuration

| Variable | Description |
|---|---|
| `BANKR_API_KEY` | Your Bankr LLM Gateway API key ([bankr.chat](https://bankr.chat)) |
| `BASE_RPC_URL` | Base RPC endpoint (default: `https://mainnet.base.org`) |
| `PRIVATE_KEY` | Wallet private key (only needed for live trading) |
| `DRY_RUN` | Set to `false` for live trading (default: `true`) |

## Run

```bash
# Build
npm run build

# Start (dry-run mode by default)
npm start

# Or run directly with ts-node
npm run dev
```

## Trade Log

All decisions are logged to `logs/trades.jsonl` with per-model vote breakdowns:

```json
{
  "timestamp": "2025-01-15T10:30:00Z",
  "pair": "WETH/USDC",
  "consensus": { "direction": "long", "confidence": 0.78, "agreeing": 3, "total": 3 },
  "perModelVotes": [
    { "model": "claude-sonnet-4-5", "direction": "long", "confidence": 0.82, "reasoning": "..." },
    { "model": "gpt-4o", "direction": "long", "confidence": 0.75, "reasoning": "..." },
    { "model": "gemini-2.0-flash", "direction": "long", "confidence": 0.71, "reasoning": "..." }
  ],
  "trade": { "pair": "WETH/USDC", "direction": "long", "status": "simulated" },
  "shouldTrade": true
}
```

## Project Structure

```
src/
├── config.ts                    # Configuration & constants
├── index.ts                     # Entry point
├── llm/
│   └── bankr-client.ts          # Bankr LLM Gateway client
├── data/
│   └── market-data.ts           # Uniswap V3 price reader
├── strategy/
│   └── multi-model-analyzer.ts  # Multi-model consensus engine
├── execution/
│   └── trader.ts                # On-chain trade executor
└── agent/
    └── trading-loop.ts          # Main autonomous loop
```

## Why Bankr LLM Gateway?

- **Single API** for Claude, GPT, Gemini, and 20+ more models
- **OpenAI-compatible** — drop-in replacement, standard chat completions
- **Parallel queries** — query multiple models simultaneously
- **One API key** — no need to manage keys for each provider
- **Built for agents** — designed for autonomous systems that need reliable AI

## License

MIT
