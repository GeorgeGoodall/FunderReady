/**
 * Estimates the credit cost of a review based on the number of enabled answers.
 *
 * Constants are tuned from actual ai_usage_logs data. Each answer analysis
 * costs roughly 0.7 credits, plus ~2.5 credits overhead for cross-reference
 * and scoring steps.
 *
 * Returns a {low, high} range. The high includes a 1.3x buffer to avoid
 * underestimation. Gating uses the low estimate (user only needs >= low to start).
 */

const AVG_ANSWER_CREDITS = 0.7;
const OVERHEAD_CREDITS = 2.5;

export function estimateReviewCost(enabledAnswerCount: number): {
  low: number;
  high: number;
} {
  if (enabledAnswerCount <= 0) {
    return { low: 0, high: 0 };
  }

  const estimate = enabledAnswerCount * AVG_ANSWER_CREDITS + OVERHEAD_CREDITS;
  const low = Math.max(1, Math.floor(estimate * 0.8));
  const high = Math.ceil(estimate * 1.3);

  return { low, high };
}
