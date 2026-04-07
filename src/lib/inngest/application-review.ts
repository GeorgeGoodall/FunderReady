/**
 * Inngest function for reviewing form-based applications.
 * Event: application/review-requested
 *
 * Pipeline: load → answer analysis (per question) → cross-reference → scoring → save results
 */

import { NonRetriableError } from "inngest";
import { inngest } from "./client";
import { createServiceClient } from "@/lib/supabase/server";
import { logAiUsage, type LogAiUsageParams } from "@/lib/ai/log-usage";
import { inferWithClaude } from "@/lib/ai/infer-with-claude";
import {
  submitAnswerBatch,
  pollBatch,
  parseBatchResults,
  type AnswerBatchRequest,
} from "@/lib/ai/anthropic-batch";
import {
  AnswerAnalysisSchema,
  CrossReferenceSchema,
  ApplicationScoringSchema,
  type AnswerAnalysis,
  type CrossReference,
  type ApplicationScoring,
  type GapCriterion,
} from "@/lib/pipeline/schemas";
import {
  buildAnswerAnalysisSystemPrompt,
  buildAnswerAnalysisPrompt,
  buildApplicationCrossReferencePrompt,
  buildApplicationScoringPrompt,
  formatPreviousAnswerContext,
  formatPreviousOverallContext,
  formatAnswerDisplay,
  type AnswerContext,
} from "@/lib/pipeline/application-prompts";
import type { Criterion } from "@/lib/pipeline/prompt-templates";
import type { ImprovementAppendixItem } from "@/lib/pipeline/schemas";
import { calculateCost } from "@/lib/ai/pricing";
import { z } from "zod";
import {
  StructureAssignmentSchema,
  buildStructureAssignmentPrompt,
  type AssignedSection,
  type StructureAssignment,
} from "@/lib/pipeline/structure-assignment";
import { buildGapAnalysisPrompt } from "@/lib/pipeline/gap-analysis";

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------

const MODEL = "claude-sonnet-4-6";

// ---------------------------------------------------------------------------
// Lenient schema wrapper: Claude sometimes returns strings instead of arrays
// ---------------------------------------------------------------------------

function sanitizeAnalysis(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const obj = { ...(raw as Record<string, unknown>) };
  for (const key of ["inline_comments", "criteria_relevance", "strengths", "weaknesses"]) {
    if (obj[key] !== undefined && !Array.isArray(obj[key])) {
      obj[key] = [];
    }
  }
  return obj;
}

// Wrap AnswerAnalysisSchema with preprocessing
const LenientAnswerAnalysisSchema = z.preprocess(
  sanitizeAnalysis,
  AnswerAnalysisSchema
) as z.ZodType<z.infer<typeof AnswerAnalysisSchema>>;

// ---------------------------------------------------------------------------
// Helpers — use reviewId (UUID PK) for all queries
// ---------------------------------------------------------------------------

async function updateAppReviewProgress(
  reviewId: string,
  status: string,
  progressUpdate: Record<string, unknown>
) {
  const supabase = createServiceClient();

  const { data: existing } = await supabase
    .from("application_reviews")
    .select("progress")
    .eq("id", reviewId)
    .single();

  const progress = { ...(existing?.progress as Record<string, unknown> ?? {}), ...progressUpdate };

  await supabase
    .from("application_reviews")
    .update({ status, progress })
    .eq("id", reviewId);
}

async function markAppReviewFailed(
  reviewId: string,
  applicationId: string,
  errorMessage: string
) {
  const supabase = createServiceClient();

  await supabase
    .from("application_reviews")
    .update({ status: "failed", error_message: errorMessage })
    .eq("id", reviewId);

  // Reset application status back to draft so user can retry
  await supabase
    .from("applications")
    .update({ status: "draft" })
    .eq("id", applicationId);
}

// ---------------------------------------------------------------------------
// Post-processing: sanitize fabricated stats in example_language
// ---------------------------------------------------------------------------

function extractKnownNumbers(texts: string[]): Set<string> {
  const known = new Set<string>();
  for (const text of texts) {
    // Extract percentages like "78%"
    for (const m of text.matchAll(/\b(\d{1,3})%/g)) {
      known.add(m[1] + "%");
    }
    // Extract standalone numbers (2+ digits)
    for (const m of text.matchAll(/\b(\d{2,})\b/g)) {
      known.add(m[1]);
    }
  }
  return known;
}

