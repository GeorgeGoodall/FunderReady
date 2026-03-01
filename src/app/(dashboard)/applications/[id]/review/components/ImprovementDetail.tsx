"use client";

import type { ImprovementAppendixItem } from "../types";
import { InlineRefs } from "./InlineRefs";

export function ImprovementDetail({
  item,
  questionMap,
  criteriaMap,
}: {
  item: ImprovementAppendixItem;
  questionMap: Map<string, string>;
  criteriaMap: Map<string, string>;
}) {
  return (
    <div className="space-y-1.5 text-xs text-zinc-600 dark:text-zinc-400">
      <p><span className="font-medium">What the funder wants:</span> <InlineRefs text={item.what_funder_wants} questionMap={questionMap} criteriaMap={criteriaMap} /></p>
      <p><span className="font-medium">How you address it:</span> <InlineRefs text={item.how_bid_addresses} questionMap={questionMap} criteriaMap={criteriaMap} /></p>
      <p><span className="font-medium">What&apos;s missing:</span> <InlineRefs text={item.whats_missing} questionMap={questionMap} criteriaMap={criteriaMap} /></p>
      {item.example_language && (
        <div className="mt-2 rounded border border-zinc-200 bg-zinc-50 p-2 dark:border-zinc-700 dark:bg-zinc-800">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Suggested language</p>
          <p className="mb-1.5 text-[10px] text-amber-600 dark:text-amber-400">
            AI-generated example — verify all facts, figures, and sources before use
          </p>
          <p className="text-xs text-zinc-700 dark:text-zinc-300">{item.example_language}</p>
        </div>
      )}
    </div>
  );
}
