/**
 * Pipeline Zod schemas for all AI response types.
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Comment categories
// ---------------------------------------------------------------------------

export const COMMENT_CATEGORIES = [
  "ALIGNMENT",
  "EVIDENCE",
  "CLARITY",
  "STRUCTURE",
  "IMPACT",
  "BUDGET",
  "MISSING",
  "CONSISTENCY",
  "SPECIFICITY",
  "CONCISENESS",
] as const;

export const CommentCategory = z.enum(COMMENT_CATEGORIES);

// ---------------------------------------------------------------------------
// Score ratings
// ---------------------------------------------------------------------------

export const ScoreRating = z.enum(["Excellent", "Strong", "Fair", "Needs Improvement", "Poor", "Missing"]);

// ---------------------------------------------------------------------------
// Cross-reference finding
// ---------------------------------------------------------------------------

export const CrossReferenceFindingSchema = z.object({
  type: z.enum([
    "contradiction",
    "gap",
    "missing_criterion",
    "unresolved_reference",
    "inconsistency",
    "repetition",
    "resolved_weakness",
  ]),
  description: z.string(),
  sections_involved: z.array(z.string()),
  criteria_involved: z.array(z.string()).optional(),
  severity: z.enum(["high", "medium", "low"]),
  suggestion: z.string().optional(),
  confidence: z.enum(["high", "medium", "low"]),
  // resolved_weakness fields: which answer had the weakness and which answer resolves it
  source_question: z.string().optional(),
  original_weakness: z.string().optional(),
  resolved_by: z.string().optional(),
});

export const GapCriterionSchema = z.object({
  criterion_id: z.string(),
  criterion: z.string(),
  related_disabled_question_ids: z.array(z.string()),
  related_disabled_question_texts: z.array(z.string()),
});

export type GapCriterion = z.infer<typeof GapCriterionSchema>;

export const CrossReferenceSchema = z.object({
  findings: z.array(CrossReferenceFindingSchema),
  overall_coherence: z.enum(["strong", "adequate", "weak"]),
  summary: z.string(),
  gap_criteria: z.array(GapCriterionSchema).optional(),
});

// ---------------------------------------------------------------------------
// Scoring & synthesis response (Prompt D)
// ---------------------------------------------------------------------------

export const CriterionScoreSchema = z.object({
  criterion_id: z.string(),
  criterion: z.string(),
  score: ScoreRating,
  bid_evidence: z.array(z.string()),
  gaps: z.array(z.string()),
  summary: z.string(),
});

export const ImprovementAppendixItemSchema = z.object({
  criterion_id: z.string(),
  criterion: z.string(),
  what_funder_wants: z.string(),
  how_bid_addresses: z.string(),
  whats_missing: z.string(),
  example_language: z.string().optional(),
  gap_type: z.enum(["quick_fix", "structural_gap"]).optional(),
});

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

export type CrossReferenceFinding = z.infer<typeof CrossReferenceFindingSchema>;
export type CrossReference = z.infer<typeof CrossReferenceSchema>;
export type CriterionScore = z.infer<typeof CriterionScoreSchema>;
export type ImprovementAppendixItem = z.infer<typeof ImprovementAppendixItemSchema>;

// ---------------------------------------------------------------------------
// Application pipeline schemas (form-based review)
// ---------------------------------------------------------------------------

// Inline comment for a form answer (no paragraph_id — answers are flat text)
export const AnswerInlineCommentSchema = z.object({
  target_text: z.string().min(1),
  category: CommentCategory,
  issue: z.string().min(10),
  suggestion: z.string().min(10),
});

export type AnswerInlineComment = z.infer<typeof AnswerInlineCommentSchema>;

// Per-answer analysis (replaces SectionAnalysis for form-based review)
export const AnswerAnalysisSchema = z.object({
  question_id: z.string(),
  inline_comments: z.array(AnswerInlineCommentSchema),
  criteria_relevance: z.array(
    z.object({
      criterion_id: z.string(),
      relevance: z.enum(["directly_addresses", "partially_addresses", "not_relevant"]),
      notes: z.string().optional(),
      confidence: z.enum(["high", "medium", "low"]).optional(),
    })
  ),
  strengths: z.array(z.string()),
  weaknesses: z.array(z.string()),
  answer_score: ScoreRating,
  word_count_assessment: z
    .object({
      actual: z.number(),
      limit: z.number().optional(),
      status: z.enum(["within_limit", "over_limit", "no_limit"]),
    })
    .optional(),
});

export type AnswerAnalysis = z.infer<typeof AnswerAnalysisSchema>;

// Per-answer score (used in ApplicationScoringSchema)
export const AnswerScoreSchema = z.object({
  question_id: z.string(),
  question_text: z.string(),
  score: ScoreRating,
  summary: z.string(),
});

export type AnswerScore = z.infer<typeof AnswerScoreSchema>;

// Quality dimension score (used in ApplicationScoringSchema)
export const QualityDimensionSchema = z.object({
  dimension: z.string(),
  score: z.number().min(0).max(100).nullable(),
  summary: z.string(),
});

export type QualityDimension = z.infer<typeof QualityDimensionSchema>;

// Full application scoring (replaces ScoringSchema for form-based review)
export const ApplicationScoringSchema = z.object({
  answer_scores: z.array(AnswerScoreSchema),
  criteria_scores: z.array(CriterionScoreSchema),
  overall_score: z.number().min(0).max(100),
  overall_descriptor: z.string(),
  submission_readiness: z.enum([
    "Ready to submit",
    "Nearly ready",
    "Needs revisions",
    "Major rework needed",
  ]),
  top_strengths: z.array(z.string()).min(1).max(5),
  top_improvements: z.array(z.string()).min(1).max(5),
  improvement_appendix: z.array(ImprovementAppendixItemSchema).optional(),
  quality_dimensions: z.array(QualityDimensionSchema).optional(),
});

export type ApplicationScoring = z.infer<typeof ApplicationScoringSchema>;
