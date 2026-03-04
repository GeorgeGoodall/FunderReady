import { describe, it, expect } from "vitest";
import {
  CrossReferenceSchema,
  AnswerInlineCommentSchema,
  AnswerAnalysisSchema,
  AnswerScoreSchema,
  ApplicationScoringSchema,
  QualityDimensionSchema,
  ImprovementAppendixItemSchema,
} from "../schemas";
import { SaveAnswersRequestSchema } from "../../schemas/criteria";

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
          confidence: "high" as const,
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

  it("validates with gap_criteria array", () => {
    const data = {
      findings: [],
      overall_coherence: "adequate" as const,
      summary: "Some criteria uncovered.",
      gap_criteria: [
        {
          criterion_id: "c3",
          criterion: "Financial sustainability",
          related_disabled_question_ids: ["q5"],
          related_disabled_question_texts: ["Do you have trading subsidiaries?"],
        },
      ],
    };
    expect(CrossReferenceSchema.parse(data)).toEqual(data);
  });

  it("validates findings with confidence field", () => {
    const data = {
      findings: [
        {
          type: "contradiction" as const,
          description: "Budget mismatch",
          sections_involved: ["q1", "q3"],
          severity: "high" as const,
          confidence: "high" as const,
        },
      ],
      overall_coherence: "adequate" as const,
      summary: "Some issues found.",
    };
    const result = CrossReferenceSchema.parse(data);
    expect(result.findings[0].confidence).toBe("high");
  });

  it("rejects findings without confidence (confidence is required)", () => {
    const data = {
      findings: [
        {
          type: "gap" as const,
          description: "Missing coverage",
          sections_involved: ["q2"],
          severity: "medium" as const,
        },
      ],
      overall_coherence: "adequate" as const,
      summary: "Minor gaps.",
    };
    expect(() => CrossReferenceSchema.parse(data)).toThrow();
  });

  it("validates all three confidence levels on findings", () => {
    for (const level of ["high", "medium", "low"] as const) {
      const data = {
        findings: [
          {
            type: "gap" as const,
            description: "Some gap",
            sections_involved: ["q1"],
            severity: "medium" as const,
            confidence: level,
          },
        ],
        overall_coherence: "adequate" as const,
        summary: "Test.",
      };
      const result = CrossReferenceSchema.parse(data);
      expect(result.findings[0].confidence).toBe(level);
    }
  });

  it("validates finding with all optional fields including confidence", () => {
    const data = {
      findings: [
        {
          type: "inconsistency" as const,
          description: "Naming shifts between answers",
          sections_involved: ["q1", "q2"],
          criteria_involved: ["c1"],
          severity: "low" as const,
          suggestion: "Standardise naming",
          confidence: "medium" as const,
        },
      ],
      overall_coherence: "strong" as const,
      summary: "Minor naming issue.",
    };
    const result = CrossReferenceSchema.parse(data);
    expect(result.findings[0]).toMatchObject({
      confidence: "medium",
      suggestion: "Standardise naming",
      criteria_involved: ["c1"],
    });
  });

  it("rejects invalid confidence value on findings", () => {
    expect(() =>
      CrossReferenceSchema.parse({
        findings: [
          {
            type: "gap" as const,
            description: "Missing coverage",
            sections_involved: ["q2"],
            severity: "medium" as const,
            confidence: "very_high",
          },
        ],
        overall_coherence: "adequate" as const,
        summary: "Issues.",
      })
    ).toThrow();
  });

  it("validates without gap_criteria (backward compatibility)", () => {
    const data = {
      findings: [],
      overall_coherence: "strong" as const,
      summary: "All good.",
    };
    // gap_criteria is optional — should parse cleanly
    const result = CrossReferenceSchema.parse(data);
    expect(result.gap_criteria).toBeUndefined();
  });
});

