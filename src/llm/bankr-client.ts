import { BANKR_API_URL, BANKR_API_KEY } from "../config";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ModelResponse {
  model: string;
  content: string;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

export interface ConsensusResult {
  direction: "long" | "short" | "neutral";
  confidence: number;
  agreeing: number;
  total: number;
  responses: ModelResponse[];
}

/**
 * Bankr LLM Gateway client — OpenAI-compatible API that routes to 20+ models.
 * Single API key, single endpoint, multiple models.
 */
export class BankrClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(apiKey?: string, baseUrl?: string) {
    this.apiKey = apiKey ?? BANKR_API_KEY;
    this.baseUrl = baseUrl ?? BANKR_API_URL;

    if (!this.apiKey) {
      console.warn("[BankrClient] BANKR_API_KEY not set — requests will fail");
    }
  }

  /**
   * Query a specific model through the Bankr LLM Gateway.
   */
  async queryModel(model: string, prompt: string, systemPrompt?: string): Promise<ModelResponse> {
    const messages: ChatMessage[] = [];
    if (systemPrompt) {
      messages.push({ role: "system", content: systemPrompt });
    }
    messages.push({ role: "user", content: prompt });

    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.2,
        max_tokens: 1024,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Bankr API error (${res.status}) for model ${model}: ${body}`);
    }

    const data: any = await res.json();
    return {
      model,
      content: data.choices?.[0]?.message?.content ?? "",
      usage: data.usage,
    };
  }

  /**
   * Query multiple models in parallel via the Bankr Gateway.
   * This is the core advantage — one API key, many models, parallel requests.
   */
  async queryMultiple(
    models: string[],
    prompt: string,
    systemPrompt?: string
  ): Promise<ModelResponse[]> {
    const results = await Promise.allSettled(
      models.map((m) => this.queryModel(m, prompt, systemPrompt))
    );

    const responses: ModelResponse[] = [];
    for (const r of results) {
      if (r.status === "fulfilled") {
        responses.push(r.value);
      } else {
        console.error("[BankrClient] Model query failed:", r.reason);
      }
    }
    return responses;
  }

  /**
   * Build consensus from multiple model responses.
   * Parses each response for a direction + confidence, then does majority vote.
   */
  buildConsensus(responses: ModelResponse[]): ConsensusResult {
    const votes: Array<{ model: string; direction: "long" | "short" | "neutral"; confidence: number }> = [];

    for (const resp of responses) {
      const parsed = this.parseTradeSignal(resp.content);
      votes.push({ model: resp.model, ...parsed });
    }

    const tally: Record<string, { count: number; totalConf: number }> = {
      long: { count: 0, totalConf: 0 },
      short: { count: 0, totalConf: 0 },
      neutral: { count: 0, totalConf: 0 },
    };

    for (const v of votes) {
      tally[v.direction].count++;
      tally[v.direction].totalConf += v.confidence;
    }

    let winner: "long" | "short" | "neutral" = "neutral";
    let maxCount = 0;
    for (const dir of ["long", "short", "neutral"] as const) {
      if (tally[dir].count > maxCount) {
        maxCount = tally[dir].count;
        winner = dir;
      }
    }

    const avgConfidence =
      maxCount > 0 ? tally[winner].totalConf / maxCount : 0;

    return {
      direction: winner,
      confidence: avgConfidence,
      agreeing: maxCount,
      total: responses.length,
      responses,
    };
  }

  /** Parse a model's text response into a structured trade signal. */
  private parseTradeSignal(text: string): { direction: "long" | "short" | "neutral"; confidence: number } {
    const { direction, confidence } = parseTradeVote(text);
    return { direction, confidence };
  }
}

/**
 * Unified parser for LLM trade vote responses.
 * Extracts direction, confidence, and reasoning from free-form text.
 */
export function parseTradeVote(text: string): {
  direction: "long" | "short" | "neutral";
  confidence: number;
  reasoning: string;
} {
  const lower = text.toLowerCase();

  let direction: "long" | "short" | "neutral" = "neutral";
  const dirMatch = lower.match(/direction[:\s]*(long|short|neutral)/);
  if (dirMatch) {
    direction = dirMatch[1] as "long" | "short" | "neutral";
  } else if (/\b(long|buy|bullish)\b/.test(lower)) {
    direction = "long";
  } else if (/\b(short|sell|bearish)\b/.test(lower)) {
    direction = "short";
  }

  let confidence = 0.5;
  const confMatch = lower.match(/confidence[:\s]*(\d+(?:\.\d+)?)\s*%?/);
  if (confMatch) {
    const val = parseFloat(confMatch[1]);
    confidence = val > 1 ? val / 100 : val;
  }

  let reasoning = "";
  const reasonMatch = text.match(/REASONING[:\s]*(.*)/i);
  if (reasonMatch) {
    reasoning = reasonMatch[1].trim();
  } else {
    const lines = text.split("\n").filter((l) => l.trim().length > 10);
    reasoning = lines[lines.length - 1]?.trim() ?? "";
  }

  return { direction, confidence, reasoning };
}
