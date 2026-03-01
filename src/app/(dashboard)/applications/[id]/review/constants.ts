// ---------------------------------------------------------------------------
// Shared constants for the review page
// ---------------------------------------------------------------------------

export const SCORE_COLOURS: Record<string, string> = {
  Excellent: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  Strong: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  Fair: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  "Needs Improvement": "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  Poor: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  Missing: "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400",
};

export const READINESS_COLOURS: Record<string, string> = {
  "Ready to submit": "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  "Nearly ready": "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  "Needs revisions": "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  "Major rework needed": "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

export const SEVERITY_COLOURS: Record<string, string> = {
  high: "border-red-200 bg-red-50 dark:border-red-900/30 dark:bg-red-900/10",
  medium: "border-amber-200 bg-amber-50 dark:border-amber-900/30 dark:bg-amber-900/10",
  low: "border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/50",
};

export const PIPELINE_STEPS = [
  { key: "pending", label: "Queued" },
  { key: "analysing", label: "Analysing answers" },
  { key: "cross_referencing", label: "Cross-referencing" },
  { key: "scoring", label: "Scoring" },
];

export const SCORE_ORDER: Record<string, number> = {
  Missing: 0,
  Poor: 1,
  "Needs Improvement": 2,
  Fair: 3,
  Strong: 4,
  Excellent: 5,
};
