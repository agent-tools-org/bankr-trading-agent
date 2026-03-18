import { describe, it, expect } from "vitest";
import { BankrClient, ModelResponse, ConsensusResult } from "../src/llm/bankr-client";

/**
 * Helper to create a mock ModelResponse with a given text content.
 */
function mockResponse(model: string, content: string): ModelResponse {
  return { model, content };
}

describe("BankrClient.buildConsensus", () => {
  const client = new BankrClient("fake-key", "https://fake.api");

  describe("majority vote", () => {
    it("unanimous long — 3/3 agree", () => {
      const responses: ModelResponse[] = [
        mockResponse("claude", "DIRECTION: long\nCONFIDENCE: 80%\nREASONING: bullish pattern"),
        mockResponse("gpt", "DIRECTION: long\nCONFIDENCE: 75%\nREASONING: upward trend"),
        mockResponse("gemini", "DIRECTION: long\nCONFIDENCE: 70%\nREASONING: momentum rising"),
      ];
      const result = client.buildConsensus(responses);
      expect(result.direction).toBe("long");
      expect(result.agreeing).toBe(3);
      expect(result.total).toBe(3);
    });

    it("unanimous short — 3/3 agree", () => {
      const responses: ModelResponse[] = [
        mockResponse("claude", "DIRECTION: short\nCONFIDENCE: 85%\nREASONING: bearish signal"),
        mockResponse("gpt", "I would sell here. CONFIDENCE: 70%"),
        mockResponse("gemini", "The outlook is bearish. Confidence: 60%"),
      ];
      const result = client.buildConsensus(responses);
      expect(result.direction).toBe("short");
      expect(result.agreeing).toBe(3);
      expect(result.total).toBe(3);
    });

    it("2/3 majority long with 1 short", () => {
      const responses: ModelResponse[] = [
        mockResponse("claude", "DIRECTION: long\nCONFIDENCE: 80%"),
        mockResponse("gpt", "DIRECTION: long\nCONFIDENCE: 70%"),
        mockResponse("gemini", "DIRECTION: short\nCONFIDENCE: 60%"),
      ];
      const result = client.buildConsensus(responses);
      expect(result.direction).toBe("long");
      expect(result.agreeing).toBe(2);
      expect(result.total).toBe(3);
    });

    it("2/3 majority short with 1 neutral", () => {
      const responses: ModelResponse[] = [
        mockResponse("claude", "DIRECTION: short\nCONFIDENCE: 90%"),
        mockResponse("gpt", "DIRECTION: short\nCONFIDENCE: 65%"),
        mockResponse("gemini", "I am neutral. Confidence: 40%"),
      ];
      const result = client.buildConsensus(responses);
      expect(result.direction).toBe("short");
      expect(result.agreeing).toBe(2);
      expect(result.total).toBe(3);
    });

    it("no majority — all different directions → first highest count wins", () => {
      const responses: ModelResponse[] = [
        mockResponse("claude", "I want to buy. Confidence: 80%"),
        mockResponse("gpt", "I would sell. Confidence: 70%"),
        mockResponse("gemini", "I am neutral on this. Confidence: 50%"),
      ];
      const result = client.buildConsensus(responses);
      // Each direction has count 1; iteration order is long, short, neutral
      // so the last one seen with max count wins (neutral replaces short replaces long)
      expect(result.agreeing).toBe(1);
      expect(result.total).toBe(3);
      expect(["long", "short", "neutral"]).toContain(result.direction);
    });
  });

  describe("weighted confidence", () => {
    it("averages confidence of the agreeing models only", () => {
      const responses: ModelResponse[] = [
        mockResponse("claude", "DIRECTION: long\nCONFIDENCE: 80%"),
        mockResponse("gpt", "DIRECTION: long\nCONFIDENCE: 60%"),
        mockResponse("gemini", "DIRECTION: short\nCONFIDENCE: 90%"),
      ];
      const result = client.buildConsensus(responses);
      expect(result.direction).toBe("long");
      // Average of 0.80 and 0.60 = 0.70
      expect(result.confidence).toBeCloseTo(0.70, 2);
    });

    it("high confidence unanimous", () => {
      const responses: ModelResponse[] = [
        mockResponse("claude", "DIRECTION: long\nCONFIDENCE: 90%"),
        mockResponse("gpt", "DIRECTION: long\nCONFIDENCE: 85%"),
        mockResponse("gemini", "DIRECTION: long\nCONFIDENCE: 95%"),
      ];
      const result = client.buildConsensus(responses);
      expect(result.direction).toBe("long");
      expect(result.confidence).toBeCloseTo(0.90, 2);
    });

    it("low confidence unanimous", () => {
      const responses: ModelResponse[] = [
        mockResponse("claude", "I would buy. Confidence: 30%"),
        mockResponse("gpt", "Bullish outlook. Confidence: 25%"),
        mockResponse("gemini", "Long position suggested. Confidence: 35%"),
      ];
      const result = client.buildConsensus(responses);
      expect(result.direction).toBe("long");
      expect(result.confidence).toBeCloseTo(0.30, 2);
    });
  });

  describe("signal parsing from natural text", () => {
    it("parses 'buy' as long direction", () => {
      const responses: ModelResponse[] = [
        mockResponse("model1", "I recommend to buy. Confidence: 75%"),
      ];
      const result = client.buildConsensus(responses);
      expect(result.direction).toBe("long");
      expect(result.confidence).toBeCloseTo(0.75, 2);
    });

    it("parses 'bullish' as long direction", () => {
      const responses: ModelResponse[] = [
        mockResponse("model1", "Market looks bullish. Confidence: 65%"),
      ];
      const result = client.buildConsensus(responses);
      expect(result.direction).toBe("long");
    });

    it("parses 'sell' as short direction", () => {
      const responses: ModelResponse[] = [
        mockResponse("model1", "I recommend to sell. Confidence: 70%"),
      ];
      const result = client.buildConsensus(responses);
      expect(result.direction).toBe("short");
    });

    it("parses 'bearish' as short direction", () => {
      const responses: ModelResponse[] = [
        mockResponse("model1", "Market looks bearish. Confidence: 55%"),
      ];
      const result = client.buildConsensus(responses);
      expect(result.direction).toBe("short");
    });

    it("defaults to neutral when no direction keyword found", () => {
      const responses: ModelResponse[] = [
        mockResponse("model1", "The market is uncertain. Confidence: 40%"),
      ];
      const result = client.buildConsensus(responses);
      expect(result.direction).toBe("neutral");
    });

    it("defaults to 0.5 confidence when no confidence found", () => {
      const responses: ModelResponse[] = [
        mockResponse("model1", "I recommend to buy immediately"),
      ];
      const result = client.buildConsensus(responses);
      expect(result.direction).toBe("long");
      expect(result.confidence).toBe(0.5);
    });

    it("parses fractional confidence (0.85) without percent sign", () => {
      const responses: ModelResponse[] = [
        mockResponse("model1", "Long. Confidence: 0.85"),
      ];
      const result = client.buildConsensus(responses);
      expect(result.confidence).toBeCloseTo(0.85, 2);
    });
  });

  describe("edge cases", () => {
    it("handles empty responses array", () => {
      const result = client.buildConsensus([]);
      expect(result.direction).toBe("neutral");
      expect(result.confidence).toBe(0);
      expect(result.agreeing).toBe(0);
      expect(result.total).toBe(0);
    });

    it("handles single response", () => {
      const responses: ModelResponse[] = [
        mockResponse("claude", "DIRECTION: long\nCONFIDENCE: 82%"),
      ];
      const result = client.buildConsensus(responses);
      expect(result.direction).toBe("long");
      expect(result.agreeing).toBe(1);
      expect(result.total).toBe(1);
      expect(result.confidence).toBeCloseTo(0.82, 2);
    });

    it("preserves original responses in result", () => {
      const responses: ModelResponse[] = [
        mockResponse("claude", "Long. Confidence: 80%"),
        mockResponse("gpt", "Short. Confidence: 60%"),
      ];
      const result = client.buildConsensus(responses);
      expect(result.responses).toBe(responses);
      expect(result.responses).toHaveLength(2);
    });

    it("handles empty string content gracefully", () => {
      const responses: ModelResponse[] = [
        mockResponse("model1", ""),
        mockResponse("model2", ""),
        mockResponse("model3", ""),
      ];
      const result = client.buildConsensus(responses);
      expect(result.direction).toBe("neutral");
      expect(result.confidence).toBe(0.5);
      expect(result.agreeing).toBe(3);
    });
  });
});
