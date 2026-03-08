/**
 * Inngest function for reviewing form-based applications.
 * Event: application/review-requested
 *
 * Pipeline: load → answer analysis (per question) → cross-reference → scoring → save results
 */

import { NonRetriableError } from "inngest";
import { inngest } from "./client";
import { createServiceClient } from "@/lib/supabase/server";
import { callClaude, type ClaudeUsageData } from "@/lib/ai/anthropic";
import { logAiUsage, type LogAiUsageParams } from "@/lib/ai/log-usage";
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
  type AnswerContext,
} from "@/lib/pipeline/application-prompts";
import type { Criterion } from "@/lib/pipeline/prompt-templates";
import type { ImprovementAppendixItem } from "@/lib/pipeline/schemas";
import { calculateCost } from "@/lib/ai/pricing";
import { z } from "zod";

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
 * Renders selected_options into readable text for radio_other, checkbox_other, and checkbox types.
 */
function formatAnswerForCrossRef(a: {
  answer_text: string;
  selected_options?: string[] | null;
  field_type?: string | null;
}): string {
  const ft = a.field_type ?? "";
  if (ft === "radio_other") {
    if (a.selected_options?.includes("Other") && a.answer_text) {
      return `Selected: Other\nOther text: ${a.answer_text}`;
    }
    const nonOther = (a.selected_options ?? []).filter((s) => s !== "Other");
    if (nonOther.length > 0) return `Selected: ${nonOther.join(", ")}`;
    return a.answer_text;
  }
  if (ft === "checkbox_other") {
    const nonOther = (a.selected_options ?? []).filter((s) => s !== "Other");
    const parts: string[] = [];
    if (nonOther.length > 0) parts.push(`Selected: ${nonOther.join(", ")}`);
    if (a.selected_options?.includes("Other") && a.answer_text) parts.push(`Other text: ${a.answer_text}`);
    return parts.join("\n") || a.answer_text;
  }
  if (ft === "checkbox" && Array.isArray(a.selected_options) && a.selected_options.length > 0) {
    return `Selected: ${a.selected_options.join(", ")}`;
  }
  return a.answer_text;
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

      // Load questions
      const { data: questionsSet } = await supabase
        .from("questions_sets")
        .select("questions_json, overall_word_limit")
        .eq("id", app.questions_set_id)
        .eq("rejected", false)
        .single();

      if (!questionsSet?.questions_json) {
        throw new NonRetriableError("Questions set not found or empty");
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

      const questions = questionsSet.questions_json as unknown as Array<{
        id: string;
        question: string;
        word_count_min?: number;
        word_count_max?: number;
        guidance?: string;
        priority?: number;
        field_type?: string;
      }>;

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

      return {
        title: app.title,
        criteria: criteriaSet.criteria_json as unknown as Criterion[],
        questions,
        overallWordLimit: questionsSet.overall_word_limit ?? undefined,
        enabledAnswers,
        disabledQuestions,
        previousReview: previousReviewContext,
        answerChanges,
        reusableAnalyses,
      };
    });

    const { criteria, questions, enabledAnswers, disabledQuestions, overallWordLimit, previousReview, answerChanges, reusableAnalyses } = appData;

    // Build answer contexts from enabled answers only
    const answerContexts: AnswerContext[] = [];
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

    // -----------------------------------------------------------------------
    // Step 2: Answer analysis (parallel Claude calls inside a single step)
    //
    // Runs up to MAX_CONCURRENT analyses at a time to stay within API rate
    // limits (Tier 1: 50 RPM, 8k OTPM). If any fail transiently we retry
    // only the failures (up to 2 retries) to avoid re-spending tokens on
    // calls that already succeeded.
    // -----------------------------------------------------------------------
    const MAX_CONCURRENT = 5;

    const answerAnalysisResult = await step.run(
      "answer-analyses",
      async () => {
        const stepUsage: LogAiUsageParams[] = [];

        // Split into fresh (need Claude) and reusable (pull from previous review)
        const freshContexts: AnswerContext[] = [];
        const reusedAnalyses: AnswerAnalysis[] = [];

        for (const ctx of answerContexts) {
          const cached = reusableAnalyses[ctx.question_id];
          if (cached) {
            reusedAnalyses.push(cached);
          } else {
            freshContexts.push(ctx);
          }
        }

        const systemPrompt = buildAnswerAnalysisSystemPrompt(criteria);

        const analyseAnswer = (ctx: AnswerContext) => {
          // Build previous context for feedback evolution (re-reviews)
          const prevContext = previousReview
            ? formatPreviousAnswerContext(
                ctx.question_id,
                previousReview.results,
                answerChanges[ctx.question_id] ?? false,
                previousReview.review_number + 1
              )
            : null;
          const prompt = buildAnswerAnalysisPrompt(ctx, prevContext, isDraft);
          return callClaude({
            prompt,
            systemPrompt,
            schema: LenientAnswerAnalysisSchema,
            model: MODEL,
            maxTokens: 12288,
            temperature: 0,
            onUsage: (usage: ClaudeUsageData, isRetry: boolean) => {
              stepUsage.push({
                applicationReviewId: reviewId,
                userId,
                pipelineStep: "answer_analysis",
                model: MODEL,
                usage,
                isRetry,
              });
            },
          });
        };

        // Run in batches of MAX_CONCURRENT to respect rate limits
        async function runBatched(
          contexts: AnswerContext[]
        ): Promise<PromiseSettledResult<AnswerAnalysis>[]> {
          const results: PromiseSettledResult<AnswerAnalysis>[] = [];
          for (let i = 0; i < contexts.length; i += MAX_CONCURRENT) {
            const batch = contexts.slice(i, i + MAX_CONCURRENT);
            const batchResults = await Promise.allSettled(
              batch.map((ctx) => analyseAnswer(ctx))
            );
            results.push(...batchResults);
          }
          return results;
        }

        // First pass (only fresh answers need Claude calls)
        let settled = freshContexts.length > 0
          ? await runBatched(freshContexts)
          : [];

        // Retry only failures (up to 2 additional attempts)
        for (let attempt = 0; attempt < 2; attempt++) {
          const failedIndices = settled
            .map((r, i) => (r.status === "rejected" ? i : -1))
            .filter((i) => i !== -1);
          if (failedIndices.length === 0) break;

          // Exponential backoff before retrying (2s, then 8s)
          await new Promise((resolve) => setTimeout(resolve, Math.pow(2, attempt + 1) * 1000));

          const retryContexts = failedIndices.map((i) => freshContexts[i]);
          const retryResults = await runBatched(retryContexts);

          // Merge retry results back into settled
          failedIndices.forEach((originalIdx, retryIdx) => {
            settled[originalIdx] = retryResults[retryIdx];
          });
        }

        // Collect results — throw on any remaining failures
        const freshAnalyses = settled.map((result) => {
          if (result.status === "fulfilled") return result.value;
          throw result.reason;
        });

        // Merge: reused analyses + fresh analyses
        const analyses = [...reusedAnalyses, ...freshAnalyses];

        return { analyses, usage: stepUsage };
      }
    );

    const answerAnalyses = answerAnalysisResult.analyses;

    // -----------------------------------------------------------------------
    // Step 3: Cross-reference
    // -----------------------------------------------------------------------
    await step.run("cross-reference-started", async () => {
      await updateAppReviewProgress(reviewId, "cross_referencing", {
        crossref_started: Date.now(),
      });
      return { status: "Cross-referencing answers against criteria" };
    });

    const crossRefResult = await step.run("cross-reference", async () => {
      const stepUsage: LogAiUsageParams[] = [];
      const { systemPrompt, userPrompt } = buildApplicationCrossReferencePrompt(
        answerAnalyses,
        questions.map((q) => ({ id: q.id, question: q.question })),
        criteria,
        disabledQuestions,
        enabledAnswers.map((a) => ({ question_id: a.question_id, answer_text: formatAnswerForCrossRef(a) })),
        isDraft
      );

      const result = await callClaude({
        prompt: userPrompt,
        systemPrompt,
        schema: CrossReferenceSchema,
        model: MODEL,
        maxTokens: 16384,
        temperature: 0,
        onUsage: (usage: ClaudeUsageData, isRetry: boolean) => {
          stepUsage.push({
            applicationReviewId: reviewId,
            userId,
            pipelineStep: "cross_reference",
            model: MODEL,
            usage,
            isRetry,
          });
        },
      });

      await updateAppReviewProgress(reviewId, "cross_referencing", {
        crossref_completed: Date.now(),
      });

      return { result, usage: stepUsage };
    });

    const crossReference: CrossReference = crossRefResult.result;

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

    const scoringResult = await step.run("scoring", async () => {
      const stepUsage: LogAiUsageParams[] = [];
      // Build previous overall context for feedback evolution
      const prevOverallContext = previousReview
        ? formatPreviousOverallContext(previousReview.results, previousReview.review_number + 1)
        : null;
      const { systemPrompt: scoringSystemPrompt, userPrompt: scoringUserPrompt } = buildApplicationScoringPrompt(
        answerAnalyses,
        crossReferenceWithGaps,
        questions.map((q) => ({ id: q.id, question: q.question })),
        criteria,
        overallWordLimit,
        disabledQuestions,
        prevOverallContext,
        isDraft
      );

      const result = await callClaude({
        prompt: scoringUserPrompt,
        systemPrompt: scoringSystemPrompt,
        schema: ApplicationScoringSchema,
        model: MODEL,
        maxTokens: 16384,
        temperature: 0,
        onUsage: (usage: ClaudeUsageData, isRetry: boolean) => {
          stepUsage.push({
            applicationReviewId: reviewId,
            userId,
            pipelineStep: "scoring",
            model: MODEL,
            usage,
            isRetry,
          });
        },
      });

      await updateAppReviewProgress(reviewId, "scoring", {
        scoring_completed: Date.now(),
      });

      return { result, usage: stepUsage };
    });

    const scoring: ApplicationScoring = scoringResult.result;

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
        ...answerAnalysisResult.usage,
        ...crossRefResult.usage,
        ...scoringResult.usage,
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
