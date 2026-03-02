"use client";

import type { CrossReferenceFinding } from "../types";
import { SEVERITY_COLOURS } from "../constants";
import { ReferenceTag } from "./ReferenceTag";
import { InlineRefs } from "./InlineRefs";
import { FeedbackButton } from "./FeedbackButton";

export function CrossReferenceFindingCard({
  finding,
  findingIndex,
  questionMap,
  criteriaMap,
  reviewId,
  applicationId,
  feedbackMap,
  onFeedbackChange,
}: {
  finding: CrossReferenceFinding;
  findingIndex: number;
  questionMap: Map<string, string>;
  criteriaMap: Map<string, string>;
  reviewId?: string;
  applicationId?: string;
  feedbackMap?: Record<string, "up" | "down">;
  onFeedbackChange?: (itemPath: string, sentiment: "up" | "down" | null) => void;
}) {
  return (
    <div className={`rounded-lg border p-4 ${SEVERITY_COLOURS[finding.severity] ?? SEVERITY_COLOURS.low}`}>
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold capitalize text-zinc-600 dark:text-zinc-400">
          {finding.type.replace(/_/g, " ")}
        </span>
        <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium capitalize ${
          finding.severity === "high" ? "bg-red-200 text-red-800 dark:bg-red-900/40 dark:text-red-300" :
          finding.severity === "medium" ? "bg-amber-200 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300" :
          "bg-zinc-200 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-400"
        }`}>
          {finding.severity}
        </span>
      </div>
      <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">
        <InlineRefs text={finding.description} questionMap={questionMap} criteriaMap={criteriaMap} />
      </p>
      {finding.suggestion && (
        <p className="mt-1 text-xs text-zinc-500">
          <span className="font-medium">Fix:</span>{" "}
          <InlineRefs text={finding.suggestion} questionMap={questionMap} criteriaMap={criteriaMap} />
        </p>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {finding.sections_involved.map((qId) => (
          <ReferenceTag key={qId} id={qId} type="question" fullText={questionMap.get(qId)} variant="chip" />
        ))}
        {finding.criteria_involved?.map((cId) => (
          <ReferenceTag key={cId} id={cId} type="criteria" fullText={criteriaMap.get(cId)} variant="chip" />
        ))}
      </div>
      {reviewId && applicationId && (
        <div className="mt-2">
          <FeedbackButton
            reviewId={reviewId}
            applicationId={applicationId}
            itemPath={`cross_reference/findings/${findingIndex}`}
            itemType="cross_reference_finding"
            currentSentiment={feedbackMap?.[`cross_reference/findings/${findingIndex}`] ?? null}
            onSentimentChange={onFeedbackChange}
          />
        </div>
      )}
    </div>
  );
}
