/**
 * Estimates the credit cost of a review based on answer counts.
 *
 * The pipeline has three cost components:
 * 1. Answer analysis — one Claude call per FRESH answer (unchanged answers are reused)
 * 2. Cross-reference — scales with total enabled answers (processes all, including reused)
 * 3. Scoring — scales with total enabled answers
 *
 * Constants are tuned from actual ai_usage_logs data.
 *
 * Returns a {low, high} range. The high includes a 1.3x buffer to avoid
 * underestimation. Gating uses the low estimate (user only needs >= low to start).
 */

const AVG_ANSWER_ANALYSIS_CREDITS = 0.7;
const CROSS_REF_BASE_CREDITS = 1.0;
const CROSS_REF_PER_ANSWER_CREDITS = 0.05;
const SCORING_BASE_CREDITS = 1.0;
const SCORING_PER_ANSWER_CREDITS = 0.05;

export function estimateReviewCost(
  freshAnswerCount: number,
  totalEnabledCount?: number
): {
  low: number;
  high: number;
} {
  const total = totalEnabledCount ?? freshAnswerCount;

  if (total <= 0) {
    return { low: 0, high: 0 };
  }

  const analysisCredits = freshAnswerCount * AVG_ANSWER_ANALYSIS_CREDITS;
  const crossRefCredits = CROSS_REF_BASE_CREDITS + total * CROSS_REF_PER_ANSWER_CREDITS;
  const scoringCredits = SCORING_BASE_CREDITS + total * SCORING_PER_ANSWER_CREDITS;

  const estimate = analysisCredits + crossRefCredits + scoringCredits;
  const low = Math.max(1, Math.floor(estimate * 0.8));
  const high = Math.ceil(estimate * 1.3);

  return { low, high };
}
