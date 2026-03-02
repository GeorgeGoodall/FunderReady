import { describe, it, expect } from "vitest";
import {
  trimPreviousReviewResults,
  computeAnswerChanges,
} from "../application-review";

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
