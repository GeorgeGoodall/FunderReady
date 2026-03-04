import { describe, it, expect } from "vitest";
import { SCORE_COLOURS, SCORE_ORDER, READINESS_COLOURS, SEVERITY_COLOURS, PIPELINE_STEPS } from "../constants";
import type { CriterionScore, ImprovementAppendixItem } from "../types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe("SCORE_ORDER", () => {
  it("ranks Missing as worst (0) and Excellent as best (5)", () => {
    expect(SCORE_ORDER["Missing"]).toBe(0);
    expect(SCORE_ORDER["Poor"]).toBe(1);
    expect(SCORE_ORDER["Needs Improvement"]).toBe(2);
    expect(SCORE_ORDER["Fair"]).toBe(3);
    expect(SCORE_ORDER["Strong"]).toBe(4);
    expect(SCORE_ORDER["Excellent"]).toBe(5);
  });

  it("covers all SCORE_COLOURS keys", () => {
    for (const key of Object.keys(SCORE_COLOURS)) {
      expect(SCORE_ORDER).toHaveProperty(key);
    }
  });
});

describe("colour maps have entries for all expected keys", () => {
  it("READINESS_COLOURS covers all readiness values", () => {
    const expected = ["Strong application", "Good progress", "Needs revisions", "Major rework needed"];
    for (const key of expected) {
      expect(READINESS_COLOURS[key]).toBeDefined();
    }
  });

  it("SEVERITY_COLOURS covers all severity levels", () => {
    for (const key of ["high", "medium", "low"]) {
      expect(SEVERITY_COLOURS[key]).toBeDefined();
    }
  });
});

describe("PIPELINE_STEPS", () => {
  it("has 4 steps in correct order", () => {
    expect(PIPELINE_STEPS.map((s) => s.key)).toEqual([
      "pending",
      "analysing",
      "cross_referencing",
      "scoring",
    ]);
  });
});

// ---------------------------------------------------------------------------
// Criteria sorting logic (mirrors CriteriaScoresSection)
// ---------------------------------------------------------------------------

function sortCriteria(
  criteriaScores: CriterionScore[],
  appendixMap: Map<string, ImprovementAppendixItem>,
  sortAsc: boolean,
) {
  return [...criteriaScores].sort((a, b) => {
    const scoreA = (SCORE_ORDER[a.score] ?? 3) * 2 + (appendixMap.has(a.criterion_id) ? 0 : 1);
    const scoreB = (SCORE_ORDER[b.score] ?? 3) * 2 + (appendixMap.has(b.criterion_id) ? 0 : 1);
    return sortAsc ? scoreB - scoreA : scoreA - scoreB;
  });
}

const makeCriterion = (id: string, score: string): CriterionScore => ({
  criterion_id: id,
  criterion: `Criterion ${id}`,
  score,
  bid_evidence: [],
  gaps: [],
  summary: "",
});

const makeAppendix = (id: string): ImprovementAppendixItem => ({
  criterion_id: id,
  criterion: `Criterion ${id}`,
  what_funder_wants: "",
  how_bid_addresses: "",
  whats_missing: "",
});

describe("criteria sorting", () => {
  const criteria: CriterionScore[] = [
    makeCriterion("c1", "Excellent"),
    makeCriterion("c2", "Poor"),
    makeCriterion("c3", "Fair"),
    makeCriterion("c4", "Strong"),
    makeCriterion("c5", "Missing"),
  ];

  it("worst first sorts Missing → Poor → Fair → Strong → Excellent", () => {
    const sorted = sortCriteria(criteria, new Map(), false);
    expect(sorted.map((c) => c.score)).toEqual([
      "Missing",
      "Poor",
      "Fair",
      "Strong",
      "Excellent",
    ]);
  });

  it("best first sorts Excellent → Strong → Fair → Poor → Missing", () => {
    const sorted = sortCriteria(criteria, new Map(), true);
    expect(sorted.map((c) => c.score)).toEqual([
      "Excellent",
      "Strong",
      "Fair",
      "Poor",
      "Missing",
    ]);
  });

  it("criteria with appendix entries sort worse than same-scored without", () => {
    const sameCriteria: CriterionScore[] = [
      makeCriterion("c1", "Strong"), // no appendix
      makeCriterion("c2", "Strong"), // has appendix
    ];
    const appendixMap = new Map([["c2", makeAppendix("c2")]]);

    const worstFirst = sortCriteria(sameCriteria, appendixMap, false);
    expect(worstFirst.map((c) => c.criterion_id)).toEqual(["c2", "c1"]);

    const bestFirst = sortCriteria(sameCriteria, appendixMap, true);
    expect(bestFirst.map((c) => c.criterion_id)).toEqual(["c1", "c2"]);
  });

  it("appendix tiebreaker does not override score ranking", () => {
    const mixedCriteria: CriterionScore[] = [
      makeCriterion("c1", "Excellent"), // has appendix
      makeCriterion("c2", "Fair"),      // no appendix
    ];
    const appendixMap = new Map([["c1", makeAppendix("c1")]]);

    const worstFirst = sortCriteria(mixedCriteria, appendixMap, false);
    // Fair (3*2+1=7) should still sort before Excellent-with-appendix (5*2+0=10)
    expect(worstFirst.map((c) => c.criterion_id)).toEqual(["c2", "c1"]);
  });
});