export function sanitizeExampleLanguage(
  appendix: ImprovementAppendixItem[],
  knownNumbers: Set<string>
): ImprovementAppendixItem[] {
  return appendix.map((item) => {
    if (!item.example_language) return item;
    let text = item.example_language;
    // Replace percentages not in original answers
    text = text.replace(/\b(\d{1,3})%/g, (match, num) =>
      knownNumbers.has(num + "%") ? match : "[X]%"
    );
    // Replace specific counts (2+ digits) not in original answers
    text = text.replace(/\b(\d{2,})\b/g, (match) =>
      knownNumbers.has(match) ? match : "[X]"
    );
    // Replace parenthetical citations that look fabricated (Name, Year)
    text = text.replace(/\(([A-Z][^)]*(?:19|20)\d{2}[^)]*)\)/g, "[cite source, year]");
    return { ...item, example_language: text };
  });
}

// ---------------------------------------------------------------------------
// Projected score utility
// ---------------------------------------------------------------------------

export function computeProjectedScore(
  currentScore: number,
  gapCount: number,
  totalCriteriaCount: number
): number {
  if (gapCount <= 0 || totalCriteriaCount <= 0) return currentScore;
  return Math.min(100, currentScore + gapCount * (100 / totalCriteriaCount));
}

// ---------------------------------------------------------------------------
// Pure helpers for previous review context (extracted for testability)
// ---------------------------------------------------------------------------

export interface TrimmedAnswerFeedback {
  answer_score?: string;
  weaknesses?: string[];
}

export interface TrimmedScoringContext {
  overall_score?: number;
  submission_readiness?: string;
  top_improvements?: string[];
}

export interface TrimmedReviewResults {
  answer_feedback?: Record<string, TrimmedAnswerFeedback>;
  scoring?: TrimmedScoringContext;
}

/**
 * Extract and trim previous review results to only the fields needed
 * for feedback evolution prompts. Keeps Inngest step state small.
 */
export function trimPreviousReviewResults(
  fullResults: Record<string, unknown>
): TrimmedReviewResults {
  const trimmed: TrimmedReviewResults = {};

  // Extract per-answer scores and weaknesses
  const af = fullResults.answer_feedback;
  if (af && typeof af === "object") {
    const trimmedFeedback: Record<string, TrimmedAnswerFeedback> = {};
    for (const [qId, raw] of Object.entries(af as Record<string, unknown>)) {
      if (raw && typeof raw === "object") {
        const entry = raw as Record<string, unknown>;
        trimmedFeedback[qId] = {
          answer_score: typeof entry.answer_score === "string" ? entry.answer_score : undefined,
          weaknesses: Array.isArray(entry.weaknesses)
            ? entry.weaknesses.filter((w): w is string => typeof w === "string")
            : undefined,
        };
      }
    }
    trimmed.answer_feedback = trimmedFeedback;
  }

  // Extract overall scoring summary
  const sc = fullResults.scoring;
  if (sc && typeof sc === "object") {
    const scoring = sc as Record<string, unknown>;
    trimmed.scoring = {
      overall_score: typeof scoring.overall_score === "number" ? scoring.overall_score : undefined,
      submission_readiness: typeof scoring.submission_readiness === "string" ? scoring.submission_readiness : undefined,
      top_improvements: Array.isArray(scoring.top_improvements)
        ? scoring.top_improvements.filter((v): v is string => typeof v === "string")
        : undefined,
    };
  }

  return trimmed;
}

/**
 * Filter answers to those that are enabled and have content (non-empty text or selected options).
 */
export function filterEnabledAnswers<T extends {
  is_disabled: boolean;
  answer_text: string;
  selected_options?: string[] | null;
}>(answers: T[]): T[] {
  return answers.filter(
    (a) => !a.is_disabled && (
      a.answer_text.trim().length > 0 ||
      (Array.isArray(a.selected_options) && a.selected_options.length > 0)
    )
  );
}

/**
 * Format an answer's content for the cross-reference step.
 * Delegates to formatAnswerDisplay from application-prompts.ts.
 */
function formatAnswerForCrossRef(a: {
  answer_text: string;
  selected_options?: string[] | null;
  field_type?: string | null;
}): string {
  return formatAnswerDisplay({
    question_id: "",
    question_text: "",
    answer_text: a.answer_text,
    selected_options: a.selected_options ?? undefined,
    field_type: a.field_type ?? undefined,
  });
}

/**
 * Compute which answers have changed since the last review.
 * Returns a map of question_id → boolean (true if answer text differs from last reviewed).
 */
export function computeAnswerChanges(
  answers: Array<{ question_id: string; answer_text: string; last_reviewed_text?: string | null }>,
): Record<string, boolean> {
  const changes: Record<string, boolean> = {};
  for (const a of answers) {
    changes[a.question_id] =
      a.last_reviewed_text !== null &&
      a.last_reviewed_text !== undefined &&
      a.answer_text !== a.last_reviewed_text;
  }
  return changes;
}

/**
 * Extract reusable answer analyses from a previous review's results.
 * An analysis is reusable when: criteria set matches, answer text unchanged,
 * and the previous analysis passes schema validation.
 */
