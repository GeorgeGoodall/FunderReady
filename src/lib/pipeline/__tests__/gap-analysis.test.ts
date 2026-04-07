import { describe, it, expect } from "vitest";
import { buildGapAnalysisPrompt } from "../gap-analysis";
import type { AnswerAnalysis } from "../schemas";

const mockAnalysis: AnswerAnalysis = {
  question_id: "document_content",
  inline_comments: [],
  criteria_relevance: [
    { criterion_id: "c1", relevance: "directly_addresses" },
    { criterion_id: "c2", relevance: "not_relevant" },
  ],
  strengths: ["Clear description of community need"],
  weaknesses: ["No mention of budget"],
  answer_score: "Fair",
};

const criteria = [
  { id: "c1", criterion: "Community benefit" },
  { id: "c2", criterion: "Financial sustainability" },
];

describe("buildGapAnalysisPrompt", () => {
  it("returns systemPrompt and userPrompt strings", () => {
    const { systemPrompt, userPrompt } = buildGapAnalysisPrompt(
      mockAnalysis,
      criteria
    );
    expect(typeof systemPrompt).toBe("string");
    expect(typeof userPrompt).toBe("string");
    expect(systemPrompt.length).toBeGreaterThan(50);
    expect(userPrompt.length).toBeGreaterThan(50);
  });

  it("includes document instruction in systemPrompt", () => {
    const { systemPrompt } = buildGapAnalysisPrompt(mockAnalysis, criteria);
    expect(systemPrompt.toLowerCase()).toContain("document");
  });

  it("includes criteria in userPrompt", () => {
    const { userPrompt } = buildGapAnalysisPrompt(mockAnalysis, criteria);
    expect(userPrompt).toContain("Community benefit");
    expect(userPrompt).toContain("Financial sustainability");
  });

  it("mentions missing_criterion and gap finding types in systemPrompt", () => {
    const { systemPrompt } = buildGapAnalysisPrompt(mockAnalysis, criteria);
    expect(systemPrompt).toContain("missing_criterion");
    expect(systemPrompt).toContain("gap");
  });

  it("handles null analysis gracefully", () => {
    const { systemPrompt, userPrompt } = buildGapAnalysisPrompt(null, criteria);
    expect(typeof systemPrompt).toBe("string");
    expect(typeof userPrompt).toBe("string");
    expect(userPrompt).toContain("No analysis available");
  });
});
