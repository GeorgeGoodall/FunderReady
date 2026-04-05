"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { ApplicationReviewClientProps, TabId } from "./types";
import { parseReviewResults } from "./types";
import { GOOD_SCORES } from "./constants";
import { Header } from "./components/Header";
import { TabBar } from "./components/TabBar";
import { SummaryTab } from "./components/SummaryTab";
import { AnswersTab } from "./components/AnswersTab";
import { CrossReferenceTab } from "./components/CrossReferenceTab";
import { NewReviewButton } from "@/components/NewReviewButton";
import { ReviewFailed } from "./components/ReviewFailed";
import { ReviewProgress } from "./components/ReviewProgress";
import { useAnimateOnView } from "./hooks/useAnimateOnView";
import { ANIMATE_ON_VIEW_THRESHOLD } from "./constants";

function FadeInSection({
  children,
  delay = 0,
}: {
  children: React.ReactNode;
  delay?: number;
}) {
  const { ref, isVisible } = useAnimateOnView(ANIMATE_ON_VIEW_THRESHOLD);
  return (
    <div
      ref={ref}
      className="transition-all duration-500 ease-out"
      style={{
        opacity: isVisible ? 1 : 0,
        transform: isVisible ? "translateY(0)" : "translateY(16px)",
        transitionDelay: `${delay}ms`,
      }}
    >
      {children}
    </div>
  );
}

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
  const [cancellingReview, setCancellingReview] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

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

  const handleCancelReview = async () => {
    if (!showCancelConfirm) {
      setShowCancelConfirm(true);
      return;
    }
    setShowCancelConfirm(false);
    setCancellingReview(true);
    try {
      const res = await fetch(`/api/applications/${application.id}/cancel-review`, {
        method: "POST",
      });
      if (res.ok) {
        router.push(`/applications/${application.id}`);
      }
    } catch {
      // ignore — button will re-enable
    } finally {
      setCancellingReview(false);
    }
  };

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
        <ReviewFailed review={review} application={application} />
      </div>
    );
  }

  // In progress
  if (isInProgress) {
    return (
      <div className="space-y-6">
        <Header application={application} fund={fund} submittedAt={review?.created_at} />
        <ReviewProgress
          review={review}
          cancellingReview={cancellingReview}
          showCancelConfirm={showCancelConfirm}
          onCancel={handleCancelReview}
        />
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
      <FadeInSection delay={0}>
        <Header application={application} fund={fund} submittedAt={review?.created_at} />
      </FadeInSection>

      <FadeInSection delay={50}>
        {/* AI disclaimer */}
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-800/50">
          <p className="text-xs italic text-zinc-500 dark:text-zinc-400">
            This review was generated by AI using FunderReady. It is intended as a guidance tool and does not constitute professional advice. AI-generated feedback may contain inaccuracies — always have a qualified person review your bid before submission. FunderReady accepts no liability for funding outcomes.
          </p>
        </div>
      </FadeInSection>

      {/* Historical review banner */}
      {isHistorical && (
        <FadeInSection delay={100}>
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
        </FadeInSection>
      )}

      <FadeInSection delay={100}>
        {/* Tab bar */}
        <TabBar tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />
      </FadeInSection>

      <FadeInSection delay={150}>
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
              isDraft={review?.is_draft ?? false}
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
      </FadeInSection>

      <FadeInSection delay={200}>
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
      </FadeInSection>
    </div>
  );
}
