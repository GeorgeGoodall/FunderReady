/**
 * Cached historical stats for credit cost estimation.
 * Queries ai_usage_logs for per-step average costs and application_answers
 * for average answer character length. Cached in-memory with 24h TTL.
 * Returns null when fewer than 10 completed reviews exist.
 */

import { createServiceClient } from "@/lib/supabase/server";

const MIN_REVIEWS = 10;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export interface StepStats {
  avgCostUsd: number;
  callCount: number;
}

export interface EstimationStats {
  steps: {
    answer_analysis: StepStats;
    cross_reference: StepStats;
    scoring: StepStats;
  };
  avgAnswerChars: number;
  fetchedAt: number;
}

/**
 * Module-level cache — concurrent requests may both query the DB on cache miss
 * (last write wins). This is intentional and benign.
 */
let cached: EstimationStats | null = null;
let lastFetchedAt = 0;

/** Exposed for testing only */
export function _resetCache(): void {
  cached = null;
  lastFetchedAt = 0;
}

export async function getEstimationStats(): Promise<EstimationStats | null> {
  const now = Date.now();
  if (now - lastFetchedAt < CACHE_TTL_MS) {
    return cached;
  }

  const supabase = createServiceClient();

  // Check minimum review count via RPC
  const { data: countData } = await supabase.rpc("get_completed_review_count");
  const countRow = Array.isArray(countData) ? countData[0] : countData;
  const reviewCount = Number(countRow?.review_count ?? 0);

  if (reviewCount < MIN_REVIEWS) {
    cached = null;
    lastFetchedAt = now;
    return null;
  }

  // Per-step averages via RPC
  const { data: stepRows, error: stepError } = await supabase.rpc("get_estimation_step_stats");

  if (stepError || !stepRows || (stepRows as unknown[]).length === 0) {
    // RPC failed or returned no data — don't cache zero-cost stats
    cached = null;
    lastFetchedAt = now;
    return null;
  }

  const stepMap: Record<string, StepStats> = {};
  for (const row of stepRows as Array<{ pipeline_step: string; avg_cost_usd: number; call_count: number }>) {
    stepMap[row.pipeline_step] = {
      avgCostUsd: Number(row.avg_cost_usd),
      callCount: Number(row.call_count),
    };
  }

  // Average answer character length via RPC
  const { data: charsData } = await supabase.rpc("get_avg_answer_chars");
  const charsRow = Array.isArray(charsData) ? charsData[0] : charsData;
  const avgAnswerChars = Number(charsRow?.avg_chars ?? 500);

  const defaultStep: StepStats = { avgCostUsd: 0, callCount: 0 };

  cached = {
    steps: {
      answer_analysis: stepMap.answer_analysis ?? defaultStep,
      cross_reference: stepMap.cross_reference ?? defaultStep,
      scoring: stepMap.scoring ?? defaultStep,
    },
    avgAnswerChars,
    fetchedAt: now,
  };
  lastFetchedAt = now;
  return cached;
}
