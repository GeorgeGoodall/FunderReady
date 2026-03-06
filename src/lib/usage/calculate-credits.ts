import { COST_PER_CREDIT_USD } from "@/lib/stripe/plans";

/**
 * Converts a USD cost into credits. Always rounds up so the user is never
 * undercharged (fractional credits always cost 1 full credit).
 */
export function calculateCreditsFromCost(costUsd: number): number {
  if (costUsd <= 0) return 0;
  return Math.ceil(costUsd / COST_PER_CREDIT_USD);
}
