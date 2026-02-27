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

export const ScoreRating = z.enum(["Strong", "Fair", "Needs Improvement", "Missing"]);

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
  ]),
  description: z.string(),
  sections_involved: z.array(z.string()),
  criteria_involved: z.array(z.string()).optional(),
  severity: z.enum(["high", "medium", "low"]),
  suggestion: z.string().optional(),
});

export const CrossReferenceSchema = z.object({
  findings: z.array(CrossReferenceFindingSchema),
  overall_coherence: z.enum(["strong", "adequate", "weak"]),
  summary: z.string(),
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
});

export type ApplicationScoring = z.infer<typeof ApplicationScoringSchema>;
