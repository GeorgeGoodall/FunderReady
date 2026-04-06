// ---------------------------------------------------------------------------
// Shared types for the review page
// ---------------------------------------------------------------------------

// Re-export Zod-inferred types from the pipeline schemas (single source of truth)
export type {
  AnswerInlineComment,
  AnswerAnalysis,
  CriterionScore,
  AnswerScore,
  CrossReferenceFinding,
  GapCriterion,
  CrossReference,
  QualityDimension,
  ImprovementAppendixItem,
  ApplicationScoring,
} from "@/lib/pipeline/schemas";

import type { ApplicationScoring, CrossReference, AnswerAnalysis } from "@/lib/pipeline/schemas";
import { ApplicationScoringSchema } from "@/lib/pipeline/schemas";
import { z } from "zod";

const ReviewResultsSchema = z.object({
  answer_feedback: z.record(z.string(), z.any()),
  cross_reference: z.object({}).passthrough(),
  scoring: ApplicationScoringSchema,
  projected_score: z.number().optional(),
  gap_count: z.number().optional(),
  total_criteria_count: z.number().optional(),
  disabled_questions: z.array(z.object({ question_id: z.string(), question_text: z.string() })).optional(),
});

export interface ReviewResults {
  answer_feedback: Record<string, AnswerAnalysis>;
  cross_reference: CrossReference;
  scoring: ApplicationScoring;
  projected_score?: number;
  gap_count?: number;
  total_criteria_count?: number;
  disabled_questions?: Array<{ question_id: string; question_text: string }>;
}

export interface ApplicationReviewClientProps {
  application: {
    id: string;
    title: string | null;
    status: string;
    review_count: number;
    fund_id: string;
  };
  fund: { id: string; name: string; organisation: { id: string; name: string } | null } | null;
  questions: Array<{ id: string; question: string; guidance?: string; word_count_max?: number; priority?: number }>;
  criteria: Array<{ id: string; criterion: string }>;
  answers: Array<{ question_id: string; answer_text: string; last_reviewed_text: string | null; is_disabled?: boolean | null }>;
  review: {
    id: string;
    review_number: number;
    status: string;
    progress: Record<string, unknown> | null;
    results: Record<string, unknown> | null;
    error_message: string | null;
    created_at: string;
    is_draft: boolean;
    credits_charged?: number | null;
  } | null;
  isHistorical?: boolean;
  defaultTab?: TabId;
  initialFeedback?: Record<string, "up" | "down">;
}

export type TabId = "summary" | "answers" | "cross-ref";

// ---------------------------------------------------------------------------
// Runtime type guards for Supabase JSON boundaries
// ---------------------------------------------------------------------------

/** Safely extract a number from an unknown record, returning a fallback on failure. */
export function safeNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" ? value : fallback;
}

/**
 * Validate that an unknown value has the required shape to be treated as ReviewResults.
 * Uses Zod safeParse for thorough validation at the Supabase JSON boundary.
 * Returns the typed value or null if the shape is invalid.
 */
export function parseReviewResults(raw: Record<string, unknown> | null): ReviewResults | null {
  if (!raw) return null;
  const result = ReviewResultsSchema.safeParse(raw);
  if (!result.success) return null;
  return result.data as ReviewResults;
}
