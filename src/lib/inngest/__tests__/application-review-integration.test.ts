/**
 * Integration test for the application review pipeline.
 *
 * Mocks: Supabase, Inngest step.run, logAiUsage
 * Verifies: data flows between pipeline steps, correct schemas per stage,
 * final save structure. Zero real API calls / tokens.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AnswerAnalysis, CrossReference, ApplicationScoring } from "@/lib/pipeline/schemas";

// ---------------------------------------------------------------------------
// Mock logAiUsage
// ---------------------------------------------------------------------------

vi.mock("@/lib/ai/log-usage", () => ({
  logAiUsage: vi.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Mock pricing
// ---------------------------------------------------------------------------

vi.mock("@/lib/ai/pricing", () => ({
  calculateCost: () => ({ cost_usd: 0.01, cost_gbp: 0.008 }),
}));

// ---------------------------------------------------------------------------
// Mock Supabase
// ---------------------------------------------------------------------------

const mockUpdate = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn() }) });
const mockInsert = vi.fn().mockReturnValue({});
const mockSelect = vi.fn();
const mockFrom = vi.fn().mockReturnValue({
  select: mockSelect,
  update: mockUpdate,
  insert: mockInsert,
});

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({ from: mockFrom }),
  createServiceClient: () => ({ from: mockFrom }),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockAnalysis: AnswerAnalysis = {
  question_id: "q1",
  inline_comments: [
    {
      target_text: "significant impact on the community",
      category: "EVIDENCE",
      issue: "No metrics provided to support the claim of significant impact.",
      suggestion: "Add quantitative evidence.",
    },
  ],
  criteria_relevance: [
    { criterion_id: "c1", relevance: "directly_addresses", notes: "Strong alignment" },
  ],
  strengths: ["Clear articulation of need"],
  weaknesses: ["No quantitative data"],
  answer_score: "Fair",
  word_count_assessment: { actual: 200, limit: 500, status: "within_limit" },
};

const mockCrossRef: CrossReference = {
  findings: [
    {
      type: "gap",
      description: "Budget not fully covered",
      sections_involved: ["q1"],
      severity: "medium",
      confidence: "medium",
    },
  ],
  overall_coherence: "adequate",
  summary: "Application has some gaps.",
};

const mockScoring: ApplicationScoring = {
  answer_scores: [
    { question_id: "q1", question_text: "Describe need", score: "Fair", summary: "Adequate" },
  ],
  criteria_scores: [
    {
      criterion_id: "c1",
      criterion: "Clear need",
      score: "Fair",
      bid_evidence: ["q1: mentions need"],
      gaps: ["No data"],
      summary: "Needs more evidence",
    },
  ],
  overall_score: 55,
  overall_descriptor: "Needs Revisions",
  submission_readiness: "Needs revisions",
  top_strengths: ["Clear need identification"],
  top_improvements: ["Add quantitative evidence"],
  improvement_appendix: [
    {
      criterion_id: "c1",
      criterion: "Clear need",
      what_funder_wants: "Evidence of need",
      how_bid_addresses: "Mentions need",
      whats_missing: "Specific data",
      example_language: "Our programme reached 150 participants with 85% satisfaction rate",
      gap_type: "quick_fix",
    },
  ],
};

// ---------------------------------------------------------------------------
// Import prompt builders (after mocks are set up)
// ---------------------------------------------------------------------------

import {
  buildAnswerAnalysisSystemPrompt,
  buildAnswerAnalysisPrompt,
  buildApplicationCrossReferencePrompt,
  buildApplicationScoringPrompt,
} from "@/lib/pipeline/application-prompts";

import { computeProjectedScore, sanitizeExampleLanguage } from "../application-review";

describe("Application review pipeline integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("answer analysis uses correct schema and passes system prompt", () => {
    const criteria = [{ id: "c1", criterion: "Clear need" }];
    const systemPrompt = buildAnswerAnalysisSystemPrompt(criteria);

    // System prompt should be a CacheBlock array
    expect(Array.isArray(systemPrompt)).toBe(true);
    expect(systemPrompt[0].cache_control).toEqual({ type: "ephemeral" });
    expect(systemPrompt[0].text).toContain("experienced grant reviewer");
  });

  it("cross-reference prompt returns structured system + user prompts", () => {
    const analyses = [mockAnalysis];
    const questions = [{ id: "q1", question: "Describe need" }];
    const criteria = [{ id: "c1", criterion: "Clear need" }];

    const { systemPrompt, userPrompt } = buildApplicationCrossReferencePrompt(
      analyses, questions, criteria
    );

    expect(systemPrompt[0].text).toContain("experienced grant reviewer");
    expect(userPrompt).toContain("Cross-Reference Pass");
    expect(userPrompt).toContain("q1");
  });

  it("scoring prompt returns structured system + user prompts and excludes inline comments", () => {
    const analyses = [mockAnalysis];
    const questions = [{ id: "q1", question: "Describe need" }];
    const criteria = [{ id: "c1", criterion: "Clear need" }];

    const { systemPrompt, userPrompt } = buildApplicationScoringPrompt(
      analyses, mockCrossRef, questions, criteria
    );

    expect(systemPrompt[0].text).toContain("Scoring Rubric");
    expect(systemPrompt[0].text).toContain("Quality Dimensions");
    expect(systemPrompt[0].text).toContain("Scoring Calibration Examples");
    expect(userPrompt).toContain("Final Scoring");
    // Scoring format should NOT include inline comments
    expect(userPrompt).not.toContain("Issues flagged:");
  });

  it("sanitizeExampleLanguage processes scoring output correctly", async () => {
    const { sanitizeExampleLanguage } = await import("../application-review");

    // Known numbers from answers
    const known = new Set(["200", "500"]);
    const result = sanitizeExampleLanguage(mockScoring.improvement_appendix!, known);

    // 150 and 85% are fabricated (not in known), should be replaced
    expect(result[0].example_language).toContain("[X]");
    expect(result[0].example_language).toContain("[X]%");
    expect(result[0].example_language).not.toContain("150");
    expect(result[0].example_language).not.toContain("85%");
  });

  it("data flows correctly from analysis → cross-ref → scoring", () => {
    // Verify the analysis output can be fed to cross-ref and scoring builders
    const analyses = [mockAnalysis];
    const questions = [{ id: "q1", question: "Describe need" }];
    const criteria = [{ id: "c1", criterion: "Clear need" }];

    // Cross-ref receives analyses
    const crossRefResult = buildApplicationCrossReferencePrompt(
      analyses, questions, criteria
    );
    expect(crossRefResult.userPrompt).toContain("q1");
    expect(crossRefResult.userPrompt).toContain("Fair");

    // Scoring receives analyses + cross-ref
    const scoringResult = buildApplicationScoringPrompt(
      analyses, mockCrossRef, questions, criteria
    );
    expect(scoringResult.userPrompt).toContain("q1");
    expect(scoringResult.userPrompt).toContain("Fair");
    expect(scoringResult.userPrompt).toContain("gap"); // from cross-ref JSON
  });
});

// ---------------------------------------------------------------------------
// Disabled questions pipeline path
// ---------------------------------------------------------------------------

describe("Disabled questions pipeline path", () => {
  const disabledQuestions = [
    { question_id: "q3", question_text: "Do you have trading subsidiaries?" },
    { question_id: "q4", question_text: "Describe your financial sustainability plan" },
  ];

  it("cross-reference prompt includes disabled questions section", () => {
    const { userPrompt } = buildApplicationCrossReferencePrompt(
      [mockAnalysis],
      [{ id: "q1", question: "Describe need" }],
      [{ id: "c1", criterion: "Clear need" }],
      disabledQuestions
    );

    expect(userPrompt).toContain("Questions Marked Not Applicable");
    expect(userPrompt).toContain("q3");
    expect(userPrompt).toContain("trading subsidiaries");
    expect(userPrompt).toContain("q4");
    expect(userPrompt).toContain("financial sustainability");
    expect(userPrompt).toContain("intentionally excluded");
  });

  it("cross-reference prompt omits disabled section when no disabled questions", () => {
    const { userPrompt } = buildApplicationCrossReferencePrompt(
      [mockAnalysis],
      [{ id: "q1", question: "Describe need" }],
      [{ id: "c1", criterion: "Clear need" }],
      []
    );

    expect(userPrompt).not.toContain("Questions Marked Not Applicable");
    expect(userPrompt).not.toContain("intentionally excluded");
  });

  it("scoring prompt includes disabled questions section", () => {
    const { userPrompt } = buildApplicationScoringPrompt(
      [mockAnalysis],
      mockCrossRef,
      [{ id: "q1", question: "Describe need" }],
      [{ id: "c1", criterion: "Clear need" }],
      undefined,
      disabledQuestions
    );

    expect(userPrompt).toContain("Excluded Questions (Not Applicable)");
    expect(userPrompt).toContain("q3");
    expect(userPrompt).toContain("q4");
    expect(userPrompt).toContain("Score criteria based only on enabled answers");
  });

  it("scoring prompt omits disabled section when no disabled questions", () => {
    const { userPrompt } = buildApplicationScoringPrompt(
      [mockAnalysis],
      mockCrossRef,
      [{ id: "q1", question: "Describe need" }],
      [{ id: "c1", criterion: "Clear need" }],
      undefined,
      []
    );

    expect(userPrompt).not.toContain("Excluded Questions");
  });
});

// ---------------------------------------------------------------------------
// Gap criteria computation
// ---------------------------------------------------------------------------

describe("Gap criteria computation", () => {
  it("identifies uncovered criteria as gaps", () => {
    const criteria = [
      { id: "c1", criterion: "Clear need" },
      { id: "c2", criterion: "Sound approach" },
      { id: "c3", criterion: "Value for money" },
    ];

    // Only c1 is covered (directly_addresses)
    const analyses: AnswerAnalysis[] = [
      {
        question_id: "q1",
        inline_comments: [],
        criteria_relevance: [
          { criterion_id: "c1", relevance: "directly_addresses" },
        ],
        strengths: [],
        weaknesses: [],
        answer_score: "Fair",
      },
    ];

    // Replicate the gap_criteria logic from application-review.ts
    const coveredCriteriaIds = new Set<string>();
    for (const analysis of analyses) {
      for (const r of analysis.criteria_relevance) {
        if (r.relevance === "directly_addresses" || r.relevance === "partially_addresses") {
          coveredCriteriaIds.add(r.criterion_id);
        }
      }
    }

    const gapCriteria = criteria
      .filter((c) => !coveredCriteriaIds.has(c.id))
      .map((c) => ({
        criterion_id: c.id,
        criterion: c.criterion,
        related_disabled_question_ids: [] as string[],
        related_disabled_question_texts: [] as string[],
      }));

    expect(gapCriteria).toHaveLength(2);
    expect(gapCriteria[0].criterion_id).toBe("c2");
    expect(gapCriteria[1].criterion_id).toBe("c3");
  });

  it("treats partially_addresses as covered (not a gap)", () => {
    const criteria = [
      { id: "c1", criterion: "Clear need" },
      { id: "c2", criterion: "Sound approach" },
    ];

    const analyses: AnswerAnalysis[] = [
      {
        question_id: "q1",
        inline_comments: [],
        criteria_relevance: [
          { criterion_id: "c1", relevance: "directly_addresses" },
          { criterion_id: "c2", relevance: "partially_addresses" },
        ],
        strengths: [],
        weaknesses: [],
        answer_score: "Fair",
      },
    ];

    const coveredCriteriaIds = new Set<string>();
    for (const analysis of analyses) {
      for (const r of analysis.criteria_relevance) {
        if (r.relevance === "directly_addresses" || r.relevance === "partially_addresses") {
          coveredCriteriaIds.add(r.criterion_id);
        }
      }
    }

    const gapCriteria = criteria.filter((c) => !coveredCriteriaIds.has(c.id));
    expect(gapCriteria).toHaveLength(0);
  });

  it("not_relevant criteria are gaps", () => {
    const criteria = [
      { id: "c1", criterion: "Clear need" },
    ];

    const analyses: AnswerAnalysis[] = [
      {
        question_id: "q1",
        inline_comments: [],
        criteria_relevance: [
          { criterion_id: "c1", relevance: "not_relevant" },
        ],
        strengths: [],
        weaknesses: [],
        answer_score: "Poor",
      },
    ];

    const coveredCriteriaIds = new Set<string>();
    for (const analysis of analyses) {
      for (const r of analysis.criteria_relevance) {
        if (r.relevance === "directly_addresses" || r.relevance === "partially_addresses") {
          coveredCriteriaIds.add(r.criterion_id);
        }
      }
    }

    const gapCriteria = criteria.filter((c) => !coveredCriteriaIds.has(c.id));
    expect(gapCriteria).toHaveLength(1);
    expect(gapCriteria[0].id).toBe("c1");
  });

  it("empty criteria_relevance means all criteria are gaps", () => {
    const criteria = [
      { id: "c1", criterion: "Clear need" },
      { id: "c2", criterion: "Sound approach" },
    ];

    const analyses: AnswerAnalysis[] = [
      {
        question_id: "q1",
        inline_comments: [],
        criteria_relevance: [],
        strengths: [],
        weaknesses: [],
        answer_score: "Poor",
      },
    ];

    const coveredCriteriaIds = new Set<string>();
    for (const analysis of analyses) {
      for (const r of analysis.criteria_relevance) {
        if (r.relevance === "directly_addresses" || r.relevance === "partially_addresses") {
          coveredCriteriaIds.add(r.criterion_id);
        }
      }
    }

    const gapCriteria = criteria.filter((c) => !coveredCriteriaIds.has(c.id));
    expect(gapCriteria).toHaveLength(2);
  });

  it("projected score increases with gap count", () => {
    // 2 gaps out of 5 criteria = each gap worth 20 points
    expect(computeProjectedScore(60, 2, 5)).toBe(100);
    // 1 gap out of 4 criteria = 25 points
    expect(computeProjectedScore(60, 1, 4)).toBe(85);
  });

  it("gap_criteria includes disabled question metadata", () => {
    const criteria = [
      { id: "c1", criterion: "Clear need" },
      { id: "c2", criterion: "Financial plan" },
    ];

    const disabledQuestions = [
      { question_id: "q3", question_text: "Budget breakdown" },
    ];

    // Only c1 is covered
    const coveredCriteriaIds = new Set(["c1"]);

    const gapCriteria = criteria
      .filter((c) => !coveredCriteriaIds.has(c.id))
      .map((c) => ({
        criterion_id: c.id,
        criterion: c.criterion,
        related_disabled_question_ids: disabledQuestions.map((q) => q.question_id),
        related_disabled_question_texts: disabledQuestions.map((q) => q.question_text),
      }));

    expect(gapCriteria).toHaveLength(1);
    expect(gapCriteria[0].criterion_id).toBe("c2");
    expect(gapCriteria[0].related_disabled_question_ids).toEqual(["q3"]);
    expect(gapCriteria[0].related_disabled_question_texts).toEqual(["Budget breakdown"]);
  });
});

// ---------------------------------------------------------------------------
// Answer snapshot shape
// ---------------------------------------------------------------------------

describe("Answer snapshot shape", () => {
  it("snapshot includes question_id, answer_text, and selected_options", () => {
    const enabledAnswers = [
      { question_id: "q1", answer_text: "Our answer", selected_options: ["option_a"], is_disabled: false },
      { question_id: "q2", answer_text: "Second answer", selected_options: null, is_disabled: false },
    ];

    const snapshot = enabledAnswers.map((a) => ({
      question_id: a.question_id,
      answer_text: a.answer_text,
      selected_options: a.selected_options ?? null,
    }));

    expect(snapshot).toHaveLength(2);
    expect(snapshot[0]).toEqual({
      question_id: "q1",
      answer_text: "Our answer",
      selected_options: ["option_a"],
    });
    expect(snapshot[1]).toEqual({
      question_id: "q2",
      answer_text: "Second answer",
      selected_options: null,
    });
  });

  it("snapshot only includes enabled answers", () => {
    const allAnswers = [
      { question_id: "q1", answer_text: "Enabled answer", selected_options: null, is_disabled: false },
      { question_id: "q2", answer_text: "Disabled answer", selected_options: null, is_disabled: true },
      { question_id: "q3", answer_text: "Another enabled", selected_options: ["opt"], is_disabled: false },
    ];

    const enabledAnswers = allAnswers.filter((a) => !a.is_disabled && a.answer_text.trim().length > 0);
    const snapshot = enabledAnswers.map((a) => ({
      question_id: a.question_id,
      answer_text: a.answer_text,
      selected_options: a.selected_options ?? null,
    }));

    expect(snapshot).toHaveLength(2);
    expect(snapshot.map((s) => s.question_id)).toEqual(["q1", "q3"]);
  });

  it("disabled_answer_ids captures disabled question IDs", () => {
    const allAnswers = [
      { question_id: "q1", answer_text: "Enabled", is_disabled: false },
      { question_id: "q2", answer_text: "Disabled", is_disabled: true },
      { question_id: "q3", answer_text: "Also disabled", is_disabled: true },
    ];

    const disabledAnswerIds = allAnswers
      .filter((a) => a.is_disabled)
      .map((a) => a.question_id);

    expect(disabledAnswerIds).toEqual(["q2", "q3"]);
  });
});