export function extractReusableAnalyses(
  previousResults: Record<string, unknown> | null | undefined,
  answerChanges: Record<string, boolean>,
  criteriaSetMatch: boolean
): Record<string, AnswerAnalysis> {
  const reusable: Record<string, AnswerAnalysis> = {};

  if (!criteriaSetMatch || !previousResults) return reusable;

  const af = previousResults.answer_feedback;
  if (!af || typeof af !== "object") return reusable;

  const feedbackMap = af as Record<string, unknown>;

  for (const [questionId, raw] of Object.entries(feedbackMap)) {
    // Only reuse if answer is explicitly unchanged
    if (answerChanges[questionId] !== false) continue;

    // Validate against schema before accepting
    const parsed = AnswerAnalysisSchema.safeParse(raw);
    if (!parsed.success) continue;

    reusable[questionId] = parsed.data;
  }

  return reusable;
}

// ---------------------------------------------------------------------------
// Post-processing: annotate weaknesses resolved by other answers
// ---------------------------------------------------------------------------

/**
 * After the cross-reference step, match `resolved_weakness` findings back to
 * the per-answer weaknesses and annotate them with "(void — addressed in qY)".
 *
 * This runs BEFORE the scoring step so that:
 * 1. The scoring step sees annotated weaknesses and knows to exclude them
 * 2. The saved answer_feedback shows the annotations to the user
 *
 * Mutates `answerAnalyses[].weaknesses` in-place. Returns the count of
 * annotations applied (useful for logging/testing).
 */
export function annotateResolvedWeaknesses(
  answerAnalyses: AnswerAnalysis[],
  crossReference: CrossReference
): number {
  const resolved = crossReference.findings.filter(
    (f) =>
      f.type === "resolved_weakness" &&
      f.source_question &&
      f.original_weakness &&
      f.resolved_by
  );

  if (resolved.length === 0) return 0;

  // Build lookup: question_id → analysis
  const byQuestion = new Map<string, AnswerAnalysis>();
  for (const a of answerAnalyses) {
    byQuestion.set(a.question_id, a);
  }

  let count = 0;

  for (const finding of resolved) {
    const analysis = byQuestion.get(finding.source_question!);
    if (!analysis) continue;

    const needle = finding.original_weakness!.toLowerCase().trim();

    // Match: exact, then substring in either direction
    let idx = analysis.weaknesses.findIndex(
      (w) => w.toLowerCase().trim() === needle
    );
    if (idx === -1) {
      idx = analysis.weaknesses.findIndex(
        (w) =>
          w.toLowerCase().includes(needle) ||
          needle.includes(w.toLowerCase().trim())
      );
    }

    if (idx !== -1 && !analysis.weaknesses[idx].includes("(void —")) {
      analysis.weaknesses[idx] += ` (void — addressed in ${finding.resolved_by})`;
      count++;
    }
  }

  return count;
}

// ---------------------------------------------------------------------------
// Word count helper
// ---------------------------------------------------------------------------

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

// ---------------------------------------------------------------------------
// Pipeline function
// ---------------------------------------------------------------------------

