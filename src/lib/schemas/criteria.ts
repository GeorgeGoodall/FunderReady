import { z } from "zod";

// ---------------------------------------------------------------------------
// Sub-question — backward-compatible: accepts plain strings or {text, required}
// ---------------------------------------------------------------------------

export const SubQuestionSchema = z.union([
  z.string().transform((text) => ({ text, required: true as const })),
  z.object({
    text: z.string().min(1),
    required: z.boolean().default(true),
  }),
]);

export type SubQuestion = { text: string; required: boolean };

// ---------------------------------------------------------------------------
// Criterion — a single evaluation criterion
// ---------------------------------------------------------------------------

export const CriterionSchema = z.object({
  id: z.string().min(1),
  criterion: z.string().min(1),
  weight: z.string().optional(),
  sub_questions: z.array(SubQuestionSchema).default([]),
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
// Question — a single application question with optional word limits
// ---------------------------------------------------------------------------

export const QuestionSchema = z.object({
  id: z.string().min(1),
  question: z.string().min(1),
  word_count_min: z.number().int().positive().optional(),
  word_count_max: z.number().int().positive().optional(),
  guidance: z.string().optional(),
  priority: z.number().int().min(1).max(5).optional(),
  field_type: z.enum(["text_short", "text_long", "dropdown", "radio", "checkbox", "email", "url", "phone", "number"]).optional(),
  options: z.array(z.string()).optional(),
});

export type Question = z.infer<typeof QuestionSchema>;

// ---------------------------------------------------------------------------
// QuestionsSet — structured set of funder questions
// ---------------------------------------------------------------------------

export const QuestionsSetSchema = z.object({
  questions: z.array(QuestionSchema).min(1).max(30),
  overall_word_limit: z.number().int().positive().optional(),
});

export type QuestionsSet = z.infer<typeof QuestionsSetSchema>;

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
  questionsJson: QuestionsSetSchema.optional(),
});

export type SubmitReviewRequest = z.infer<typeof SubmitReviewRequestSchema>;

// ---------------------------------------------------------------------------
// Organisation schemas
// ---------------------------------------------------------------------------

export const OrganisationSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  url: z.string().url().optional().nullable(),
  description: z.string().optional().nullable(),
  approved: z.boolean(),
});

export type Organisation = z.infer<typeof OrganisationSchema>;

export const CreateOrganisationSchema = z.object({
  name: z.string().min(1),
  url: z.string().url().optional(),
  description: z.string().optional(),
});

export type CreateOrganisation = z.infer<typeof CreateOrganisationSchema>;

// ---------------------------------------------------------------------------
// Fund schemas
// ---------------------------------------------------------------------------

export const FundSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  organisation_id: z.string().uuid().optional().nullable(),
  url: z.string().url().optional(),
  notes: z.string().optional(),
});

export type Fund = z.infer<typeof FundSchema>;

export const CreateFundSchema = FundSchema.omit({ id: true });

export type CreateFund = z.infer<typeof CreateFundSchema>;

// ---------------------------------------------------------------------------
// V2 submit request — uses fund + set IDs instead of inline JSONB
// ---------------------------------------------------------------------------

export const SubmitReviewRequestV2Schema = z.object({
  bidFileName: z.string().min(1),
  bidFilePath: z.string().min(1),
  fundId: z.string().uuid(),
  criteriaSetId: z.string().uuid(),
  questionsSetId: z.string().uuid().optional(),
  completeDraft: z.boolean().optional().default(true),
});

export type SubmitReviewRequestV2 = z.infer<typeof SubmitReviewRequestV2Schema>;

// ---------------------------------------------------------------------------
// Extended Question — adds field_type, options, char_limit, required, section
// ---------------------------------------------------------------------------

export const FIELD_TYPES = [
  "text_short",
  "text_long",
  "dropdown",
  "radio",
  "checkbox",
  "email",
  "url",
  "phone",
  "number",
] as const;

export const FieldTypeSchema = z.enum(FIELD_TYPES);

export type FieldType = z.infer<typeof FieldTypeSchema>;

export const ExtendedQuestionSchema = QuestionSchema.extend({
  field_type: FieldTypeSchema.default("text_long"),
  options: z.array(z.string()).optional(),
  char_limit: z.number().int().positive().optional(),
  required: z.boolean().default(true),
  section: z.string().optional(),
});

export type ExtendedQuestion = z.infer<typeof ExtendedQuestionSchema>;

// ---------------------------------------------------------------------------
// Application request schemas
// ---------------------------------------------------------------------------

export const CreateApplicationRequestSchema = z.object({
  fundId: z.string().uuid(),
  criteriaSetId: z.string().uuid(),
  questionsSetId: z.string().uuid(),
  title: z.string().optional(),
});

export type CreateApplicationRequest = z.infer<typeof CreateApplicationRequestSchema>;

export const SaveAnswersRequestSchema = z.object({
  answers: z.array(
    z.object({
      question_id: z.string().min(1),
      answer_text: z.string(),
      selected_options: z.array(z.string()).optional(),
      is_disabled: z.boolean().optional(),
    })
  ).min(1),
});

export type SaveAnswersRequest = z.infer<typeof SaveAnswersRequestSchema>;
