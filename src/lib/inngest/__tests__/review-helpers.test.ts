import { describe, it, expect } from "vitest";
import {
  trimPreviousReviewResults,
  computeAnswerChanges,
  annotateResolvedWeaknesses,
  extractReusableAnalyses,
} from "../application-review";
import type { AnswerAnalysis } from "@/lib/pipeline/schemas";
import type { CrossReference } from "@/lib/pipeline/schemas";

// ---------------------------------------------------------------------------
// trimPreviousReviewResults
// ---------------------------------------------------------------------------

describe("trimPreviousReviewResults", () => {
  it("extracts answer_feedback with scores and weaknesses", () => {
    const full = {
      answer_feedback: {
        q1: {
          answer_score: "Fair",
          weaknesses: ["No data", "Vague"],
          inline_comments: [{ target_text: "x", issue: "y" }],
          criteria_relevance: [{ criterion_id: "c1" }],
          strengths: ["Good structure"],
        },
        q2: {
          answer_score: "Strong",
          weaknesses: [],
        },
      },
      scoring: {
        overall_score: 62,
        submission_readiness: "Needs revisions",
        top_improvements: ["Add evidence", "Strengthen partnerships"],
        criteria_scores: [{ criterion_id: "c1", score: "Fair" }],
      },
    };

    const trimmed = trimPreviousReviewResults(full);

    // answer_feedback trimmed to only score + weaknesses
    expect(trimmed.answer_feedback).toEqual({
      q1: { answer_score: "Fair", weaknesses: ["No data", "Vague"] },
      q2: { answer_score: "Strong", weaknesses: [] },
    });

    // scoring trimmed to only overall_score, submission_readiness, top_improvements
    expect(trimmed.scoring).toEqual({
      overall_score: 62,
      submission_readiness: "Needs revisions",
      top_improvements: ["Add evidence", "Strengthen partnerships"],
    });
  });

  it("returns empty object when no answer_feedback or scoring", () => {
    const trimmed = trimPreviousReviewResults({});
    expect(trimmed.answer_feedback).toBeUndefined();
    expect(trimmed.scoring).toBeUndefined();
  });

  it("handles answer_feedback that is not an object", () => {
    const trimmed = trimPreviousReviewResults({ answer_feedback: "bad" });
    expect(trimmed.answer_feedback).toBeUndefined();
  });

  it("handles scoring that is not an object", () => {
    const trimmed = trimPreviousReviewResults({ scoring: 123 });
    expect(trimmed.scoring).toBeUndefined();
  });

  it("handles null scoring", () => {
    const trimmed = trimPreviousReviewResults({ scoring: null });
    expect(trimmed.scoring).toBeUndefined();
  });

  it("skips non-object entries in answer_feedback", () => {
    const trimmed = trimPreviousReviewResults({
      answer_feedback: {
        q1: "not-an-object",
        q2: null,
        q3: { answer_score: "Good" },
      },
    });
    expect(trimmed.answer_feedback).toEqual({
      q3: { answer_score: "Good", weaknesses: undefined },
    });
  });

  it("filters non-string weaknesses", () => {
    const trimmed = trimPreviousReviewResults({
      answer_feedback: {
        q1: { answer_score: "Fair", weaknesses: ["valid", 123, null, "also valid"] },
      },
    });
    expect(trimmed.answer_feedback!.q1.weaknesses).toEqual(["valid", "also valid"]);
  });

  it("filters non-string top_improvements", () => {
    const trimmed = trimPreviousReviewResults({
      scoring: {
        overall_score: 50,
        top_improvements: ["valid", 42, null, "also valid"],
      },
    });
    expect(trimmed.scoring!.top_improvements).toEqual(["valid", "also valid"]);
  });

  it("sets answer_score to undefined when not a string", () => {
    const trimmed = trimPreviousReviewResults({
      answer_feedback: { q1: { answer_score: 42 } },
    });
    expect(trimmed.answer_feedback!.q1.answer_score).toBeUndefined();
  });

  it("sets overall_score to undefined when not a number", () => {
    const trimmed = trimPreviousReviewResults({
      scoring: { overall_score: "high" },
    });
    expect(trimmed.scoring!.overall_score).toBeUndefined();
  });

  it("sets submission_readiness to undefined when not a string", () => {
    const trimmed = trimPreviousReviewResults({
      scoring: { overall_score: 50, submission_readiness: 123 },
    });
    expect(trimmed.scoring!.submission_readiness).toBeUndefined();
  });

  it("handles weaknesses being non-array", () => {
    const trimmed = trimPreviousReviewResults({
      answer_feedback: { q1: { answer_score: "Fair", weaknesses: "not-array" } },
    });
    expect(trimmed.answer_feedback!.q1.weaknesses).toBeUndefined();
  });

  it("handles overall_score of 0 (falsy but valid)", () => {
    const trimmed = trimPreviousReviewResults({
      scoring: { overall_score: 0 },
    });
    expect(trimmed.scoring!.overall_score).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// computeAnswerChanges
// ---------------------------------------------------------------------------

describe("computeAnswerChanges", () => {
  it("marks answers as changed when text differs from last_reviewed_text", () => {
    const answers = [
      { question_id: "q1", answer_text: "new text", last_reviewed_text: "old text" },
      { question_id: "q2", answer_text: "same text", last_reviewed_text: "same text" },
    ];
    const changes = computeAnswerChanges(answers);
    expect(changes.q1).toBe(true);
    expect(changes.q2).toBe(false);
  });

  it("marks answers with null last_reviewed_text as not changed", () => {
    const changes = computeAnswerChanges([
      { question_id: "q1", answer_text: "text", last_reviewed_text: null },
    ]);
    expect(changes.q1).toBe(false);
  });

  it("marks answers with undefined last_reviewed_text as not changed", () => {
    const changes = computeAnswerChanges([
      { question_id: "q1", answer_text: "text" },
    ]);
    expect(changes.q1).toBe(false);
  });

  it("returns empty map for empty answers array", () => {
    expect(computeAnswerChanges([])).toEqual({});
  });

  it("handles multiple answers correctly", () => {
    const answers = [
      { question_id: "q1", answer_text: "a", last_reviewed_text: "a" },
      { question_id: "q2", answer_text: "b", last_reviewed_text: "c" },
      { question_id: "q3", answer_text: "d", last_reviewed_text: null },
    ];
    const changes = computeAnswerChanges(answers);
    expect(changes).toEqual({ q1: false, q2: true, q3: false });
  });
});

// ---------------------------------------------------------------------------
// annotateResolvedWeaknesses
// ---------------------------------------------------------------------------

function makeAnalysis(overrides: Partial<AnswerAnalysis> = {}): AnswerAnalysis {
  return {
    question_id: "q1",
    inline_comments: [],
    criteria_relevance: [],
    strengths: [],
    weaknesses: [],
    answer_score: "Fair",
    ...overrides,
  };
}

function makeCrossRef(findings: CrossReference["findings"] = []): CrossReference {
  return {
    findings,
    overall_coherence: "adequate",
    summary: "Test",
  };
}

describe("annotateResolvedWeaknesses", () => {
  it("annotates a weakness with exact match", () => {
    const analyses = [
      makeAnalysis({
        question_id: "q1",
        weaknesses: ["No budget detail", "Vague partner references"],
      }),
    ];
    const crossRef = makeCrossRef([
      {
        type: "resolved_weakness",
        description: "Budget detail is in q17",
        sections_involved: ["q1", "q17"],
        severity: "low",
        confidence: "high",
        source_question: "q1",
        original_weakness: "No budget detail",
        resolved_by: "q17",
      },
    ]);

    const count = annotateResolvedWeaknesses(analyses, crossRef);

    expect(count).toBe(1);
    expect(analyses[0].weaknesses[0]).toBe(
      "No budget detail (void — addressed in q17)"
    );
    // Second weakness should be untouched
    expect(analyses[0].weaknesses[1]).toBe("Vague partner references");
  });

  it("annotates via substring match when original_weakness is contained in weakness", () => {
    const analyses = [
      makeAnalysis({
        question_id: "q1",
        weaknesses: ["No budget detail provided in this answer"],
      }),
    ];
    const crossRef = makeCrossRef([
      {
        type: "resolved_weakness",
        description: "Budget detail is in q17",
        sections_involved: ["q1", "q17"],
        severity: "low",
        confidence: "high",
        source_question: "q1",
        original_weakness: "no budget detail",
        resolved_by: "q17",
      },
    ]);

    const count = annotateResolvedWeaknesses(analyses, crossRef);

    expect(count).toBe(1);
    expect(analyses[0].weaknesses[0]).toContain("(void — addressed in q17)");
  });

  it("annotates via substring match when weakness is contained in original_weakness", () => {
    const analyses = [
      makeAnalysis({
        question_id: "q1",
        weaknesses: ["No budget detail"],
      }),
    ];
    const crossRef = makeCrossRef([
      {
        type: "resolved_weakness",
        description: "Budget detail is in q17",
        sections_involved: ["q1", "q17"],
        severity: "low",
        confidence: "high",
        source_question: "q1",
        original_weakness: "No budget detail provided in this answer, but it is covered in q17",
        resolved_by: "q17",
      },
    ]);

    const count = annotateResolvedWeaknesses(analyses, crossRef);

    expect(count).toBe(1);
    expect(analyses[0].weaknesses[0]).toContain("(void — addressed in q17)");
  });

  it("returns 0 when no resolved_weakness findings", () => {
    const analyses = [
      makeAnalysis({
        question_id: "q1",
        weaknesses: ["Some weakness"],
      }),
    ];
    const crossRef = makeCrossRef([
      {
        type: "gap",
        description: "Something missing",
        sections_involved: ["q1"],
        severity: "medium",
        confidence: "medium",
      },
    ]);

    const count = annotateResolvedWeaknesses(analyses, crossRef);

    expect(count).toBe(0);
    expect(analyses[0].weaknesses[0]).toBe("Some weakness");
  });

  it("returns 0 when findings array is empty", () => {
    const analyses = [
      makeAnalysis({ question_id: "q1", weaknesses: ["A weakness"] }),
    ];
    const count = annotateResolvedWeaknesses(analyses, makeCrossRef([]));
    expect(count).toBe(0);
  });

  it("skips findings with missing source_question", () => {
    const analyses = [
      makeAnalysis({ question_id: "q1", weaknesses: ["A weakness"] }),
    ];
    const crossRef = makeCrossRef([
      {
        type: "resolved_weakness",
        description: "Something",
        sections_involved: ["q1"],
        severity: "low",
        confidence: "high",
        original_weakness: "A weakness",
        resolved_by: "q2",
        // source_question is missing
      },
    ]);

    const count = annotateResolvedWeaknesses(analyses, crossRef);
    expect(count).toBe(0);
  });

  it("skips findings with missing original_weakness", () => {
    const analyses = [
      makeAnalysis({ question_id: "q1", weaknesses: ["A weakness"] }),
    ];
    const crossRef = makeCrossRef([
      {
        type: "resolved_weakness",
        description: "Something",
        sections_involved: ["q1"],
        severity: "low",
        confidence: "high",
        source_question: "q1",
        resolved_by: "q2",
        // original_weakness is missing
      },
    ]);

    const count = annotateResolvedWeaknesses(analyses, crossRef);
    expect(count).toBe(0);
  });

  it("skips findings with missing resolved_by", () => {
    const analyses = [
      makeAnalysis({ question_id: "q1", weaknesses: ["A weakness"] }),
    ];
    const crossRef = makeCrossRef([
      {
        type: "resolved_weakness",
        description: "Something",
        sections_involved: ["q1"],
        severity: "low",
        confidence: "high",
        source_question: "q1",
        original_weakness: "A weakness",
        // resolved_by is missing
      },
    ]);

    const count = annotateResolvedWeaknesses(analyses, crossRef);
    expect(count).toBe(0);
  });

  it("skips when source_question does not match any analysis", () => {
    const analyses = [
      makeAnalysis({ question_id: "q1", weaknesses: ["A weakness"] }),
    ];
    const crossRef = makeCrossRef([
      {
        type: "resolved_weakness",
        description: "Something",
        sections_involved: ["q99"],
        severity: "low",
        confidence: "high",
        source_question: "q99",
        original_weakness: "A weakness",
        resolved_by: "q2",
      },
    ]);

    const count = annotateResolvedWeaknesses(analyses, crossRef);
    expect(count).toBe(0);
  });

  it("does not double-annotate an already-annotated weakness", () => {
    const analyses = [
      makeAnalysis({
        question_id: "q1",
        weaknesses: ["No budget detail (void — addressed in q17)"],
      }),
    ];
    const crossRef = makeCrossRef([
      {
        type: "resolved_weakness",
        description: "Budget detail is in q17",
        sections_involved: ["q1", "q17"],
        severity: "low",
        confidence: "high",
        source_question: "q1",
        original_weakness: "No budget detail",
        resolved_by: "q17",
      },
    ]);

    const count = annotateResolvedWeaknesses(analyses, crossRef);

    expect(count).toBe(0);
    expect(analyses[0].weaknesses[0]).toBe(
      "No budget detail (void — addressed in q17)"
    );
  });

  it("handles multiple resolved weaknesses across different answers", () => {
    const analyses = [
      makeAnalysis({
        question_id: "q1",
        weaknesses: ["No budget detail", "Missing evaluation plan"],
      }),
      makeAnalysis({
        question_id: "q2",
        weaknesses: ["No staff ratios"],
      }),
    ];
    const crossRef = makeCrossRef([
      {
        type: "resolved_weakness",
        description: "Budget in q17",
        sections_involved: ["q1", "q17"],
        severity: "low",
        confidence: "high",
        source_question: "q1",
        original_weakness: "No budget detail",
        resolved_by: "q17",
      },
      {
        type: "resolved_weakness",
        description: "Eval plan in q21",
        sections_involved: ["q1", "q21"],
        severity: "low",
        confidence: "high",
        source_question: "q1",
        original_weakness: "Missing evaluation plan",
        resolved_by: "q21",
      },
      {
        type: "resolved_weakness",
        description: "Staff ratios in q19",
        sections_involved: ["q2", "q19"],
        severity: "low",
        confidence: "high",
        source_question: "q2",
        original_weakness: "No staff ratios",
        resolved_by: "q19",
      },
    ]);

    const count = annotateResolvedWeaknesses(analyses, crossRef);

    expect(count).toBe(3);
    expect(analyses[0].weaknesses[0]).toContain("(void — addressed in q17)");
    expect(analyses[0].weaknesses[1]).toContain("(void — addressed in q21)");
    expect(analyses[1].weaknesses[0]).toContain("(void — addressed in q19)");
  });

  it("skips non-matching weakness text", () => {
    const analyses = [
      makeAnalysis({
        question_id: "q1",
        weaknesses: ["Completely different weakness text"],
      }),
    ];
    const crossRef = makeCrossRef([
      {
        type: "resolved_weakness",
        description: "Something",
        sections_involved: ["q1", "q2"],
        severity: "low",
        confidence: "high",
        source_question: "q1",
        original_weakness: "No budget detail",
        resolved_by: "q2",
      },
    ]);

    const count = annotateResolvedWeaknesses(analyses, crossRef);
    expect(count).toBe(0);
    expect(analyses[0].weaknesses[0]).toBe("Completely different weakness text");
  });
});

// ---------------------------------------------------------------------------
// extractReusableAnalyses
// ---------------------------------------------------------------------------

describe("extractReusableAnalyses", () => {
  const validAnalysis: AnswerAnalysis = {
    question_id: "q1",
    inline_comments: [],
    criteria_relevance: [{ criterion_id: "c1", relevance: "directly_addresses" }],
    strengths: ["Good"],
    weaknesses: ["Bad"],
    answer_score: "Strong",
  };

  it("returns analyses for unchanged answers with matching criteria set", () => {
    const previousResults = {
      answer_feedback: { q1: validAnalysis, q2: { ...validAnalysis, question_id: "q2" } },
    };
    const answerChanges = { q1: false, q2: true };
    const result = extractReusableAnalyses(previousResults, answerChanges, true);

    expect(result.q1).toBeDefined();
    expect(result.q1!.question_id).toBe("q1");
    expect(result.q2).toBeUndefined();
  });

  it("returns empty when criteria set does not match", () => {
    const previousResults = {
      answer_feedback: { q1: validAnalysis },
    };
    const answerChanges = { q1: false };
    const result = extractReusableAnalyses(previousResults, answerChanges, false);

    expect(Object.keys(result)).toHaveLength(0);
  });

  it("returns empty when no previous results", () => {
    const result = extractReusableAnalyses(null, { q1: false }, true);
    expect(Object.keys(result)).toHaveLength(0);
  });

  it("returns empty when answer_feedback is missing", () => {
    const result = extractReusableAnalyses({}, { q1: false }, true);
    expect(Object.keys(result)).toHaveLength(0);
  });

  it("skips answers not in answerChanges", () => {
    const previousResults = {
      answer_feedback: { q1: validAnalysis },
    };
    const result = extractReusableAnalyses(previousResults, {}, true);
    expect(result.q1).toBeUndefined();
  });

  it("skips answers where answerChanges entry is true (changed)", () => {
    const previousResults = {
      answer_feedback: { q1: validAnalysis },
    };
    const result = extractReusableAnalyses(previousResults, { q1: true }, true);
    expect(result.q1).toBeUndefined();
  });

  it("skips analyses that fail schema validation", () => {
    const previousResults = {
      answer_feedback: {
        q1: { question_id: "q1", bad_field: true }, // missing required fields
      },
    };
    const answerChanges = { q1: false };
    const result = extractReusableAnalyses(previousResults, answerChanges, true);
    expect(result.q1).toBeUndefined();
  });

  it("handles first-review scenario (null previousResults)", () => {
    const result = extractReusableAnalyses(null, {}, true);
    expect(result).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// incremental review integration
// ---------------------------------------------------------------------------

describe("incremental review integration", () => {
  const makeValidAnalysis = (qId: string): AnswerAnalysis => ({
    question_id: qId,
    inline_comments: [],
    criteria_relevance: [{ criterion_id: "c1", relevance: "directly_addresses" }],
    strengths: ["Good"],
    weaknesses: [],
    answer_score: "Strong",
  });

  it("reuses 14 of 15 analyses when only 1 answer changed", () => {
    const previousResults: Record<string, unknown> = {
      answer_feedback: Object.fromEntries(
        Array.from({ length: 15 }, (_, i) => [`q${i + 1}`, makeValidAnalysis(`q${i + 1}`)])
      ),
    };
    // Only q3 changed
    const answerChanges: Record<string, boolean> = Object.fromEntries(
      Array.from({ length: 15 }, (_, i) => [`q${i + 1}`, i === 2])
    );

    const reusable = extractReusableAnalyses(previousResults, answerChanges, true);

    expect(Object.keys(reusable)).toHaveLength(14);
    expect(reusable.q3).toBeUndefined(); // changed answer not reused
    expect(reusable.q1).toBeDefined();
    expect(reusable.q15).toBeDefined();
  });

  it("reuses nothing when criteria set changed", () => {
    const previousResults: Record<string, unknown> = {
      answer_feedback: Object.fromEntries(
        Array.from({ length: 15 }, (_, i) => [`q${i + 1}`, makeValidAnalysis(`q${i + 1}`)])
      ),
    };
    const answerChanges: Record<string, boolean> = Object.fromEntries(
      Array.from({ length: 15 }, (_, i) => [`q${i + 1}`, false])
    );

    const reusable = extractReusableAnalyses(previousResults, answerChanges, false);

    expect(Object.keys(reusable)).toHaveLength(0);
  });

  it("reuses nothing on first review", () => {
    const reusable = extractReusableAnalyses(null, {}, true);
    expect(Object.keys(reusable)).toHaveLength(0);
  });

  it("handles mix of valid and invalid previous analyses", () => {
    const previousResults: Record<string, unknown> = {
      answer_feedback: {
        q1: makeValidAnalysis("q1"),
        q2: { question_id: "q2", bad: true }, // invalid schema
        q3: makeValidAnalysis("q3"),
      },
    };
    const answerChanges = { q1: false, q2: false, q3: false };

    const reusable = extractReusableAnalyses(previousResults, answerChanges, true);

    expect(Object.keys(reusable)).toHaveLength(2);
    expect(reusable.q1).toBeDefined();
    expect(reusable.q2).toBeUndefined(); // failed validation
    expect(reusable.q3).toBeDefined();
  });
});
