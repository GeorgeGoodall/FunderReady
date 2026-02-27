import { describe, it, expect } from "vitest";
import {
  CrossReferenceSchema,
  AnswerInlineCommentSchema,
  AnswerAnalysisSchema,
  AnswerScoreSchema,
  ApplicationScoringSchema,
} from "../schemas";

describe("CrossReferenceSchema", () => {
  it("validates cross-reference findings", () => {
    const data = {
      findings: [
        {
          type: "contradiction" as const,
          description: "Budget in section 3 states £50k but section 5 mentions £45k",
          sections_involved: ["s3", "s5"],
          criteria_involved: ["c4"],
          severity: "high" as const,
          suggestion: "Align budget figures across all sections",
        },
      ],
      overall_coherence: "adequate" as const,
      summary: "The bid has reasonable coherence with some minor inconsistencies.",
    };
    expect(CrossReferenceSchema.parse(data)).toEqual(data);
  });

  it("validates empty findings", () => {
    const data = {
      findings: [],
      overall_coherence: "strong" as const,
      summary: "No cross-reference issues found.",
    };
    expect(CrossReferenceSchema.parse(data)).toEqual(data);
  });
});

describe("AnswerInlineCommentSchema", () => {
  it("validates a well-formed answer comment (no paragraph_id)", () => {
    const data = {
      target_text: "significant community impact",
      category: "EVIDENCE",
      issue: "This claim lacks specific metrics or data to support it.",
      suggestion: "Add quantitative evidence, e.g., 'Our 2023 pilot reached 340 young people.'",
    };
    expect(AnswerInlineCommentSchema.parse(data)).toEqual(data);
  });

  it("rejects empty target_text", () => {
    expect(() =>
      AnswerInlineCommentSchema.parse({
        target_text: "",
        category: "CLARITY",
        issue: "This is a long enough issue description.",
        suggestion: "This is a long enough suggestion text.",
      })
    ).toThrow();
  });

  it("rejects invalid category", () => {
    expect(() =>
      AnswerInlineCommentSchema.parse({
        target_text: "some text",
        category: "INVALID",
        issue: "This is a long enough issue description.",
        suggestion: "This is a long enough suggestion text.",
      })
    ).toThrow();
  });
});

describe("AnswerAnalysisSchema", () => {
  it("validates a complete answer analysis", () => {
    const data = {
      question_id: "q1",
      inline_comments: [
        {
          target_text: "we aim to support the community",
          category: "SPECIFICITY",
          issue: "This statement is vague and lacks specific detail about which community.",
          suggestion: "Specify the target community, e.g., 'young people aged 16-25 in Southwark.'",
        },
      ],
      criteria_relevance: [
        { criterion_id: "c1", relevance: "directly_addresses" as const, notes: "Strong alignment" },
      ],
      strengths: ["Clear articulation of need"],
      weaknesses: ["Lacks quantitative evidence"],
      answer_score: "Fair" as const,
      word_count_assessment: {
        actual: 350,
        limit: 500,
        status: "within_limit" as const,
      },
    };
    expect(AnswerAnalysisSchema.parse(data)).toMatchObject(data);
  });

  it("accepts without optional word_count_assessment", () => {
    const data = {
      question_id: "q1",
      inline_comments: [],
      criteria_relevance: [],
      strengths: ["Good"],
      weaknesses: [],
      answer_score: "Strong" as const,
    };
    expect(AnswerAnalysisSchema.parse(data)).toMatchObject(data);
  });

  it("rejects invalid answer_score", () => {
    expect(() =>
      AnswerAnalysisSchema.parse({
        question_id: "q1",
        inline_comments: [],
        criteria_relevance: [],
        strengths: [],
        weaknesses: [],
        answer_score: "Excellent",
      })
    ).toThrow();
  });
});

describe("AnswerScoreSchema", () => {
  it("validates a valid answer score", () => {
    const data = {
      question_id: "q1",
      question_text: "Describe your project outcomes",
      score: "Strong" as const,
      summary: "Well-articulated outcomes with clear metrics",
    };
    expect(AnswerScoreSchema.parse(data)).toEqual(data);
  });
});

describe("ApplicationScoringSchema", () => {
  it("validates a complete application scoring response", () => {
    const data = {
      answer_scores: [
        {
          question_id: "q1",
          question_text: "Project need",
          score: "Strong" as const,
          summary: "Well-evidenced",
        },
      ],
      criteria_scores: [
        {
          criterion_id: "c1",
          criterion: "Clear need",
          score: "Strong" as const,
          bid_evidence: ["Q1: detailed needs assessment"],
          gaps: [],
          summary: "Well-evidenced need statement",
        },
      ],
      overall_score: 78,
      overall_descriptor: "Good",
      submission_readiness: "Nearly ready" as const,
      top_strengths: ["Strong needs assessment"],
      top_improvements: ["Add outcome metrics"],
    };
    expect(ApplicationScoringSchema.parse(data)).toEqual(data);
  });

  it("rejects score outside 0-100", () => {
    expect(() =>
      ApplicationScoringSchema.parse({
        answer_scores: [],
        criteria_scores: [],
        overall_score: 150,
        overall_descriptor: "Excellent",
        submission_readiness: "Ready to submit",
        top_strengths: ["Good"],
        top_improvements: ["Better"],
      })
    ).toThrow();
  });

  it("rejects empty top_strengths", () => {
    expect(() =>
      ApplicationScoringSchema.parse({
        answer_scores: [],
        criteria_scores: [],
        overall_score: 50,
        overall_descriptor: "OK",
        submission_readiness: "Needs revisions",
        top_strengths: [],
        top_improvements: ["Something"],
      })
    ).toThrow();
  });
});
