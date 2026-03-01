"use client";

import { useState } from "react";
import Link from "next/link";
import type { ApplicationScoring, ImprovementAppendixItem, ReviewResults } from "../types";
import { SCORE_COLOURS, SCORE_ORDER, READINESS_COLOURS } from "../constants";
import { InlineRefs } from "./InlineRefs";
import { QualityDimensionBars } from "./QualityDimensionBars";
import { ImprovementDetail } from "./ImprovementDetail";

export function SummaryTab({
  applicationId,
  scoring,
  projected_score,
  gap_count,
  questionMap,
  criteriaMap,
}: {
  applicationId: string;
  scoring: ApplicationScoring;
  projected_score: ReviewResults["projected_score"];
  gap_count: ReviewResults["gap_count"];
  questionMap: Map<string, string>;
  criteriaMap: Map<string, string>;
}) {
  const hasGaps = (gap_count ?? 0) > 0 && projected_score !== undefined;

  // Build appendix map for O(1) lookup
  const appendixMap = new Map(
    (scoring.improvement_appendix ?? []).map((item) => [item.criterion_id, item])
  );

  return (
    <div className="space-y-6">
      {/* Score + readiness */}
      <div>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-bold">{scoring.overall_score}</span>
            <span className="text-sm text-zinc-500">/100</span>
          </div>
          {hasGaps && projected_score !== undefined && (
            <>
              <span className="text-zinc-400">&rarr;</span>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-bold text-blue-600 dark:text-blue-400">{Math.round(projected_score)}</span>
                <span className="text-sm text-zinc-500">/100</span>
              </div>
              <span className="text-xs text-blue-600 dark:text-blue-400">
                projected if {gap_count} gap{gap_count === 1 ? "" : "s"} addressed
              </span>
            </>
          )}
          <span className={`rounded-full px-3 py-1 text-sm font-medium ${READINESS_COLOURS[scoring.submission_readiness] ?? ""}`}>
            {scoring.submission_readiness}
          </span>
          <Link
            href={`/applications/${applicationId}`}
            className="ml-auto rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
          >
            Edit Current Draft
          </Link>
        </div>

        <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
          <InlineRefs text={scoring.overall_descriptor} questionMap={questionMap} criteriaMap={criteriaMap} />
        </p>
      </div>

      {/* Quality dimensions */}
      {scoring.quality_dimensions && scoring.quality_dimensions.length > 0 && (
        <QualityDimensionBars dimensions={scoring.quality_dimensions} />
      )}

      {/* Strengths + improvements */}
      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <h3 className="font-semibold text-green-700 dark:text-green-400">Top Strengths</h3>
          <ul className="mt-3 space-y-2">
            {scoring.top_strengths.map((s, i) => (
              <li key={i} className="flex gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                <span className="mt-0.5 text-green-500">+</span><span><InlineRefs text={s} questionMap={questionMap} criteriaMap={criteriaMap} /></span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <h3 className="font-semibold text-amber-700 dark:text-amber-400">Top Improvements</h3>
          <ul className="mt-3 space-y-2">
            {scoring.top_improvements.map((s, i) => (
              <li key={i} className="flex gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                <span className="mt-0.5 text-amber-500">!</span><span><InlineRefs text={s} questionMap={questionMap} criteriaMap={criteriaMap} /></span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Criteria scores with expandable improvement detail */}
      <CriteriaScoresSection
        criteriaScores={scoring.criteria_scores}
        appendixMap={appendixMap}
        questionMap={questionMap}
        criteriaMap={criteriaMap}
      />

    </div>
  );
}

// ---------------------------------------------------------------------------
// Criteria scores section with collapsible improvement detail
// ---------------------------------------------------------------------------

function CriteriaScoresSection({
  criteriaScores,
  appendixMap,
  questionMap,
  criteriaMap,
}: {
  criteriaScores: ApplicationScoring["criteria_scores"];
  appendixMap: Map<string, ImprovementAppendixItem>;
  questionMap: Map<string, string>;
  criteriaMap: Map<string, string>;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [sortAsc, setSortAsc] = useState(false); // false = worst first

  const sorted = [...criteriaScores].sort((a, b) => {
    const scoreA = (SCORE_ORDER[a.score] ?? 3) * 2 + (appendixMap.has(a.criterion_id) ? 0 : 1);
    const scoreB = (SCORE_ORDER[b.score] ?? 3) * 2 + (appendixMap.has(b.criterion_id) ? 0 : 1);
    return sortAsc ? scoreB - scoreA : scoreA - scoreB;
  });

  return (
    <div className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-3 dark:border-zinc-800">
        <h3 className="text-sm font-semibold">Criteria Scores</h3>
        <button
          type="button"
          onClick={() => setSortAsc(!sortAsc)}
          className="flex items-center gap-1 rounded px-2 py-1 text-xs text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
          title={sortAsc ? "Showing best first — click for worst first" : "Showing worst first — click for best first"}
        >
          {sortAsc ? "Best first" : "Worst first"}
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            {sortAsc ? (
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 4.5h14.25M3 9h9.75M3 13.5h5.25m5.25-.75L17.25 9m0 0L21 12.75M17.25 9v12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 4.5h14.25M3 9h9.75M3 13.5h9.75m4.5-4.5v12m0 0-3.75-3.75M17.25 21 21 17.25" />
            )}
          </svg>
        </button>
      </div>
      <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
        {sorted.map((cs) => {
          const appendixItem = appendixMap.get(cs.criterion_id);
          const isExpanded = expandedId === cs.criterion_id;

          return (
            <div key={cs.criterion_id}>
              <div
                className={`flex items-center justify-between px-5 py-3 ${appendixItem ? "cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/50" : ""}`}
                onClick={() => appendixItem && setExpandedId(isExpanded ? null : cs.criterion_id)}
              >
                <div className="min-w-0 flex-1 pr-4">
                  <p className="text-sm font-medium">{cs.criterion}</p>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    <InlineRefs text={cs.summary} questionMap={questionMap} criteriaMap={criteriaMap} />
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${SCORE_COLOURS[cs.score] ?? ""}`}>
                    {cs.score}
                  </span>
                  {appendixItem && (
                    <svg
                      className={`h-4 w-4 shrink-0 text-zinc-400 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                      fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                    </svg>
                  )}
                </div>
              </div>

              {isExpanded && appendixItem && (
                <div className="border-t border-zinc-100 bg-zinc-50/50 px-5 py-4 dark:border-zinc-800 dark:bg-zinc-800/30">
                  <p className="mb-3 text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                    How to improve
                    {appendixItem.gap_type === "quick_fix" && (
                      <span className="ml-2 rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
                        Quick fix
                      </span>
                    )}
                    {appendixItem.gap_type === "structural_gap" && (
                      <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                        Evidence gap
                      </span>
                    )}
                  </p>
                  <ImprovementDetail item={appendixItem} questionMap={questionMap} criteriaMap={criteriaMap} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
