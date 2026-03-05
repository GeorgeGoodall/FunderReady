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

import { filterLinksForCriteria, type LinkCandidate } from "../filter-links";

const mockUsage = { promptTokenCount: 100, candidatesTokenCount: 50 };

describe("filterLinksForCriteria", () => {
  beforeEach(() => {
    mockGenerateContent.mockReset();
  });

  it("returns indices of criteria-relevant links from AI response", async () => {
    const links: LinkCandidate[] = [
      { url: "https://ex.com/about", text: "About Us", context: "Learn about our organisation." },
      { url: "https://ex.com/criteria", text: "Assessment Criteria", context: "How we assess your application." },
      { url: "https://ex.com/contact", text: "Contact", context: "Get in touch with the team." },
      { url: "https://ex.com/scoring", text: "Read more", context: "Scoring matrix and weighting details." },
    ];

    mockGenerateContent.mockResolvedValue({
      usageMetadata: mockUsage,
      text: JSON.stringify({ relevant_indices: [1, 3] }),
    });

    const result = await filterLinksForCriteria(links);

    expect(result.selected).toEqual([
      { url: "https://ex.com/criteria", text: "Assessment Criteria", context: "How we assess your application." },
      { url: "https://ex.com/scoring", text: "Read more", context: "Scoring matrix and weighting details." },
    ]);
    expect(result.selectedIndices).toEqual([1, 3]);
    expect(result.allLinks).toBe(links);
    expect(result.usage).toEqual({ input_tokens: 100, output_tokens: 50, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 });
  });

  it("returns empty array when AI finds no relevant links", async () => {
    const links: LinkCandidate[] = [
      { url: "https://ex.com/about", text: "About Us", context: "Our history." },
    ];

    mockGenerateContent.mockResolvedValue({
      usageMetadata: mockUsage,
      text: JSON.stringify({ relevant_indices: [] }),
    });

    const result = await filterLinksForCriteria(links);
    expect(result.selected).toEqual([]);
    expect(result.selectedIndices).toEqual([]);
  });

  it("returns empty array when given empty links list", async () => {
    const result = await filterLinksForCriteria([]);
    expect(result.selected).toEqual([]);
    expect(result.usage).toEqual({ input_tokens: 0, output_tokens: 0 });
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });

  it("returns empty array on empty AI response text", async () => {
    const links: LinkCandidate[] = [
      { url: "https://ex.com/criteria", text: "Criteria", context: "Assessment." },
    ];

    mockGenerateContent.mockResolvedValue({
      usageMetadata: mockUsage,
      text: "",
    });

    const result = await filterLinksForCriteria(links);
    expect(result.selected).toEqual([]);
    expect(result.selectedIndices).toEqual([]);
  });

  it("returns empty array on unparseable AI response", async () => {
    const links: LinkCandidate[] = [
      { url: "https://ex.com/criteria", text: "Criteria", context: "Assessment." },
    ];

    mockGenerateContent.mockResolvedValue({
      usageMetadata: mockUsage,
      text: "I cannot determine the relevant links...",
    });

    const result = await filterLinksForCriteria(links);
    expect(result.selected).toEqual([]);
    expect(result.selectedIndices).toEqual([]);
  });

  it("returns empty array when AI response lacks relevant_indices array", async () => {
    const links: LinkCandidate[] = [
      { url: "https://ex.com/criteria", text: "Criteria", context: "Assessment." },
    ];

    mockGenerateContent.mockResolvedValue({
      usageMetadata: mockUsage,
      text: JSON.stringify({ answer: "none" }),
    });

    const result = await filterLinksForCriteria(links);
    expect(result.selected).toEqual([]);
    expect(result.selectedIndices).toEqual([]);
  });

  it("filters out out-of-bounds indices from AI response", async () => {
    const links: LinkCandidate[] = [
      { url: "https://ex.com/about", text: "About", context: "About us." },
      { url: "https://ex.com/criteria", text: "Criteria", context: "Assessment." },
    ];

    mockGenerateContent.mockResolvedValue({
      usageMetadata: mockUsage,
      text: JSON.stringify({ relevant_indices: [-1, 1, 5, 99] }),
    });

    const result = await filterLinksForCriteria(links);
    expect(result.selectedIndices).toEqual([1]);
    expect(result.selected).toEqual([links[1]]);
  });

  it("handles markdown-fenced JSON in AI response", async () => {
    const links: LinkCandidate[] = [
      { url: "https://ex.com/criteria", text: "Criteria", context: "Assessment." },
    ];

    mockGenerateContent.mockResolvedValue({
      usageMetadata: mockUsage,
      text: "```json\n{ \"relevant_indices\": [0] }\n```",
    });

    const result = await filterLinksForCriteria(links);
    expect(result.selectedIndices).toEqual([0]);
    expect(result.selected).toEqual([links[0]]);
  });
});
