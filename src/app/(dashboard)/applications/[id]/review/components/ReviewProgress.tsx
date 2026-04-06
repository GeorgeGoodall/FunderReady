import { ReviewCard } from "./ReviewCard";
import { safeNumber } from "../types";
import { PIPELINE_STEPS } from "../constants";

interface ReviewProgressProps {
  review: { status: string; progress: unknown };
  cancellingReview: boolean;
  showCancelConfirm: boolean;
  onCancel: () => void;
  isAdminView?: boolean;
}

export function ReviewProgress({
  review,
  cancellingReview,
  showCancelConfirm,
  onCancel,
  isAdminView = false,
}: ReviewProgressProps) {
  const currentIndex = PIPELINE_STEPS.findIndex((s) => s.key === review.status);
  const progress = review.progress as Record<string, unknown> | null;
  const answersCompleted = safeNumber(progress?.answers_completed);
  const answersTotal = safeNumber(progress?.answers_total);

  return (
    <ReviewCard variant="neutral">
      <h2 className="font-semibold">Review in progress</h2>
      <p className="mt-1 text-sm text-zinc-500">This page updates automatically — no need to keep it open.</p>
      <p className="mt-1 text-sm text-zinc-500">Reviews can take 10–30 minutes, so feel free to go make a cuppa and come back when you&apos;re ready.</p>

      <div className="mt-6 space-y-3">
        {PIPELINE_STEPS.map((step, i) => {
          const isCurrent = i === currentIndex;
          const isDone = i < currentIndex;
          const isPending = i > currentIndex;

          return (
            <div key={step.key} className="flex items-center gap-3">
              {isDone && (
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
                  <svg className="h-3.5 w-3.5 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" aria-hidden="true">
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

      {!isAdminView && (
        <div className="mt-6 border-t border-zinc-100 pt-4 dark:border-zinc-800">
          {review.status === "pending" ? (
            <button
              type="button"
              onClick={onCancel}
              disabled={cancellingReview}
              className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
            >
              {cancellingReview
                ? "Cancelling..."
                : showCancelConfirm
                  ? "Are you sure? Click to confirm"
                  : "Cancel review"}
            </button>
          ) : (
            <button
              type="button"
              disabled
              title="Reviews can't be cancelled once started"
              className="cursor-not-allowed rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-400 opacity-50 dark:border-zinc-800 dark:text-zinc-600"
            >
              Cancel review
            </button>
          )}
        </div>
      )}
    </ReviewCard>
  );
}