describe("SaveAnswersRequestSchema", () => {
  it("accepts is_disabled field on answers", () => {
    const data = {
      answers: [
        { question_id: "q1", answer_text: "Some answer", is_disabled: false },
        { question_id: "q2", answer_text: "", is_disabled: true },
      ],
    };
    expect(() => SaveAnswersRequestSchema.parse(data)).not.toThrow();
  });

  it("accepts answers without is_disabled (optional)", () => {
    const data = {
      answers: [{ question_id: "q1", answer_text: "Some answer" }],
    };
    expect(() => SaveAnswersRequestSchema.parse(data)).not.toThrow();
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

  it("accepts Excellent and Poor as valid answer_scores", () => {
    for (const score of ["Excellent", "Poor"]) {
      expect(
        AnswerAnalysisSchema.parse({
          question_id: "q1",
          inline_comments: [],
          criteria_relevance: [],
          strengths: ["Good"],
          weaknesses: [],
          answer_score: score,
        })
      ).toMatchObject({ answer_score: score });
    }
  });

  it("accepts confidence on criteria_relevance entries", () => {
    const data = {
      question_id: "q1",
      inline_comments: [],
      criteria_relevance: [
        { criterion_id: "c1", relevance: "directly_addresses" as const, confidence: "high" as const },
        { criterion_id: "c2", relevance: "partially_addresses" as const, confidence: "low" as const },
      ],
      strengths: ["Good"],
      weaknesses: [],
      answer_score: "Strong" as const,
    };
    const result = AnswerAnalysisSchema.parse(data);
    expect(result.criteria_relevance[0].confidence).toBe("high");
    expect(result.criteria_relevance[1].confidence).toBe("low");
  });

  it("accepts criteria_relevance without confidence (backward compat)", () => {
    const data = {
      question_id: "q1",
      inline_comments: [],
      criteria_relevance: [
        { criterion_id: "c1", relevance: "directly_addresses" as const },
      ],
      strengths: ["Good"],
      weaknesses: [],
      answer_score: "Strong" as const,
    };
    const result = AnswerAnalysisSchema.parse(data);
    expect(result.criteria_relevance[0].confidence).toBeUndefined();
  });

  it("accepts medium confidence on criteria_relevance", () => {
    const data = {
      question_id: "q1",
      inline_comments: [],
      criteria_relevance: [
        { criterion_id: "c1", relevance: "partially_addresses" as const, confidence: "medium" as const },
      ],
      strengths: ["OK"],
      weaknesses: [],
      answer_score: "Fair" as const,
    };
    const result = AnswerAnalysisSchema.parse(data);
    expect(result.criteria_relevance[0].confidence).toBe("medium");
  });

  it("accepts confidence with notes on criteria_relevance", () => {
    const data = {
      question_id: "q1",
      inline_comments: [],
      criteria_relevance: [
        {
          criterion_id: "c1",
          relevance: "directly_addresses" as const,
          notes: "Strong alignment with criterion",
          confidence: "high" as const,
        },
      ],
      strengths: ["Good"],
      weaknesses: [],
      answer_score: "Strong" as const,
    };
    const result = AnswerAnalysisSchema.parse(data);
    expect(result.criteria_relevance[0].confidence).toBe("high");
    expect(result.criteria_relevance[0].notes).toBe("Strong alignment with criterion");
  });

  it("rejects invalid confidence value on criteria_relevance", () => {
    expect(() =>
      AnswerAnalysisSchema.parse({
        question_id: "q1",
        inline_comments: [],
        criteria_relevance: [
          { criterion_id: "c1", relevance: "directly_addresses", confidence: "extreme" },
        ],
        strengths: [],
        weaknesses: [],
        answer_score: "Strong",
      })
    ).toThrow();
  });

  it("rejects invalid answer_score", () => {
    expect(() =>
      AnswerAnalysisSchema.parse({
        question_id: "q1",
        inline_comments: [],
        criteria_relevance: [],
        strengths: [],
        weaknesses: [],
        answer_score: "Superb",
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
      submission_readiness: "Good progress" as const,
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
        submission_readiness: "Strong application",
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
        submission_readiness: "Good progress",
        top_strengths: [],
        top_improvements: ["Something"],
      })
    ).toThrow();
  });

  it("validates with quality_dimensions", () => {
    const data = {
      answer_scores: [
        { question_id: "q1", question_text: "Need", score: "Strong" as const, summary: "Good" },
      ],
      criteria_scores: [
        { criterion_id: "c1", criterion: "Need", score: "Strong" as const, bid_evidence: ["Q1"], gaps: [], summary: "Good" },
      ],
      overall_score: 75,
      overall_descriptor: "Good",
      submission_readiness: "Good progress" as const,
      top_strengths: ["Clear need"],
      top_improvements: ["Add metrics"],
      quality_dimensions: [
        { dimension: "Language & Grammar", score: 85, summary: "Well written" },
        { dimension: "Evidence", score: 60, summary: "Some gaps" },
        { dimension: "Financial Accuracy", score: null, summary: "No financial content" },
      ],
    };
    const result = ApplicationScoringSchema.parse(data);
    expect(result.quality_dimensions).toHaveLength(3);
    expect(result.quality_dimensions![2].score).toBeNull();
  });

  it("validates without quality_dimensions (backward compat)", () => {
    const data = {
      answer_scores: [
        { question_id: "q1", question_text: "Need", score: "Strong" as const, summary: "Good" },
      ],
      criteria_scores: [
        { criterion_id: "c1", criterion: "Need", score: "Strong" as const, bid_evidence: ["Q1"], gaps: [], summary: "Good" },
      ],
      overall_score: 75,
      overall_descriptor: "Good",
      submission_readiness: "Good progress" as const,
      top_strengths: ["Clear need"],
      top_improvements: ["Add metrics"],
    };
    const result = ApplicationScoringSchema.parse(data);
    expect(result.quality_dimensions).toBeUndefined();
  });
});

describe("QualityDimensionSchema", () => {
  it("validates a dimension with numeric score", () => {
    const data = { dimension: "Evidence", score: 72, summary: "Mostly well-evidenced" };
    expect(QualityDimensionSchema.parse(data)).toEqual(data);
  });

  it("validates a dimension with null score (N/A)", () => {
    const data = { dimension: "Financial Accuracy", score: null, summary: "No financial content" };
    expect(QualityDimensionSchema.parse(data)).toEqual(data);
  });

  it("rejects score above 100", () => {
    expect(() =>
      QualityDimensionSchema.parse({ dimension: "Evidence", score: 105, summary: "Too high" })
    ).toThrow();
  });

  it("rejects score below 0", () => {
    expect(() =>
      QualityDimensionSchema.parse({ dimension: "Evidence", score: -1, summary: "Negative" })
    ).toThrow();
  });
});

describe("ImprovementAppendixItemSchema", () => {
  it("validates with gap_type quick_fix", () => {
    const data = {
      criterion_id: "c1",
      criterion: "Need",
      what_funder_wants: "Clear evidence",
      how_bid_addresses: "Mentions need",
      whats_missing: "Specific data",
      gap_type: "quick_fix" as const,
    };
    expect(ImprovementAppendixItemSchema.parse(data)).toMatchObject({ gap_type: "quick_fix" });
  });

  it("validates with gap_type structural_gap", () => {
    const data = {
      criterion_id: "c2",
      criterion: "Outcomes",
      what_funder_wants: "Track record",
      how_bid_addresses: "Programme still running",
      whats_missing: "Outcome data not yet available",
      gap_type: "structural_gap" as const,
    };
    expect(ImprovementAppendixItemSchema.parse(data)).toMatchObject({ gap_type: "structural_gap" });
  });

  it("validates without gap_type (backward compat)", () => {
    const data = {
      criterion_id: "c1",
      criterion: "Need",
      what_funder_wants: "Clear evidence",
      how_bid_addresses: "Mentions need",
      whats_missing: "Specific data",
    };
    const result = ImprovementAppendixItemSchema.parse(data);
    expect(result.gap_type).toBeUndefined();
  });

  it("rejects invalid gap_type value", () => {
    expect(() =>
      ImprovementAppendixItemSchema.parse({
        criterion_id: "c1",
        criterion: "Need",
        what_funder_wants: "X",
        how_bid_addresses: "Y",
        whats_missing: "Z",
        gap_type: "invalid",
      })
    ).toThrow();
  });
});
