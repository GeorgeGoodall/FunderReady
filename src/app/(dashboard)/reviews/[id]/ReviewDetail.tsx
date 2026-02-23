"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Scoring, CriterionScore } from "@/lib/pipeline/schemas";

interface ReviewDetailProps {
  review: {
    id: string;
    status: string;
    bid_file_name: string;
    output_file_path: string | null;
    error_message: string | null;
  };
  progress: Record<string, unknown> | null;
  results: Record<string, unknown> | null;
}

const PIPELINE_STEPS = [
  { key: "pending", label: "Queued" },
  { key: "parsing", label: "Parsing document" },
  { key: "analysing", label: "Analysing sections" },
  { key: "scoring", label: "Scoring" },
  { key: "generating", label: "Generating report" },
];

const SCORE_COLOURS: Record<string, string> = {
  Strong: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  Adequate: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  Weak: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  Missing: "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400",
};

const READINESS_COLOURS: Record<string, string> = {
  "Ready to submit": "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  "Nearly ready": "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  "Needs revisions": "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  "Major rework needed": "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

export function ReviewDetail({ review, progress, results }: ReviewDetailProps) {
  const router = useRouter();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isInProgress = !["completed", "failed"].includes(review.status);

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

  // Failed state
  if (review.status === "failed") {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 dark:border-red-900 dark:bg-red-900/20">
          <h2 className="font-semibold text-red-700 dark:text-red-400">
            Review Failed
          </h2>
          <p className="mt-2 text-sm text-red-600 dark:text-red-400">
            {review.error_message ?? "An unexpected error occurred."}
          </p>
        </div>
        <Link
          href="/new-review"
          className="inline-block rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
        >
          Try again
        </Link>
      </div>
    );
  }

  // In-progress state
  if (isInProgress) {
    const currentIndex = PIPELINE_STEPS.findIndex(
      (s) => s.key === review.status
    );
    const sectionsCompleted = (progress?.sections_completed as number) ?? 0;
    const sectionsTotal = (progress?.sections_total as number) ?? 0;

    return (
      <div className="space-y-6">
        <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="font-semibold">Review in progress</h2>
          <p className="mt-1 text-sm text-zinc-500">
            This page updates automatically.
          </p>

          <div className="mt-6 space-y-3">
            {PIPELINE_STEPS.map((step, i) => {
              const isCurrent = i === currentIndex;
              const isDone = i < currentIndex;
              const isPending = i > currentIndex;

              return (
                <div key={step.key} className="flex items-center gap-3">
                  {isDone && (
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
                      <svg
                        className="h-3.5 w-3.5 text-green-600 dark:text-green-400"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={2.5}
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="m4.5 12.75 6 6 9-13.5"
                        />
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
                  <span
                    className={`text-sm ${
                      isCurrent
                        ? "font-medium text-blue-600 dark:text-blue-400"
                        : isDone
                          ? "text-zinc-500"
                          : "text-zinc-400 dark:text-zinc-500"
                    }`}
                  >
                    {step.label}
                    {isCurrent &&
                      review.status === "analysing" &&
                      sectionsTotal > 0 &&
                      ` (${sectionsCompleted}/${sectionsTotal} sections)`}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // Completed state
  const scoring = results?.scoring as Scoring | undefined;

  if (!scoring) {
    return (
      <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <p className="text-sm text-zinc-500">
          Review completed but results are unavailable.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Score + readiness + download */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-baseline gap-2">
          <span className="text-4xl font-bold">{scoring.overall_score}</span>
          <span className="text-sm text-zinc-500">/100</span>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-sm font-medium ${
            READINESS_COLOURS[scoring.submission_readiness] ?? ""
          }`}
        >
          {scoring.submission_readiness}
        </span>
        <a
          href={`/api/reviews/${review.id}/download`}
          className="ml-auto rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
        >
          Download Review (.docx)
        </a>
      </div>

      {/* Overall descriptor */}
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        {scoring.overall_descriptor}
      </p>

      {/* Strengths + improvements */}
      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <h3 className="font-semibold text-green-700 dark:text-green-400">
            Top Strengths
          </h3>
          <ul className="mt-3 space-y-2">
            {scoring.top_strengths.map((s, i) => (
              <li
                key={i}
                className="flex gap-2 text-sm text-zinc-700 dark:text-zinc-300"
              >
                <span className="mt-0.5 text-green-500">+</span>
                {s}
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <h3 className="font-semibold text-amber-700 dark:text-amber-400">
            Top Improvements
          </h3>
          <ul className="mt-3 space-y-2">
            {scoring.top_improvements.map((s, i) => (
              <li
                key={i}
                className="flex gap-2 text-sm text-zinc-700 dark:text-zinc-300"
              >
                <span className="mt-0.5 text-amber-500">!</span>
                {s}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Criteria scores table */}
      <div className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="border-b border-zinc-200 px-5 py-3 dark:border-zinc-800">
          <h3 className="font-semibold">Criteria Scores</h3>
        </div>
        <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {scoring.criteria_scores.map((cs: CriterionScore) => (
            <div
              key={cs.criterion_id}
              className="flex items-center justify-between px-5 py-3"
            >
              <div className="min-w-0 flex-1 pr-4">
                <p className="text-sm font-medium">{cs.criterion}</p>
                <p className="mt-0.5 text-xs text-zinc-500">{cs.summary}</p>
              </div>
              <span
                className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  SCORE_COLOURS[cs.score] ?? ""
                }`}
              >
                {cs.score}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Back to dashboard */}
      <Link
        href="/dashboard"
        className="inline-block text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
      >
        &larr; Back to dashboard
      </Link>
    </div>
  );
}
