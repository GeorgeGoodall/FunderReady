"use client";

import type { AnswerInlineComment } from "../types";

const CATEGORY_COLOURS: Record<string, string> = {
  ALIGNMENT: "bg-blue-100 dark:bg-blue-900/30",
  EVIDENCE: "bg-purple-100 dark:bg-purple-900/30",
  CLARITY: "bg-yellow-100 dark:bg-yellow-900/30",
  STRUCTURE: "bg-indigo-100 dark:bg-indigo-900/30",
  IMPACT: "bg-green-100 dark:bg-green-900/30",
  BUDGET: "bg-orange-100 dark:bg-orange-900/30",
  MISSING: "bg-red-100 dark:bg-red-900/30",
  CONSISTENCY: "bg-teal-100 dark:bg-teal-900/30",
  SPECIFICITY: "bg-amber-100 dark:bg-amber-900/30",
  CONCISENESS: "bg-pink-100 dark:bg-pink-900/30",
};

export function CommentHighlight({
  text,
  comment,
  isOpen,
  onToggle,
}: {
  text: string;
  comment: AnswerInlineComment;
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <span className="relative inline">
      <mark
        className={`cursor-pointer rounded-sm px-0.5 ${CATEGORY_COLOURS[comment.category] ?? "bg-yellow-100 dark:bg-yellow-900/30"}`}
        onClick={onToggle}
        title={`[${comment.category}] ${comment.issue}`}
      >
        {text}
      </mark>
      {isOpen && (
        <span className="absolute left-0 top-full z-20 mt-1 w-80 rounded-lg border border-zinc-200 bg-white p-3 shadow-lg dark:border-zinc-700 dark:bg-zinc-800">
          <span className="mb-1 flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">
              [{comment.category}]
            </span>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onToggle(); }}
              className="text-xs text-zinc-400 hover:text-zinc-600"
            >
              &times;
            </button>
          </span>
          <span className="block text-xs text-zinc-700 dark:text-zinc-300">
            <span className="font-medium">Issue:</span> {comment.issue}
          </span>
          <span className="mt-1 block text-xs text-zinc-600 dark:text-zinc-400">
            <span className="font-medium">Suggestion:</span> {comment.suggestion}
          </span>
        </span>
      )}
    </span>
  );
}
