import { z } from "zod";

// ---------------------------------------------------------------------------
// Criterion — a single evaluation criterion
// ---------------------------------------------------------------------------

export const CriterionSchema = z.object({
  id: z.string().min(1),
  criterion: z.string().min(1),
  weight: z.string().optional(),
  sub_questions: z.array(z.string()).default([]),
});

export type Criterion = z.infer<typeof CriterionSchema>;

// ---------------------------------------------------------------------------
// CriteriaSet — a named set of criteria (AI output / user-edited)
// ---------------------------------------------------------------------------

export const CriteriaSetSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  criteria: z.array(CriterionSchema).min(1).max(20),
});

export type CriteriaSet = z.infer<typeof CriteriaSetSchema>;

// ---------------------------------------------------------------------------
// API request schemas
// ---------------------------------------------------------------------------

export const ParseCriteriaRequestSchema = z.object({
  rawText: z.string().min(10, "Criteria text must be at least 10 characters"),
});

export type ParseCriteriaRequest = z.infer<typeof ParseCriteriaRequestSchema>;

export const SubmitReviewRequestSchema = z.object({
  bidFileName: z.string().min(1),
  bidFilePath: z.string().min(1),
  criteriaJson: CriteriaSetSchema,
  completeDraft: z.boolean().optional().default(true),
});

export type SubmitReviewRequest = z.infer<typeof SubmitReviewRequestSchema>;
