import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGenerateContent = vi.fn();

vi.mock("@google/genai", () => ({
  GoogleGenAI: class MockGoogleGenAI {
    models = { generateContent: mockGenerateContent };
  },
}));

vi.mock("../gemini", () => ({
  geminiWithRetry: (_client: unknown, params: unknown) => mockGenerateContent(params),
}));

vi.mock("../log-usage", () => ({
  logAiUsage: vi.fn(),
}));

import { checkCriteriaRelevance } from "../check-criteria-relevance";

const mockUsage = { promptTokenCount: 100, candidatesTokenCount: 20 };

describe("checkCriteriaRelevance", () => {
  beforeEach(() => {
    mockGenerateContent.mockReset();
  });

  it("returns relevant=true with confidence for criteria-relevant content", async () => {
    mockGenerateContent.mockResolvedValue({
      usageMetadata: mockUsage,
      text: JSON.stringify({ relevant: true, confidence: 0.95 }),
    });

    const result = await checkCriteriaRelevance(
      "Applications will be scored against the following criteria: 1. Demonstrates clear need (25%)..."
    );

    expect(result.relevant).toBe(true);
    expect(result.confidence).toBe(0.95);
    expect(result.usage).toEqual({ input_tokens: 100, output_tokens: 20, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 });
  });

  it("returns relevant=false for non-criteria content", async () => {
    mockGenerateContent.mockResolvedValue({
      usageMetadata: mockUsage,
      text: JSON.stringify({ relevant: false, confidence: 0.9 }),
    });

    const result = await checkCriteriaRelevance(
      "Contact us at info@funder.org. Our office hours are 9am-5pm."
    );

    expect(result.relevant).toBe(false);
    expect(result.confidence).toBe(0.9);
  });

  it("returns relevant=false on unparseable AI response", async () => {
    mockGenerateContent.mockResolvedValue({
      usageMetadata: mockUsage,
      text: "I cannot determine...",
    });

    const result = await checkCriteriaRelevance("some text");
    expect(result.relevant).toBe(false);
    expect(result.confidence).toBe(0);
  });

  it("returns relevant=false for empty content", async () => {
    const result = await checkCriteriaRelevance("");
    expect(result.relevant).toBe(false);
    expect(result.usage).toEqual({ input_tokens: 0, output_tokens: 0 });
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });
});
