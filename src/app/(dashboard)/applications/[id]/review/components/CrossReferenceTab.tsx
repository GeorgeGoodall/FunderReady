"use client";

import { useState, useMemo } from "react";
import type { CrossReference, CrossReferenceFinding } from "../types";
import { CrossReferenceFindingCard } from "./CrossReferenceFindingCard";
import { FeedbackButton } from "./FeedbackButton";

const FINDING_CATEGORIES: CrossReferenceFinding["type"][] = [
  "contradiction",
  "gap",
  "missing_criterion",
  "unresolved_reference",
  "inconsistency",
  "repetition",
  "resolved_weakness",
];

const CATEGORY_LABELS: Record<CrossReferenceFinding["type"], string> = {
  contradiction: "Contradiction",
  gap: "Gap",
  missing_criterion: "Missing criterion",
  unresolved_reference: "Unresolved reference",
  inconsistency: "Inconsistency",
  repetition: "Repetition",
  resolved_weakness: "Resolved weakness",
};

const SEVERITY_ORDER: Record<string, number> = { high: 3, medium: 2, low: 1 };

export function CrossReferenceTab({
  crossReference,
  questionMap,
  criteriaMap,
  reviewId,
  applicationId,
  feedbackMap,
  onFeedbackChange,
}: {
  crossReference: CrossReference;
  questionMap: Map<string, string>;
  criteriaMap: Map<string, string>;
  reviewId?: string;
  applicationId?: string;
  feedbackMap?: Record<string, "up" | "down">;
  onFeedbackChange?: (itemPath: string, sentiment: "up" | "down" | null) => void;
}) {
  const findings = crossReference.findings ?? [];
  const gapCriteria = crossReference.gap_criteria ?? [];
  const hasContent = findings.length > 0 || gapCriteria.length > 0;

  const [activeCategories, setActiveCategories] = useState<Set<CrossReferenceFinding["type"]>>(new Set());
  const [sortDirection, setSortDirection] = useState<"desc" | "asc">("desc");

  // Categories present in findings (only show toggles for these)
  const presentCategories = useMemo(
    () => FINDING_CATEGORIES.filter((cat) => findings.some((f) => f.type === cat)),
    [findings],
  );

  // Build a map from original index → finding so feedback paths stay stable
  const indexedFindings = useMemo(
    () => findings.map((f, i) => ({ finding: f, originalIndex: i })),
    [findings],
  );

  const filteredAndSorted = useMemo(() => {
    let result = indexedFindings;
    if (activeCategories.size > 0) {
      result = result.filter(({ finding }) => activeCategories.has(finding.type));
    }
    result = [...result].sort((a, b) => {
      const diff = (SEVERITY_ORDER[a.finding.severity] ?? 0) - (SEVERITY_ORDER[b.finding.severity] ?? 0);
      return sortDirection === "desc" ? -diff : diff;
    });
    return result;
  }, [indexedFindings, activeCategories, sortDirection]);

  function toggleCategory(cat: CrossReferenceFinding["type"]) {
    setActiveCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }

  if (!hasContent) {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 px-5 py-4 dark:border-green-900/30 dark:bg-green-900/10">
        <p className="text-sm font-medium text-green-700 dark:text-green-400">No cross-reference issues found</p>
        <p className="mt-1 text-xs text-green-600 dark:text-green-500">
          Your answers are coherent with no contradictions or gaps detected.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Coherence badge + summary */}
      <div className="rounded-lg border border-zinc-200 bg-white px-5 py-4 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Overall coherence:</span>
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${
            crossReference.overall_coherence === "strong"
              ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
              : crossReference.overall_coherence === "adequate"
                ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
          }`}>
            {crossReference.overall_coherence}
          </span>
        </div>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{crossReference.summary}</p>
        {reviewId && applicationId && (
          <div className="mt-2">
            <FeedbackButton
              reviewId={reviewId}
              applicationId={applicationId}
              itemPath="cross_reference/summary"
              itemType="cross_reference_summary"
              currentSentiment={feedbackMap?.["cross_reference/summary"] ?? null}
              onSentimentChange={onFeedbackChange}
            />
          </div>
        )}
      </div>

      {/* Findings */}
      {findings.length > 0 && (
        <div>
          <h3 className="mb-3 text-sm font-semibold">
            Findings{" "}
            <span className="inline-flex items-center rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
              {filteredAndSorted.length}{activeCategories.size > 0 ? ` / ${findings.length}` : ""}
            </span>
          </h3>

          {/* Filter & sort controls */}
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {presentCategories.map((cat) => {
              const active = activeCategories.has(cat);
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => toggleCategory(cat)}
                  className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                    active
                      ? "border-blue-300 bg-blue-100 text-blue-700 dark:border-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                      : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
                  }`}
                >
                  {CATEGORY_LABELS[cat]}
                </button>
              );
            })}

            {activeCategories.size > 0 && (
              <button
                type="button"
                onClick={() => setActiveCategories(new Set())}
                className="text-xs text-zinc-500 underline hover:text-zinc-700 dark:hover:text-zinc-300"
              >
                Clear filters
              </button>
            )}

            <span className="mx-1 hidden h-4 w-px bg-zinc-200 dark:bg-zinc-700 sm:inline-block" />

            <button
              type="button"
              onClick={() => setSortDirection((d) => (d === "desc" ? "asc" : "desc"))}
              className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
            >
              Severity
              <svg className={`h-3 w-3 transition-transform ${sortDirection === "asc" ? "rotate-180" : ""}`} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 5l3 3 3-3" />
              </svg>
            </button>
          </div>

          <div className="space-y-3">
            {filteredAndSorted.length === 0 ? (
              <p className="py-3 text-center text-xs text-zinc-400">No findings match the selected filters.</p>
            ) : (
              filteredAndSorted.map(({ finding, originalIndex }) => (
                <CrossReferenceFindingCard
                  key={originalIndex}
                  finding={finding}
                  findingIndex={originalIndex}
                  questionMap={questionMap}
                  criteriaMap={criteriaMap}
                  reviewId={reviewId}
                  applicationId={applicationId}
                  feedbackMap={feedbackMap}
                  onFeedbackChange={onFeedbackChange}
                />
              ))
            )}
          </div>
        </div>
      )}

      {/* Coverage gaps */}
      {gapCriteria.length > 0 && (
        <div>
          <h3 className="mb-1 text-sm font-semibold">
            Coverage Gaps{" "}
            <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
              {gapCriteria.length}
            </span>
          </h3>
          <p className="mb-3 text-xs text-zinc-500">
            These criteria have no coverage in your enabled answers. If applicable, re-enable or fill in the related questions and re-submit.
          </p>
          <div className="space-y-3">
            {gapCriteria.map((gap) => (
              <div key={gap.criterion_id} className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/30 dark:bg-amber-900/10">
                <p className="text-sm font-medium text-amber-900 dark:text-amber-200">{gap.criterion}</p>
                {gap.related_disabled_question_texts.length > 0 && (
                  <div className="mt-2">
                    <p className="text-xs font-medium text-amber-700 dark:text-amber-400">Related excluded questions:</p>
                    <ul className="mt-1 space-y-0.5">
                      {gap.related_disabled_question_texts.map((qt, i) => (
                        <li key={i} className="text-xs text-amber-700 dark:text-amber-400">
                          <span className="mr-1 rounded bg-zinc-200 px-1 py-0.5 text-[10px] font-medium text-zinc-600 dark:bg-zinc-700 dark:text-zinc-400">N/A</span>
                          {qt}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
