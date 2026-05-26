/**
 * Estimates the credit cost of a review.
 *
 * Two modes:
 * 1. estimateReviewCostWithStats() — uses historical averages with char_ratio
 *    adjustment and narrow 0.9x-1.2x range. Returns null if stats is null.
 *
 * 2. estimateReviewCost() — hardcoded fallback with wider 0.8x-1.3x range.
 */

import { COST_PER_CREDIT_USD } from "./credits";
import type { EstimationStats } from "./estimation-stats";

// Fallback constants (used when no historical data)
const AVG_ANSWER_ANALYSIS_CREDITS = 0.7;
const CROSS_REF_BASE_CREDITS = 1.0;
const CROSS_REF_PER_ANSWER_CREDITS = 0.05;
const SCORING_BASE_CREDITS = 1.0;
const SCORING_PER_ANSWER_CREDITS = 0.05;

export interface CostEstimate {
  low: number;
  high: number;
}

/**
 * Stats-based estimate with char_ratio adjustment.
 * Returns null if stats is null (not enough historical data).
 */
export function estimateReviewCostWithStats(
  freshAnswerCount: number,
  totalEnabledCount: number,
  answerTexts: string[],
  stats: EstimationStats | null
): CostEstimate | null {
  if (totalEnabledCount <= 0) {
    return { low: 0, high: 0 };
  }

  if (!stats) return null;

  // char_ratio: how this review's answers compare to historical average
  const actualAvgChars = answerTexts.length > 0
    ? answerTexts.reduce((sum, t) => sum + t.length, 0) / answerTexts.length
    : stats.avgAnswerChars;
  const charRatio = stats.avgAnswerChars > 0
    ? actualAvgChars / stats.avgAnswerChars
    : 1;

  // Estimate cost in USD
  const analysisCostUsd = freshAnswerCount * stats.steps.answer_analysis.avgCostUsd * charRatio;
  const crossRefCostUsd = stats.steps.cross_reference.avgCostUsd;
  const scoringCostUsd = stats.steps.scoring.avgCostUsd;

  const totalCostUsd = analysisCostUsd + crossRefCostUsd + scoringCostUsd;

  // Convert to credits
  const credits = Math.ceil(totalCostUsd / COST_PER_CREDIT_USD);
  const low = Math.max(1, Math.floor(credits * 0.9));
  const high = Math.ceil(credits * 1.2);

  return { low, high };
}

/**
 * Hardcoded fallback estimator.
 * Used when historical stats are unavailable.
 */
export function estimateReviewCost(
  freshAnswerCount: number,
  totalEnabledCount?: number
): CostEstimate {
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
