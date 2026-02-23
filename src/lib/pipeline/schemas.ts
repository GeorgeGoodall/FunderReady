/**
 * Pipeline Zod schemas for all AI response types.
 * Ported from prototypes/end-to-end/schemas.js
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
] as const;

export const CommentCategory = z.enum(COMMENT_CATEGORIES);

// ---------------------------------------------------------------------------
// Score ratings
// ---------------------------------------------------------------------------

export const ScoreRating = z.enum(["Strong", "Adequate", "Weak", "Missing"]);

// ---------------------------------------------------------------------------
// Pre-flight check response (Prompt A)
// ---------------------------------------------------------------------------

export const PreFlightSchema = z.object({
  is_bid: z.boolean(),
  language: z.string(),
  substantive: z.boolean(),
  title: z.string().optional().nullable(),
  word_count_estimate: z.number().optional().nullable(),
  rejection_reason: z.string().optional().nullable(),
});

// ---------------------------------------------------------------------------
// Inline comment (used within section analysis)
// ---------------------------------------------------------------------------

export const InlineCommentSchema = z.object({
  paragraph_id: z.string(),
  target_text: z.string().min(1),
  category: CommentCategory,
  issue: z.string().min(10),
  suggestion: z.string().min(10),
});

// ---------------------------------------------------------------------------
// Section analysis response (Prompt B)
// ---------------------------------------------------------------------------

export const SectionAnalysisSchema = z.object({
  section_id: z.string(),
  inline_comments: z.array(InlineCommentSchema),
  criteria_relevance: z.array(
    z.object({
      criterion_id: z.string(),
      relevance: z.enum(["directly_addresses", "partially_addresses", "not_relevant"]),
      notes: z.string().optional(),
    })
  ),
  strengths: z.array(z.string()),
  weaknesses: z.array(z.string()),
  questions_for_later_sections: z.array(z.string()).optional(),
});

// ---------------------------------------------------------------------------
// Cross-reference finding (Prompt C)
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

export const ScoringSchema = z.object({
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

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

export type PreFlight = z.infer<typeof PreFlightSchema>;
export type InlineComment = z.infer<typeof InlineCommentSchema>;
export type SectionAnalysis = z.infer<typeof SectionAnalysisSchema>;
export type CrossReferenceFinding = z.infer<typeof CrossReferenceFindingSchema>;
export type CrossReference = z.infer<typeof CrossReferenceSchema>;
export type CriterionScore = z.infer<typeof CriterionScoreSchema>;
export type ImprovementAppendixItem = z.infer<typeof ImprovementAppendixItemSchema>;
export type Scoring = z.infer<typeof ScoringSchema>;
