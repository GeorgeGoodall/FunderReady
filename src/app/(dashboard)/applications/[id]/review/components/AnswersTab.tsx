"use client";

import { useState } from "react";
import type { AnswerAnalysis } from "../types";
import { GOOD_SCORES } from "../constants";
import { AnswerFeedbackCard } from "./AnswerFeedbackCard";

export function AnswersTab({
  questions,
  answers,
  answerFeedback,
  outdatedMap,
  disabledQuestionIds,
  reviewId,
  applicationId,
  feedbackMap,
  onFeedbackChange,
}: {
  questions: Array<{ id: string; question: string; guidance?: string; word_count_max?: number; priority?: number }>;
  answers: Array<{ question_id: string; answer_text: string; last_reviewed_text: string | null; is_disabled?: boolean | null }>;
  answerFeedback: Record<string, AnswerAnalysis>;
  outdatedMap: Record<string, boolean>;
  disabledQuestionIds: Set<string>;
  reviewId?: string;
  applicationId?: string;
  feedbackMap?: Record<string, "up" | "down">;
  onFeedbackChange?: (itemPath: string, sentiment: "up" | "down" | null) => void;
}) {
  const [filter, setFilter] = useState<"all" | "needs-attention">("needs-attention");

  // Count how many answers are "good" (Excellent or Strong)
  const goodCount = questions.filter((q) => {
    if (disabledQuestionIds.has(q.id)) return false;
    const fb = answerFeedback[q.id];
    return fb && GOOD_SCORES.has(fb.answer_score);
  }).length;

  const needsAttentionCount = questions.filter((q) => {
    if (disabledQuestionIds.has(q.id)) return false;
    const fb = answerFeedback[q.id];
    return fb && !GOOD_SCORES.has(fb.answer_score);
  }).length;

  return (
    <div className="space-y-4">
      {/* Filter toggle */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setFilter("all")}
          className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
            filter === "all"
              ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
              : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
          }`}
        >
          Show all
        </button>
        <button
          type="button"
          onClick={() => setFilter("needs-attention")}
          className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
            filter === "needs-attention"
              ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
              : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
          }`}
        >
          Needs attention{needsAttentionCount > 0 && ` (${needsAttentionCount})`}
        </button>
      </div>

      {/* Hidden answers banner */}
      {filter === "needs-attention" && goodCount > 0 && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-2.5 dark:border-green-900/30 dark:bg-green-900/10">
          <p className="text-sm text-green-700 dark:text-green-400">
            {goodCount} answer{goodCount === 1 ? "" : "s"} looking good — hidden.{" "}
            <button
              type="button"
              onClick={() => setFilter("all")}
              className="font-medium underline underline-offset-2"
            >
              Show all
            </button>
          </p>
        </div>
      )}

      {/* Answer cards (enabled questions) */}
      {questions.map((q, qIndex) => {
        if (disabledQuestionIds.has(q.id)) return null;
        const feedback = answerFeedback[q.id];
        if (!feedback) return null;

        // Apply filter
        if (filter === "needs-attention" && GOOD_SCORES.has(feedback.answer_score)) {
          return null;
        }

        const answer = answers.find((a) => a.question_id === q.id);
        const isOutdated = outdatedMap[q.id] ?? false;

        return (
          <AnswerFeedbackCard
            key={q.id}
            questionNumber={qIndex + 1}
            question={q}
            answer={answer?.last_reviewed_text ?? answer?.answer_text ?? ""}
            feedback={feedback}
            isOutdated={isOutdated}
            reviewId={reviewId}
            applicationId={applicationId}
            feedbackMap={feedbackMap}
            onFeedbackChange={onFeedbackChange}
          />
        );
      })}

      {/* N/A questions — grouped at bottom */}
      {disabledQuestionIds.size > 0 && (
        <div className="space-y-2 pt-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">Not reviewed</h4>
          {questions.map((q, qIndex) => {
            if (!disabledQuestionIds.has(q.id)) return null;
            return (
              <div key={q.id} className="flex items-center gap-3 rounded-lg border border-zinc-200 bg-zinc-50 px-5 py-3 dark:border-zinc-800 dark:bg-zinc-900/50">
                <span className="shrink-0 rounded-full bg-zinc-200 px-2 py-0.5 text-xs font-medium text-zinc-500 dark:bg-zinc-700 dark:text-zinc-400">
                  N/A
                </span>
                <span className="text-sm text-zinc-400 dark:text-zinc-500">
                  <span className="text-zinc-300 dark:text-zinc-600">{qIndex + 1}.</span> {q.question}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
