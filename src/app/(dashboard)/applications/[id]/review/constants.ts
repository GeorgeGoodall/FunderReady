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
  "Strong application": "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  "Good progress": "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
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

export function getPipelineSteps(applicationFormat?: string) {
  if (applicationFormat === "unstructured_doc") {
    return [
      { key: "pending", label: "Queued" },
      { key: "structuring", label: "Structuring document" },
      { key: "analysing", label: "Analysing sections" },
      { key: "cross_referencing", label: "Cross-referencing" },
      { key: "scoring", label: "Scoring" },
    ];
  }
  return PIPELINE_STEPS;
}

export const SCORE_ORDER: Record<string, number> = {
  Missing: 0,
  Poor: 1,
  "Needs Improvement": 2,
  Fair: 3,
  Strong: 4,
  Excellent: 5,
};

export const GOOD_SCORES = new Set(["Excellent", "Strong"]);

export const ANIMATE_ON_VIEW_THRESHOLD = 0.1;
export const ANIMATE_ON_VIEW_THRESHOLD_RELAXED = 0.2;

/**
 * Converts a 0-100 score to an HSL colour string.
 * 0 = red (hsl 0), 50 = amber (hsl 40), 100 = green (hsl 130).
 * Returns grey for null scores.
 */
export function scoreToHsl(score: number | null): string {
  if (score === null) return "hsl(0, 0%, 60%)";
  const clamped = Math.max(0, Math.min(100, score));
  const hue = clamped <= 50
    ? (clamped / 50) * 40
    : 40 + ((clamped - 50) / 50) * 90;
  return `hsl(${Math.round(hue)}, 70%, 45%)`;
}