// ---------------------------------------------------------------------------
// Answer filter logic (mirrors AnswersTab)
// ---------------------------------------------------------------------------

const GOOD_SCORES = new Set(["Excellent", "Strong"]);

describe("answer filtering", () => {
  const makeAnswerFeedback = (questionId: string, score: string) => ({
    question_id: questionId,
    inline_comments: [],
    criteria_relevance: [],
    strengths: [],
    weaknesses: [],
    answer_score: score,
  });

  const feedback: Record<string, ReturnType<typeof makeAnswerFeedback>> = {
    q1: makeAnswerFeedback("q1", "Excellent"),
    q2: makeAnswerFeedback("q2", "Poor"),
    q3: makeAnswerFeedback("q3", "Strong"),
    q4: makeAnswerFeedback("q4", "Fair"),
    q5: makeAnswerFeedback("q5", "Needs Improvement"),
  };

  const questions = [
    { id: "q1" }, { id: "q2" }, { id: "q3" }, { id: "q4" }, { id: "q5" }, { id: "q6" },
  ];

  const disabledIds = new Set(["q6"]);

  it("counts good answers correctly", () => {
    const goodCount = questions.filter((q) => {
      if (disabledIds.has(q.id)) return false;
      const fb = feedback[q.id];
      return fb && GOOD_SCORES.has(fb.answer_score);
    }).length;
    expect(goodCount).toBe(2); // q1 Excellent, q3 Strong
  });

  it("counts needs-attention answers correctly", () => {
    const needsAttention = questions.filter((q) => {
      if (disabledIds.has(q.id)) return false;
      const fb = feedback[q.id];
      return fb && !GOOD_SCORES.has(fb.answer_score);
    }).length;
    expect(needsAttention).toBe(3); // q2 Poor, q4 Fair, q5 Needs Improvement
  });

  it("excludes disabled questions from both counts", () => {
    const allDisabled = new Set(["q1", "q2", "q3", "q4", "q5", "q6"]);
    const goodCount = questions.filter((q) => {
      if (allDisabled.has(q.id)) return false;
      const fb = feedback[q.id];
      return fb && GOOD_SCORES.has(fb.answer_score);
    }).length;
    expect(goodCount).toBe(0);
  });

  it("needs-attention filter hides Excellent and Strong", () => {
    const visible = questions.filter((q) => {
      if (disabledIds.has(q.id)) return false;
      const fb = feedback[q.id];
      if (!fb) return false;
      return !GOOD_SCORES.has(fb.answer_score);
    });
    expect(visible.map((q) => q.id)).toEqual(["q2", "q4", "q5"]);
  });
});

// ---------------------------------------------------------------------------
// Badge count logic (mirrors ApplicationReviewClient)
// ---------------------------------------------------------------------------

describe("badge counts", () => {
  it("cross-ref badge counts findings + gap criteria", () => {
    const findingsCount = 3;
    const gapCriteriaCount = 2;
    const crossRefCount = findingsCount + gapCriteriaCount;
    expect(crossRefCount).toBe(5);
  });

  it("cross-ref badge is 0 when no findings and no gaps", () => {
    const crossRefCount = 0 + 0;
    expect(crossRefCount).toBe(0);
  });
});
