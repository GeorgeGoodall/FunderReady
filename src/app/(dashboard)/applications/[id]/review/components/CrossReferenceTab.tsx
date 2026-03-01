"use client";

import type { CrossReference } from "../types";
import { CrossReferenceFindingCard } from "./CrossReferenceFindingCard";

export function CrossReferenceTab({
  crossReference,
  questionMap,
  criteriaMap,
}: {
  crossReference: CrossReference;
  questionMap: Map<string, string>;
  criteriaMap: Map<string, string>;
}) {
  const findings = crossReference.findings ?? [];
  const gapCriteria = crossReference.gap_criteria ?? [];
  const hasContent = findings.length > 0 || gapCriteria.length > 0;

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
      </div>

      {/* Findings */}
      {findings.length > 0 && (
        <div>
          <h3 className="mb-3 text-sm font-semibold">
            Findings{" "}
            <span className="inline-flex items-center rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
              {findings.length}
            </span>
          </h3>
          <div className="space-y-3">
            {findings.map((finding, i) => (
              <CrossReferenceFindingCard key={i} finding={finding} questionMap={questionMap} criteriaMap={criteriaMap} />
            ))}
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