export const applicationReviewRequested = inngest.createFunction(
  {
    id: "application-review-requested",
    concurrency: { key: "event.data.userId", limit: 1 },
    retries: 3,
    onFailure: async ({ event }) => {
      const { applicationId, reviewId, userId } = event.data.event.data;
      if (applicationId && reviewId) {
        await markAppReviewFailed(
          reviewId,
          applicationId,
          "The review pipeline encountered an unexpected error. Please try again."
        );
      }
      // Rollback usage — user shouldn't lose quota for a failed pipeline
      if (userId) {
        const supabase = createServiceClient();
        await supabase.rpc("rollback_usage", { p_user_id: userId });
      }
    },
  },
  { event: "application/review-requested" },
  async ({ event, step }) => {
    const { applicationId, reviewId, userId, isDraft = false } = event.data;

    // -----------------------------------------------------------------------
    // Step 1: Load application data
    // -----------------------------------------------------------------------
    const appData = await step.run("load-application", async () => {
      const supabase = createServiceClient();

      // Load application
      const { data: app, error: appError } = await supabase
        .from("applications")
        .select("fund_id, criteria_set_id, questions_set_id, title")
        .eq("id", applicationId)
        .single();

      if (appError || !app) {
        throw new NonRetriableError(`Application not found: ${applicationId}`);
      }

      // Load answers (including is_disabled and last_reviewed_text for change detection)
      const { data: answers, error: answersError } = await supabase
        .from("application_answers")
        .select("question_id, answer_text, field_type, selected_options, is_disabled, last_reviewed_text")
        .eq("application_id", applicationId);

      if (answersError) {
        throw new NonRetriableError(`Failed to load answers: ${answersError.message}`);
      }

      // Load criteria
      const { data: criteriaSet } = await supabase
        .from("criteria_sets")
        .select("criteria_json")
        .eq("id", app.criteria_set_id)
        .eq("rejected", false)
        .single();

      if (!criteriaSet?.criteria_json) {
        throw new NonRetriableError("Criteria set not found or empty");
      }

      // Load fund to get application_format
      const { data: fundData } = await supabase
        .from("funds")
        .select("application_format")
        .eq("id", app.fund_id)
        .single();

      const applicationFormat = (fundData?.application_format ?? "question_form") as
        | "question_form"
        | "structured_doc"
        | "unstructured_doc";

      const VALID_FORMATS = ["question_form", "structured_doc", "unstructured_doc"] as const;
      if (!VALID_FORMATS.includes(applicationFormat as (typeof VALID_FORMATS)[number])) {
        throw new NonRetriableError(`Unknown application_format: ${applicationFormat}`);
      }

      // Load questions (only for non-unstructured_doc formats)
      let questions: Array<{
        id: string;
        question: string;
        word_count_min?: number;
        word_count_max?: number;
        guidance?: string;
        priority?: number;
        field_type?: string;
      }> = [];
      let overallWordLimit: number | undefined;

      if (applicationFormat !== "unstructured_doc") {
        const { data: questionsSet } = await supabase
          .from("questions_sets")
          .select("questions_json, overall_word_limit")
          .eq("id", app.questions_set_id!)
          .eq("rejected", false)
          .single();

        if (!questionsSet?.questions_json) {
          throw new NonRetriableError("Questions set not found or empty");
        }
        questions = questionsSet.questions_json as typeof questions;
        overallWordLimit = questionsSet.overall_word_limit ?? undefined;
      }

      // Load previous completed review (for feedback evolution)
      const { data: prevReview } = await supabase
        .from("application_reviews")
        .select("review_number, results, criteria_set_id")
        .eq("application_id", applicationId)
        .eq("status", "completed")
        .neq("id", reviewId)
        .order("review_number", { ascending: false })
        .limit(1)
        .single();

      // Mark application as actively reviewing
      await supabase
        .from("applications")
        .update({ status: "reviewing" })
        .eq("id", applicationId);

      await updateAppReviewProgress(reviewId, "analysing", {
        load_completed: Date.now(),
      });

      const allAnswers = answers ?? [];

      // Split into enabled (non-disabled, non-empty) and disabled
      const enabledAnswers = filterEnabledAnswers(allAnswers);

      // Build disabled questions metadata list
      const disabledAnswerIds = new Set(
        allAnswers.filter((a) => a.is_disabled).map((a) => a.question_id)
      );
      const disabledQuestions = questions
        .filter((q) => disabledAnswerIds.has(q.id))
        .map((q) => ({ question_id: q.id, question_text: q.question }));

      // Compute answer changes: which answers were modified since last review
      const answerChanges = prevReview
        ? computeAnswerChanges(allAnswers)
        : {} as Record<string, boolean>;

      // Extract only the fields needed for feedback evolution (keeps Inngest step state small)
      let previousReviewContext: {
        review_number: number;
        results: Record<string, unknown>;
      } | null = null;

      if (prevReview?.results && typeof prevReview.results === "object") {
        const trimmedResults = trimPreviousReviewResults(
          prevReview.results as Record<string, unknown>
        );
        previousReviewContext = {
          review_number: prevReview.review_number,
          results: trimmedResults as unknown as Record<string, unknown>,
        };
      }

      // Determine if previous review used the same criteria set
      const criteriaSetMatch = prevReview
        ? prevReview.criteria_set_id === app.criteria_set_id
        : false;

      // Extract full reusable analyses (only when criteria set matches)
      const reusableAnalyses = prevReview?.results && typeof prevReview.results === "object"
        ? extractReusableAnalyses(
            prevReview.results as Record<string, unknown>,
            answerChanges,
            criteriaSetMatch
          )
        : {} as Record<string, AnswerAnalysis>;

      // Compute document word count for unstructured_doc applications
      const documentWordCount =
        applicationFormat === "unstructured_doc"
          ? countWords(enabledAnswers[0]?.answer_text ?? "")
          : 0;

      return {
        title: app.title,
        criteria: criteriaSet.criteria_json as unknown as Criterion[],
        questions,
        overallWordLimit,
        applicationFormat,
        documentWordCount,
        enabledAnswers,
        disabledQuestions,
        previousReview: previousReviewContext,
        answerChanges,
        reusableAnalyses,
      };
    });

    const { criteria, questions, enabledAnswers, disabledQuestions, overallWordLimit, previousReview, answerChanges, reusableAnalyses, applicationFormat, documentWordCount } = appData;

    const isUnstructuredDoc = applicationFormat === "unstructured_doc";
    const isShortDoc = isUnstructuredDoc && documentWordCount <= 500;

    // Build answer contexts — format-aware branching
    let structureUsage: LogAiUsageParams | null = null;
    let answerContexts: AnswerContext[] = [];

    if (isUnstructuredDoc && !isShortDoc) {
      if (enabledAnswers.length === 0) {
        answerContexts = [];
      } else {
        // Long unstructured doc: run structure assignment to split into sections
        await step.run("structuring-progress", async () => {
          await updateAppReviewProgress(reviewId, "structuring", {
            structuring_started: Date.now(),
          });
        });

        const { systemPrompt: structSystemPrompt, userPrompt: structUserPrompt } =
          buildStructureAssignmentPrompt(enabledAnswers[0].answer_text, criteria);
        const { result: structure, usage: structUsageData } = await inferWithClaude(
          step,
          "structure-assignment",
          {
            prompt: structUserPrompt,
            systemPrompt: structSystemPrompt,
            schema: StructureAssignmentSchema,
            model: MODEL,
            maxTokens: 4096,
            temperature: 0,
          }
        );

        structureUsage = {
          applicationReviewId: reviewId,
          userId,
          pipelineStep: "structure_assignment",
          model: MODEL,
          usage: structUsageData,
          isRetry: false,
        };

        const typedStructure = structure as StructureAssignment;
        answerContexts = typedStructure.sections.map((s) => ({
          question_id: s.id,
          question_text: s.title,
          answer_text: s.content,
          field_type: "text_long" as const,
        }));
      }
    } else if (isUnstructuredDoc && isShortDoc) {
      // Short unstructured doc: whole document as one answer context
      answerContexts = [
        {
          question_id: "document_content",
          question_text: "Document",
          answer_text: enabledAnswers[0]?.answer_text ?? "",
          field_type: "text_long" as const,
        },
      ];
    } else {
      // question_form / structured_doc: build from questions + answers
      for (const a of enabledAnswers) {
        const q = questions.find((q) => q.id === a.question_id);
        if (!q) continue;
        answerContexts.push({
          question_id: a.question_id,
          question_text: q.question,
          answer_text: a.answer_text,
          selected_options: a.selected_options ?? undefined,
          field_type: a.field_type ?? q.field_type,
          guidance: q.guidance,
          word_count_min: q.word_count_min,
          word_count_max: q.word_count_max,
          priority: q.priority,
        });
      }
    }

    if (answerContexts.length === 0) {
      await step.run("no-answers", async () => {
        await markAppReviewFailed(
          reviewId,
          applicationId,
          "No non-empty answers found to review."
        );
      });
      return { applicationId, status: "failed", reason: "No answers" };
    }

    // Split contexts into fresh (need Claude) and reusable (unchanged from previous review)
    // For unstructured_doc, sections are runtime-assigned so caching doesn't apply.
    // Pure computation — safe to run in function body on every replay
    const freshContexts: AnswerContext[] = [];
    const reusedAnalyses: AnswerAnalysis[] = [];

    if (!isUnstructuredDoc) {
      for (const ctx of answerContexts) {
        const cached = reusableAnalyses[ctx.question_id];
        if (cached) {
          reusedAnalyses.push(cached);
        } else {
          freshContexts.push(ctx);
        }
      }
    } else {
      freshContexts.push(...answerContexts);
    }

    const answerSystemPrompt = buildAnswerAnalysisSystemPrompt(criteria);

    // -----------------------------------------------------------------------
    // Steps 2a–2e: Answer analysis
    // For unstructured_doc: sequential inferWithClaude calls (few sections)
    // For question_form / structured_doc: Anthropic Batch API
    // -----------------------------------------------------------------------
    const answerUsageEvents: LogAiUsageParams[] = [];
    let allFreshAnalyses: AnswerAnalysis[] = [];

    if (freshContexts.length > 0) {
      if (isUnstructuredDoc) {
        // Sequential analysis for unstructured doc sections
        for (const ctx of freshContexts) {
          const { result, usage } = await inferWithClaude(
            step,
            `answer-analysis-${ctx.question_id}`,
            {
              prompt: buildAnswerAnalysisPrompt(ctx, null, isDraft),
              systemPrompt: answerSystemPrompt,
              schema: LenientAnswerAnalysisSchema,
              model: MODEL,
              maxTokens: 12288,
              temperature: 0,
            }
          );
          allFreshAnalyses.push({ ...result, question_id: ctx.question_id });
          answerUsageEvents.push({
            applicationReviewId: reviewId,
            userId,
            pipelineStep: "answer_analysis",
            model: MODEL,
            usage,
            isRetry: false,
          });
        }
      } else {
        // Step 2a: Submit batch
        const { batchId } = await step.run("submit-answer-batch", async () => {
          const requests: AnswerBatchRequest[] = freshContexts.map((ctx) => {
            const prevCtx = previousReview
              ? formatPreviousAnswerContext(
                  ctx.question_id,
                  previousReview.results,
                  answerChanges[ctx.question_id] ?? false,
                  previousReview.review_number + 1
                )
              : null;
            return {
              questionId: ctx.question_id,
              systemPrompt: answerSystemPrompt,
              userPrompt: buildAnswerAnalysisPrompt(ctx, prevCtx, isDraft),
            };
          });
          const result = await submitAnswerBatch(requests, MODEL, 12288, LenientAnswerAnalysisSchema, 0);
          await updateAppReviewProgress(reviewId, "analysing", {
            batch_submitted: Date.now(),
          });
          return result;
        });

        // Steps 2b: Poll every 30s until batch is complete (max 40 attempts = 20 min)
        let pollAttempt = 0;
        while (true) {
          await step.sleep(`poll-wait-${pollAttempt}`, "30s");
          const { done } = await step.run(`poll-batch-${pollAttempt}`, async () => {
            return pollBatch(batchId);
          });
          if (done) break;
          pollAttempt++;
          if (pollAttempt >= 40) {
            throw new NonRetriableError("Answer batch polling timeout after 20 minutes");
          }
        }

        // Step 2c: Parse batch results
        const batchResults = await step.run("parse-batch-results", async () => {
          return parseBatchResults(batchId, LenientAnswerAnalysisSchema);
        });

        // Collect successful analyses and usage
        for (const success of batchResults.successes) {
          allFreshAnalyses.push({ ...success.analysis, question_id: success.questionId });
          answerUsageEvents.push({
            applicationReviewId: reviewId,
            userId,
            pipelineStep: "answer_analysis",
            model: MODEL + "-batch",
            usage: success.usage,
            isRetry: false,
          });
        }

        // Step 2d: Real-time fallback for any failed batch answers
        for (const questionId of batchResults.failures) {
          const ctx = freshContexts.find((c) => c.question_id === questionId);
          if (!ctx) continue;
          const prevCtx = previousReview
            ? formatPreviousAnswerContext(
                questionId,
                previousReview.results,
                answerChanges[questionId] ?? false,
                previousReview.review_number + 1
              )
            : null;
          const { result, usage } = await inferWithClaude(
            step,
            `retry-answer-${questionId}`,
            {
              prompt: buildAnswerAnalysisPrompt(ctx, prevCtx, isDraft),
              systemPrompt: answerSystemPrompt,
              schema: LenientAnswerAnalysisSchema,
              model: MODEL,
              maxTokens: 12288,
              temperature: 0,
            }
          );
          allFreshAnalyses.push({ ...result, question_id: questionId });
          answerUsageEvents.push({
            applicationReviewId: reviewId,
            userId,
            pipelineStep: "answer_analysis",
            model: MODEL,
            usage,
            isRetry: true,
          });
        }
      }
    }

    const answerAnalyses: AnswerAnalysis[] = [...reusedAnalyses, ...allFreshAnalyses];

    // Build question list for cross-reference and scoring prompts.
    // For unstructured_doc, questions is empty — use answerContexts as the question list.
    const questionList = isUnstructuredDoc
      ? answerContexts.map((ctx) => ({ id: ctx.question_id, question: ctx.question_text }))
      : questions.map((q) => ({ id: q.id, question: q.question }));

    // -----------------------------------------------------------------------
    // Step 3: Cross-reference / Gap analysis
    // -----------------------------------------------------------------------
    let crossReference: CrossReference;
    let crossRefUsage: LogAiUsageParams;

    if (isShortDoc) {
      // Gap analysis replaces cross-reference for short docs
      await step.run("gap-analysis-started", async () => {
        await updateAppReviewProgress(reviewId, "cross_referencing", {
          crossref_started: Date.now(),
        });
        return { status: "Analysing document against criteria" };
      });

      const { systemPrompt: gapSystemPrompt, userPrompt: gapUserPrompt } =
        buildGapAnalysisPrompt(answerAnalyses[0] ?? null, criteria);

      const { result: gapResult, usage: gapUsageData } = await inferWithClaude(
        step,
        "gap-analysis",
        {
          prompt: gapUserPrompt,
          systemPrompt: gapSystemPrompt,
          schema: CrossReferenceSchema,
          model: "claude-haiku-4-5-20251001",
          maxTokens: 4096,
          temperature: 0,
        }
      );

      crossReference = gapResult;
      crossRefUsage = {
        applicationReviewId: reviewId,
        userId,
        pipelineStep: "gap_analysis",
        model: "claude-haiku-4-5-20251001",
        usage: gapUsageData,
        isRetry: false,
      };

      await step.run("gap-analysis-progress", async () => {
        await updateAppReviewProgress(reviewId, "cross_referencing", {
          crossref_completed: Date.now(),
        });
      });
    } else {
      // Full cross-reference for question_form, structured_doc, and long unstructured_doc
      await step.run("cross-reference-started", async () => {
        await updateAppReviewProgress(reviewId, "cross_referencing", {
          crossref_started: Date.now(),
        });
        return { status: "Cross-referencing answers against criteria" };
      });

      const { systemPrompt: crossRefSystemPrompt, userPrompt: crossRefUserPrompt } =
        buildApplicationCrossReferencePrompt(
          answerAnalyses,
          questionList,
          criteria,
          disabledQuestions,
          isUnstructuredDoc
            ? answerContexts.map((ctx) => ({
                question_id: ctx.question_id,
                answer_text: ctx.answer_text,
              }))
            : enabledAnswers.map((a) => ({
                question_id: a.question_id,
                answer_text: formatAnswerForCrossRef(a),
              })),
          isDraft
        );

      const { result: crossReferenceResult, usage: crossRefUsageData } = await inferWithClaude(
        step,
        "cross-reference",
        {
          prompt: crossRefUserPrompt,
          systemPrompt: crossRefSystemPrompt,
          schema: CrossReferenceSchema,
          model: MODEL,
          maxTokens: 16384,
          temperature: 0,
        }
      );

      crossReference = crossReferenceResult;
      crossRefUsage = {
        applicationReviewId: reviewId,
        userId,
        pipelineStep: "cross_reference",
        model: MODEL,
        usage: crossRefUsageData,
        isRetry: false,
      };

      await step.run("cross-reference-progress", async () => {
        await updateAppReviewProgress(reviewId, "cross_referencing", {
          crossref_completed: Date.now(),
        });
      });
    }

    // -----------------------------------------------------------------------
    // Compute gap_criteria server-side (no AI call)
    // -----------------------------------------------------------------------
    const coveredCriteriaIds = new Set<string>();
    for (const analysis of answerAnalyses) {
      for (const r of analysis.criteria_relevance) {
        if (r.relevance === "directly_addresses" || r.relevance === "partially_addresses") {
          coveredCriteriaIds.add(r.criterion_id);
        }
      }
    }

    const gapCriteria: GapCriterion[] = criteria
      .filter((c) => !coveredCriteriaIds.has(c.id))
      .map((c) => ({
        criterion_id: c.id,
        criterion: c.criterion,
        related_disabled_question_ids: [] as string[],
        related_disabled_question_texts: [] as string[],
      }));

    const crossReferenceWithGaps = { ...crossReference, gap_criteria: gapCriteria };

    // -----------------------------------------------------------------------
    // Post-processing: annotate per-answer weaknesses resolved by other answers
    // -----------------------------------------------------------------------
    annotateResolvedWeaknesses(answerAnalyses, crossReference);

    // -----------------------------------------------------------------------
    // Step 4: Scoring
    // -----------------------------------------------------------------------
    await step.run("scoring-started", async () => {
      await updateAppReviewProgress(reviewId, "scoring", {
        scoring_started: Date.now(),
      });
      return { status: "Scoring application against fund criteria" };
    });

    const prevOverallContext = previousReview
      ? formatPreviousOverallContext(previousReview.results, previousReview.review_number + 1)
      : null;

    const {
      systemPrompt: scoringSystemPrompt,
      userPrompt: scoringUserPrompt,
    } = buildApplicationScoringPrompt(
      answerAnalyses,
      crossReferenceWithGaps,
      questionList,
      criteria,
      overallWordLimit,
      disabledQuestions,
      prevOverallContext,
      isDraft
    );

    const { result: scoringRaw, usage: scoringUsageData } = await inferWithClaude(
      step,
      "scoring",
      {
        prompt: scoringUserPrompt,
        systemPrompt: scoringSystemPrompt,
        schema: ApplicationScoringSchema,
        model: MODEL,
        maxTokens: 16384,
        temperature: 0,
      }
    );

    const scoring: ApplicationScoring = scoringRaw;

    const scoringUsage: LogAiUsageParams = {
      applicationReviewId: reviewId,
      userId,
      pipelineStep: "scoring",
      model: MODEL,
      usage: scoringUsageData,
      isRetry: false,
    };

    await step.run("scoring-progress", async () => {
      await updateAppReviewProgress(reviewId, "scoring", {
        scoring_completed: Date.now(),
      });
    });

    // -----------------------------------------------------------------------
    // Post-processing: sanitize fabricated stats in example_language
    // -----------------------------------------------------------------------
    const answerTexts = enabledAnswers.map((a) => a.answer_text);
    const knownNumbers = extractKnownNumbers(answerTexts);
    const sanitizedScoring: ApplicationScoring = scoring.improvement_appendix
      ? { ...scoring, improvement_appendix: sanitizeExampleLanguage(scoring.improvement_appendix, knownNumbers) }
      : scoring;

    // -----------------------------------------------------------------------
    // Step 5: Save results
    // -----------------------------------------------------------------------
    await step.run("save-results", async () => {
      const supabase = createServiceClient();

      // Aggregate usage from all pipeline steps
      const allUsageEvents = [
        ...answerUsageEvents,
        ...(structureUsage ? [structureUsage] : []),
        crossRefUsage,
        scoringUsage,
      ];

      // Flush all usage log events
      if (allUsageEvents.length > 0) {
        await Promise.allSettled(allUsageEvents.map((e) => logAiUsage(e)));
      }

      // Compute aggregates from usage events
      let totalInputTokens = 0;
      let totalOutputTokens = 0;
      let totalCacheCreationTokens = 0;
      let totalCacheReadTokens = 0;
      let totalCostUsd = 0;
      let totalCostGbp = 0;

      for (const e of allUsageEvents) {
        totalInputTokens += e.usage.input_tokens;
        totalOutputTokens += e.usage.output_tokens;
        totalCacheCreationTokens += e.usage.cache_creation_input_tokens ?? 0;
        totalCacheReadTokens += e.usage.cache_read_input_tokens ?? 0;
      }

      // Recompute costs from the logged events' calculated values
      for (const e of allUsageEvents) {
        const { cost_usd, cost_gbp } = calculateCost(e.model, e.usage);
        totalCostUsd += cost_usd;
        totalCostGbp += cost_gbp;
      }

      // Compute projected score mechanically
      const gapCount = gapCriteria.length;
      const totalCriteriaCount = criteria.length;
      const projectedScore = computeProjectedScore(sanitizedScoring.overall_score, gapCount, totalCriteriaCount);

      // Save results JSONB to application_reviews
      const { error: resultsError } = await supabase
        .from("application_reviews")
        .update({
          status: "completed",
          total_input_tokens: totalInputTokens,
          total_output_tokens: totalOutputTokens,
          total_cache_creation_tokens: totalCacheCreationTokens,
          total_cache_read_tokens: totalCacheReadTokens,
          total_cost_usd: totalCostUsd,
          total_cost_gbp: totalCostGbp,
          results: {
            answer_feedback: Object.fromEntries(
              answerAnalyses.map((a) => [a.question_id, a])
            ),
            cross_reference: crossReferenceWithGaps,
            scoring: sanitizedScoring,
            projected_score: projectedScore,
            gap_count: gapCount,
            total_criteria_count: totalCriteriaCount,
            disabled_questions: disabledQuestions,
            answer_snapshot: enabledAnswers.map((a) => ({
              question_id: a.question_id,
              answer_text: a.answer_text,
              selected_options: a.selected_options ?? null,
            })),
            disabled_answer_ids: disabledQuestions.map((q) => q.question_id),
            // For unstructured_doc: persist section titles + content so the
            // review UI can display them (application_answers only has the raw document)
            ...(isUnstructuredDoc && {
              answer_contexts: answerContexts.map((ac) => ({
                question_id: ac.question_id,
                question_text: ac.question_text,
                answer_text: ac.answer_text,
              })),
            }),
          },
        })
        .eq("id", reviewId);

      if (resultsError) {
        throw new Error(`Failed to save review results: ${resultsError.message}`);
      }

      // Deduct credits based on actual cost
      const { calculateCreditsFromCost } = await import("@/lib/usage/calculate-credits");
      const { getUsagePeriod } = await import("@/lib/usage/period");
      const creditsToCharge = calculateCreditsFromCost(totalCostUsd);

      if (creditsToCharge > 0) {
        const { data: userProfile } = await supabase
          .from("profiles")
          .select("subscription_tier, current_period_end")
          .eq("id", userId)
          .single();

        const { periodKey } = getUsagePeriod(
          userProfile?.subscription_tier ?? "pro",
          userProfile?.current_period_end
        );

        await supabase.rpc("deduct_credits", {
          p_user_id: userId,
          p_review_id: reviewId,
          p_credits: creditsToCharge,
          p_period: periodKey,
        });
      }

      // Stamp last_reviewed_text on enabled answers only (skip disabled)
      await supabase.from("application_answers").upsert(
        enabledAnswers.map((a) => ({
          application_id: applicationId,
          question_id: a.question_id,
          answer_text: a.answer_text,
          last_reviewed_text: a.answer_text,
        })),
        { onConflict: "application_id,question_id" }
      );

      // Update application status to reviewed
      const { error: statusError } = await supabase
        .from("applications")
        .update({ status: "reviewed" })
        .eq("id", applicationId);

      if (statusError) {
        throw new Error(`Failed to update application status: ${statusError.message}`);
      }

      await updateAppReviewProgress(reviewId, "completed", {
        completed_at: Date.now(),
      });
    });

    return { applicationId, status: "completed", reviewId };
  }
);
