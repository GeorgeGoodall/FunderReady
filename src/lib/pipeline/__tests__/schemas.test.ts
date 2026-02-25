import { describe, it, expect } from "vitest";
import {
  PreFlightSchema,
  InlineCommentSchema,
  SectionAnalysisSchema,
  CrossReferenceSchema,
  ScoringSchema,
  AnswerInlineCommentSchema,
  AnswerAnalysisSchema,
  AnswerScoreSchema,
  ApplicationScoringSchema,
} from "../schemas";

describe("PreFlightSchema", () => {
  it("validates a passing pre-flight check", () => {
    const data = {
      is_bid: true,
      language: "en",
      substantive: true,
      title: "Test Bid Application",
      word_count_estimate: 5000,
      rejection_reason: null,
    };
    expect(PreFlightSchema.parse(data)).toEqual(data);
  });

  it("validates a rejected pre-flight check", () => {
    const data = {
      is_bid: false,
      language: "en",
      substantive: false,
      title: null,
      word_count_estimate: null,
      rejection_reason: "Not a funding bid",
    };
    expect(PreFlightSchema.parse(data)).toEqual(data);
  });

  it("rejects missing required fields", () => {
    expect(() => PreFlightSchema.parse({ is_bid: true })).toThrow();
  });
});

describe("InlineCommentSchema", () => {
  it("validates a well-formed comment", () => {
    const data = {
      paragraph_id: "p5",
      target_text: "significant community impact",
      category: "EVIDENCE",
      issue: "This claim lacks specific metrics or data to support it.",
      suggestion: "Add quantitative evidence, e.g., 'Our 2023 pilot reached 340 young people.'",
    };
    expect(InlineCommentSchema.parse(data)).toEqual(data);
  });

  it("rejects short issue text", () => {
    expect(() =>
      InlineCommentSchema.parse({
        paragraph_id: "p1",
        target_text: "text",
        category: "CLARITY",
        issue: "Too short",
        suggestion: "This suggestion is long enough to pass validation.",
      })
    ).toThrow();
  });

  it("rejects invalid category", () => {
    expect(() =>
      InlineCommentSchema.parse({
        paragraph_id: "p1",
        target_text: "some text here",
        category: "INVALID_CATEGORY",
        issue: "This is a long enough issue description.",
        suggestion: "This is a long enough suggestion text.",
      })
    ).toThrow();
  });
});

describe("SectionAnalysisSchema", () => {
  it("validates a complete section analysis", () => {
    const data = {
      section_id: "s1",
      inline_comments: [
        {
          paragraph_id: "p1",
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
    };
    expect(SectionAnalysisSchema.parse(data)).toMatchObject(data);
  });
});

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

describe("ScoringSchema", () => {
  it("validates a complete scoring response", () => {
    const data = {
      criteria_scores: [
        {
          criterion_id: "c1",
          criterion: "Clear need",
          score: "Strong" as const,
          bid_evidence: ["Section 1, p2: detailed needs assessment"],
          gaps: [],
          summary: "Well-evidenced need statement",
        },
        {
          criterion_id: "c2",
          criterion: "Measurable outcomes",
          score: "Needs Improvement" as const,
          bid_evidence: [],
          gaps: ["No specific metrics provided"],
          summary: "Outcomes are vaguely described",
        },
      ],
      overall_score: 65,
      overall_descriptor: "Needs Revisions",
      submission_readiness: "Needs revisions" as const,
      top_strengths: ["Strong needs assessment", "Good partnership evidence"],
      top_improvements: ["Add specific outcome metrics", "Strengthen sustainability plan"],
      improvement_appendix: [
        {
          criterion_id: "c2",
          criterion: "Measurable outcomes",
          what_funder_wants: "Specific, quantifiable outcomes with baselines",
          how_bid_addresses: "Lists general aims",
          whats_missing: "Specific metrics and targets",
          example_language: "We will increase literacy rates by 15% as measured by...",
        },
      ],
    };
    expect(ScoringSchema.parse(data)).toEqual(data);
  });

  it("rejects score outside 0-100", () => {
    expect(() =>
      ScoringSchema.parse({
        criteria_scores: [],
        overall_score: 150,
        overall_descriptor: "Excellent",
        submission_readiness: "Ready to submit",
        top_strengths: ["Good"],
        top_improvements: ["Better"],
      })
    ).toThrow();
  });

  it("rejects invalid submission_readiness value", () => {
    expect(() =>
      ScoringSchema.parse({
        criteria_scores: [],
        overall_score: 50,
        overall_descriptor: "OK",
        submission_readiness: "Invalid status",
        top_strengths: ["Good"],
        top_improvements: ["Better"],
      })
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Application pipeline schemas
// ---------------------------------------------------------------------------

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
