/**
 * Inngest function for reviewing form-based applications.
 * Event: application/review-requested
 *
 * Pipeline: load → answer analysis (per question) → cross-reference → scoring → save results
 */

import { NonRetriableError } from "inngest";
import { inngest } from "./client";
import { createServiceClient } from "@/lib/supabase/server";
import { callClaude } from "@/lib/ai/anthropic";
import {
  AnswerAnalysisSchema,
  CrossReferenceSchema,
  ApplicationScoringSchema,
  type AnswerAnalysis,
  type CrossReference,
  type ApplicationScoring,
} from "@/lib/pipeline/schemas";
import {
  buildAnswerAnalysisSystemPrompt,
  buildAnswerAnalysisPrompt,
  buildApplicationCrossReferencePrompt,
  buildApplicationScoringPrompt,
  type AnswerContext,
} from "@/lib/pipeline/application-prompts";
import type { Criterion } from "@/lib/pipeline/prompt-templates";
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
  const obj = raw as Record<string, unknown>;
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
// Pipeline function
// ---------------------------------------------------------------------------

export const applicationReviewRequested = inngest.createFunction(
  {
    id: "application-review-requested",
    concurrency: { key: "event.data.userId", limit: 1 },
    retries: 3,
    onFailure: async ({ event }) => {
      const { applicationId, reviewId } = event.data.event.data;
      if (applicationId && reviewId) {
        await markAppReviewFailed(
          reviewId,
          applicationId,
          "The review pipeline encountered an unexpected error. Please try again."
        );
      }
    },
  },
  { event: "application/review-requested" },
  async ({ event, step }) => {
    const { applicationId, reviewId, userId } = event.data;

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

      // Load answers
      const { data: answers, error: answersError } = await supabase
        .from("application_answers")
        .select("question_id, answer_text, field_type, selected_options")
        .eq("application_id", applicationId);

      if (answersError) {
        throw new NonRetriableError(`Failed to load answers: ${answersError.message}`);
      }

      // Load criteria
      const { data: criteriaSet } = await supabase
        .from("criteria_sets")
        .select("criteria_json")
        .eq("id", app.criteria_set_id)
        .single();

      if (!criteriaSet?.criteria_json) {
        throw new NonRetriableError("Criteria set not found or empty");
      }

      // Load questions
      const { data: questionsSet } = await supabase
        .from("questions_sets")
        .select("questions_json, overall_word_limit")
        .eq("id", app.questions_set_id)
        .single();

      if (!questionsSet?.questions_json) {
        throw new NonRetriableError("Questions set not found or empty");
      }

      // Mark application as actively reviewing
      await supabase
        .from("applications")
        .update({ status: "reviewing" })
        .eq("id", applicationId);

      await updateAppReviewProgress(reviewId, "analysing", {
        load_completed: Date.now(),
      });

      return {
        title: app.title,
        criteria: criteriaSet.criteria_json as unknown as Criterion[],
        questions: questionsSet.questions_json as unknown as Array<{
          id: string;
          question: string;
          word_count_min?: number;
          word_count_max?: number;
          guidance?: string;
          priority?: number;
          field_type?: string;
        }>,
        overallWordLimit: questionsSet.overall_word_limit ?? undefined,
        answers: (answers ?? []).filter((a) => a.answer_text.trim().length > 0),
      };
    });

    const { criteria, questions, answers, overallWordLimit } = appData;

    // Build answer contexts
    const answerContexts: AnswerContext[] = [];
    for (const a of answers) {
      const q = questions.find((q) => q.id === a.question_id);
      if (!q) continue;
      answerContexts.push({
        question_id: a.question_id,
        question_text: q.question,
        answer_text: a.answer_text,
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
    // Step 2: Answer analysis (sequential, per non-empty answer)
    // -----------------------------------------------------------------------
    const answerAnalyses: AnswerAnalysis[] = [];
    const systemPrompt = buildAnswerAnalysisSystemPrompt(criteria);
    const otherQuestionTitles = questions.map((q) => q.question);

    for (let i = 0; i < answerContexts.length; i++) {
      const ctx = answerContexts[i];

      const analysis = await step.run(
        `answer-analysis-${ctx.question_id}`,
        async () => {
          await updateAppReviewProgress(reviewId, "analysing", {
            current_answer: ctx.question_id,
            answers_completed: i,
            answers_total: answerContexts.length,
          });

          // Exclude current question from "other questions" list
          const otherTitles = otherQuestionTitles.filter(
            (_, idx) => questions[idx].id !== ctx.question_id
          );

          const prompt = buildAnswerAnalysisPrompt(ctx, otherTitles);
          const result = await callClaude({
            prompt,
            systemPrompt,
            schema: LenientAnswerAnalysisSchema,
            model: MODEL,
            maxTokens: 8192,
          });

          return result;
        }
      );

      answerAnalyses.push(analysis);
    }

    // -----------------------------------------------------------------------
    // Step 3: Cross-reference
    // -----------------------------------------------------------------------
    await step.run("cross-reference-progress", async () => {
      await updateAppReviewProgress(reviewId, "cross_referencing", {
        crossref_started: Date.now(),
        answers_completed: answerContexts.length,
        answers_total: answerContexts.length,
      });
    });

    const crossReference: CrossReference = await step.run("cross-reference", async () => {
      const prompt = buildApplicationCrossReferencePrompt(
        answerAnalyses,
        questions.map((q) => ({ id: q.id, question: q.question })),
        criteria
      );

      const result = await callClaude({
        prompt,
        schema: CrossReferenceSchema,
        model: MODEL,
        maxTokens: 16384,
      });

      await updateAppReviewProgress(reviewId, "cross_referencing", {
        crossref_completed: Date.now(),
      });

      return result;
    });

    // -----------------------------------------------------------------------
    // Step 4: Scoring
    // -----------------------------------------------------------------------
    await step.run("scoring-progress", async () => {
      await updateAppReviewProgress(reviewId, "scoring", {
        scoring_started: Date.now(),
      });
    });

    const scoring: ApplicationScoring = await step.run("scoring", async () => {
      const prompt = buildApplicationScoringPrompt(
        answerAnalyses,
        crossReference,
        questions.map((q) => ({ id: q.id, question: q.question })),
        criteria,
        overallWordLimit
      );

      const result = await callClaude({
        prompt,
        schema: ApplicationScoringSchema,
        model: MODEL,
        maxTokens: 16384,
      });

      await updateAppReviewProgress(reviewId, "scoring", {
        scoring_completed: Date.now(),
      });

      return result;
    });

    // -----------------------------------------------------------------------
    // Step 5: Save results
    // -----------------------------------------------------------------------
    await step.run("save-results", async () => {
      const supabase = createServiceClient();

      // Save results JSONB to application_reviews
      const { error: resultsError } = await supabase
        .from("application_reviews")
        .update({
          status: "completed",
          results: {
            answer_feedback: Object.fromEntries(
              answerAnalyses.map((a) => [a.question_id, a])
            ),
            cross_reference: crossReference,
            scoring,
          },
        })
        .eq("id", reviewId);

      if (resultsError) {
        throw new Error(`Failed to save review results: ${resultsError.message}`);
      }

      // Stamp last_reviewed_text on all answers
      for (const answer of answers) {
        await supabase
          .from("application_answers")
          .update({ last_reviewed_text: answer.answer_text })
          .eq("application_id", applicationId)
          .eq("question_id", answer.question_id);
      }

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
