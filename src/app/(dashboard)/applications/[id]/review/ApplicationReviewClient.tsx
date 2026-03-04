"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { ApplicationReviewClientProps, TabId } from "./types";
import { safeNumber, parseReviewResults } from "./types";
import { PIPELINE_STEPS, GOOD_SCORES } from "./constants";
import { Header } from "./components/Header";
import { TabBar } from "./components/TabBar";
import { SummaryTab } from "./components/SummaryTab";
import { AnswersTab } from "./components/AnswersTab";
import { CrossReferenceTab } from "./components/CrossReferenceTab";
import { NewReviewButton } from "@/components/CreateDraftButton";

export function ApplicationReviewClient({
  application,
  fund,
  questions,
  criteria,
  answers,
  review,
  isHistorical = false,
  defaultTab = "summary",
  initialFeedback = {},
}: ApplicationReviewClientProps) {
  const router = useRouter();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>(defaultTab);
  const [feedbackMap, setFeedbackMap] = useState<Record<string, "up" | "down">>(initialFeedback);

  const handleFeedbackChange = (itemPath: string, sentiment: "up" | "down" | null) => {
    setFeedbackMap((prev) => {
      const next = { ...prev };
      if (sentiment === null) {
        delete next[itemPath];
      } else {
        next[itemPath] = sentiment;
      }
      return next;
    });
  };

  const isInProgress = !isHistorical && review && review.status !== "completed" && review.status !== "failed";

  // Poll for updates while in progress
  useEffect(() => {
    if (isInProgress) {
      intervalRef.current = setInterval(() => {
        router.refresh();
      }, 3000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isInProgress, router]);

  // Lookup maps for reference tags
  const questionMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const q of questions) map.set(q.id, q.question);
    return map;
  }, [questions]);

  const criteriaMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of criteria) map.set(c.id, c.criterion);
    return map;
  }, [criteria]);

  // No review yet
  if (!review) {
    return (
      <div className="space-y-4">
        <Header application={application} fund={fund} />
        <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-sm text-zinc-500">No review has been submitted yet.</p>
        </div>
        <Link
          href={`/applications/${application.id}`}
          className="inline-block text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
        >
          &larr; Back to application
        </Link>
      </div>
    );
  }

  // Failed
  if (review.status === "failed") {
    return (
      <div className="space-y-4">
        <Header application={application} fund={fund} submittedAt={review?.created_at} />
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 dark:border-red-900 dark:bg-red-900/20">
          <h2 className="font-semibold text-red-700 dark:text-red-400">Review Failed</h2>
          <p className="mt-2 text-sm text-red-600 dark:text-red-400">
            {review.error_message ?? "An unexpected error occurred."}
          </p>
        </div>
        <Link
          href={`/applications/${application.id}`}
          className="inline-block rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
        >
          Edit & Retry
        </Link>
      </div>
    );
  }

  // In progress
  if (isInProgress) {
    const currentIndex = PIPELINE_STEPS.findIndex((s) => s.key === review.status);
    const answersCompleted = safeNumber(review.progress?.answers_completed);
    const answersTotal = safeNumber(review.progress?.answers_total);

    return (
      <div className="space-y-6">
        <Header application={application} fund={fund} submittedAt={review?.created_at} />
        <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="font-semibold">Review in progress</h2>
          <p className="mt-1 text-sm text-zinc-500">This page updates automatically.</p>

          <div className="mt-6 space-y-3">
            {PIPELINE_STEPS.map((step, i) => {
              const isCurrent = i === currentIndex;
              const isDone = i < currentIndex;
              const isPending = i > currentIndex;

              return (
                <div key={step.key} className="flex items-center gap-3">
                  {isDone && (
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
                      <svg className="h-3.5 w-3.5 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                      </svg>
                    </span>
                  )}
                  {isCurrent && (
                    <span className="flex h-6 w-6 items-center justify-center">
                      <span className="h-3 w-3 animate-pulse rounded-full bg-blue-500" />
                    </span>
                  )}
                  {isPending && (
                    <span className="flex h-6 w-6 items-center justify-center">
                      <span className="h-2 w-2 rounded-full bg-zinc-300 dark:bg-zinc-600" />
                    </span>
                  )}
                  <span className={`text-sm ${isCurrent ? "font-medium text-blue-600 dark:text-blue-400" : isDone ? "text-zinc-500" : "text-zinc-400 dark:text-zinc-500"}`}>
                    {step.label}
                    {isCurrent && review.status === "analysing" && answersTotal > 0 && ` (${answersCompleted}/${answersTotal})`}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // Completed — show results
  const results = parseReviewResults(review.results);
  if (!results?.scoring) {
    return (
      <div className="space-y-4">
        <Header application={application} fund={fund} submittedAt={review?.created_at} />
        <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-sm text-zinc-500">Review completed but results are unavailable.</p>
        </div>
      </div>
    );
  }

  const { scoring, answer_feedback, cross_reference, projected_score, gap_count, disabled_questions } = results;
  const gapCriteria = cross_reference?.gap_criteria ?? [];

  // Build outdated map (only for enabled questions)
  const outdatedMap: Record<string, boolean> = {};
  for (const a of answers) {
    if (a.is_disabled) continue;
    outdatedMap[a.question_id] =
      a.last_reviewed_text !== null &&
      a.last_reviewed_text !== undefined &&
      a.answer_text !== a.last_reviewed_text;
  }

  // Set of disabled question IDs
  const disabledQuestionIds = new Set(
    (disabled_questions ?? []).map((q) => q.question_id)
  );

  // Compute badge counts
  const answersNeedAttention = questions.filter((q) => {
    if (disabledQuestionIds.has(q.id)) return false;
    const fb = answer_feedback?.[q.id];
    return fb && !GOOD_SCORES.has(fb.answer_score);
  }).length;

  const crossRefCount = (cross_reference?.findings?.length ?? 0) + gapCriteria.length;

  const tabs = [
    { id: "summary" as TabId, label: "Summary" },
    { id: "answers" as TabId, label: "Answers", badge: answersNeedAttention },
    { id: "cross-ref" as TabId, label: "Cross-Reference", badge: crossRefCount },
  ];

  return (
    <div className="space-y-6">
      <Header application={application} fund={fund} submittedAt={review?.created_at} />

      {/* AI disclaimer */}
      <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-800/50">
        <p className="text-xs italic text-zinc-500 dark:text-zinc-400">
          This review was generated by AI using FunderReady. It is intended as a guidance tool and does not constitute professional advice. AI-generated feedback may contain inaccuracies — always have a qualified person review your bid before submission. FunderReady accepts no liability for funding outcomes.
        </p>
      </div>

      {/* Historical review banner */}
      {isHistorical && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/30 dark:bg-amber-900/10 dark:text-amber-300">
          <span>
            You are viewing Review #{review.review_number} (historical).{" "}
            <Link
              href={`/applications/${application.id}/review`}
              className="font-medium underline underline-offset-2"
            >
              View latest review
            </Link>
          </span>
          <NewReviewButton
            applicationId={application.id}
            className="rounded-lg border border-amber-400 bg-amber-100 px-3 py-1.5 text-xs font-medium text-amber-900 transition-colors hover:bg-amber-200 disabled:opacity-60 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-300 dark:hover:bg-amber-900/40"
          />
        </div>
      )}

      {/* Tab bar */}
      <TabBar tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />

      {/* Active tab content */}
      <div>
        {activeTab === "summary" && (
          <SummaryTab
            applicationId={application.id}
            scoring={scoring}
            projected_score={projected_score}
            gap_count={gap_count}
            questionMap={questionMap}
            criteriaMap={criteriaMap}
            reviewId={review.id}
            feedbackMap={feedbackMap}
            onFeedbackChange={handleFeedbackChange}
          />
        )}

        {activeTab === "answers" && (
          <AnswersTab
            questions={questions}
            answers={answers}
            answerFeedback={answer_feedback}
            outdatedMap={outdatedMap}
            disabledQuestionIds={disabledQuestionIds}
            reviewId={review.id}
            applicationId={application.id}
            feedbackMap={feedbackMap}
            onFeedbackChange={handleFeedbackChange}
          />
        )}

        {activeTab === "cross-ref" && (
          <CrossReferenceTab
            crossReference={cross_reference}
            questionMap={questionMap}
            criteriaMap={criteriaMap}
            reviewId={review.id}
            applicationId={application.id}
            feedbackMap={feedbackMap}
            onFeedbackChange={handleFeedbackChange}
          />
        )}
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-3 border-t border-zinc-200 pt-6 dark:border-zinc-800">
        <Link
          href={`/applications/${application.id}`}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
        >
          Edit Current Draft
        </Link>
        {isHistorical && (
          <NewReviewButton
            applicationId={application.id}
            className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          />
        )}
        {application.review_count > 1 && (
          <Link
            href={`/applications/${application.id}/history`}
            className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Review History
          </Link>
        )}
        <Link
          href="/dashboard"
          className="text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
        >
          Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
