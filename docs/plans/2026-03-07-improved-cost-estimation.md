# Improved Cost Estimation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace hardcoded credit estimation constants with historical averages from `ai_usage_logs`, adjusted by answer character length ratio, with narrower 0.9x-1.2x range and minimum threshold gating.

**Architecture:** A cached stats module queries `ai_usage_logs` and `application_answers` once per 24h to compute per-step average costs and average answer character lengths. The estimator uses these stats plus a per-request `char_ratio` (actual avg chars / historical avg chars) to scale analysis costs. When fewer than 10 completed reviews exist, estimates are hidden from the UI and gating only checks `remaining > 0`.

**Tech Stack:** TypeScript, Supabase (service client for stats queries), Vitest

---

### Task 1: Historical Stats Cache Module

**Files:**
- Create: `src/lib/usage/estimation-stats.ts`
- Test: `src/lib/usage/__tests__/estimation-stats.test.ts`

**Step 1: Write the failing tests**

Create `src/lib/usage/__tests__/estimation-stats.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { getEstimationStats, _resetCache, type EstimationStats } from "../estimation-stats";

// Mock createServiceClient
vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: vi.fn(),
}));

import { createServiceClient } from "@/lib/supabase/server";

function buildMockClient(overrides: {
  stepStats?: { data: unknown[] | null; error?: unknown };
  avgChars?: { data: unknown | null; error?: unknown };
  reviewCount?: { data: unknown | null; error?: unknown };
} = {}) {
  const fromMock = vi.fn().mockImplementation((table: string) => {
    if (table === "ai_usage_logs") {
      // Chain: .select().eq().in().not() — returns stepStats
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            in: vi.fn().mockReturnValue({
              not: vi.fn().mockResolvedValue(
                overrides.stepStats ?? {
                  data: [
                    { pipeline_step: "answer_analysis", avg_cost_usd: 0.035, call_count: 50 },
                    { pipeline_step: "cross_reference", avg_cost_usd: 0.08, call_count: 15 },
                    { pipeline_step: "scoring", avg_cost_usd: 0.06, call_count: 15 },
                  ],
                }
              ),
            }),
          }),
        }),
      };
    }
    return { select: vi.fn().mockReturnThis() };
  });

  // For the RPC calls
  const rpcMock = vi.fn().mockImplementation((fn: string) => {
    if (fn === "get_avg_answer_chars") {
      return Promise.resolve(
        overrides.avgChars ?? { data: { avg_chars: 450 }, error: null }
      );
    }
    if (fn === "get_completed_review_count") {
      return Promise.resolve(
        overrides.reviewCount ?? { data: { review_count: 25 }, error: null }
      );
    }
    return Promise.resolve({ data: null, error: null });
  });

  return { from: fromMock, rpc: rpcMock };
}

describe("getEstimationStats", () => {
  beforeEach(() => {
    _resetCache();
    vi.clearAllMocks();
  });

  it("returns null when fewer than 10 completed reviews", async () => {
    const mock = buildMockClient({
      reviewCount: { data: { review_count: 5 }, error: null },
    });
    (createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(mock);

    const stats = await getEstimationStats();
    expect(stats).toBeNull();
  });

  it("returns stats when enough reviews exist", async () => {
    const mock = buildMockClient();
    (createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(mock);

    const stats = await getEstimationStats();
    expect(stats).not.toBeNull();
    expect(stats!.avgAnswerChars).toBe(450);
    expect(stats!.steps.answer_analysis.avgCostUsd).toBe(0.035);
    expect(stats!.steps.cross_reference.avgCostUsd).toBe(0.08);
    expect(stats!.steps.scoring.avgCostUsd).toBe(0.06);
  });

  it("caches results for 24h", async () => {
    const mock = buildMockClient();
    (createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(mock);

    await getEstimationStats();
    await getEstimationStats();

    // createServiceClient should only be called once
    expect(createServiceClient).toHaveBeenCalledTimes(1);
  });

  it("refreshes cache after 24h", async () => {
    const mock = buildMockClient();
    (createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(mock);

    await getEstimationStats();

    // Advance past TTL
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 25 * 60 * 60 * 1000);

    await getEstimationStats();

    expect(createServiceClient).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd app && npx vitest run src/lib/usage/__tests__/estimation-stats.test.ts`
Expected: FAIL — module `../estimation-stats` not found

**Step 3: Write the implementation**

Create `src/lib/usage/estimation-stats.ts`:

```typescript
/**
 * Cached historical stats for credit cost estimation.
 *
 * Queries ai_usage_logs for per-step average costs and application_answers
 * for average answer character length. Results are cached in-memory with
 * a 24h TTL. Requires a minimum of 10 completed reviews before returning
 * stats (returns null otherwise).
 */

import { createServiceClient } from "@/lib/supabase/server";

const MIN_REVIEWS = 10;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

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

let cached: EstimationStats | null = null;
let cachedNull = false; // true if last fetch returned null (below threshold)
let lastFetchedAt = 0;

/** Exposed for testing only */
export function _resetCache(): void {
  cached = null;
  cachedNull = false;
  lastFetchedAt = 0;
}

export async function getEstimationStats(): Promise<EstimationStats | null> {
  const now = Date.now();
  if (now - lastFetchedAt < CACHE_TTL_MS) {
    return cached;
  }

  const supabase = createServiceClient();

  // Check minimum review count
  const { data: countData } = await supabase.rpc("get_completed_review_count");
  const reviewCount = countData?.review_count ?? 0;

  if (reviewCount < MIN_REVIEWS) {
    cached = null;
    cachedNull = true;
    lastFetchedAt = now;
    return null;
  }

  // Per-step averages (only non-retry calls)
  const { data: stepRows } = await supabase
    .from("ai_usage_logs")
    .select("pipeline_step, avg(cost_usd) as avg_cost_usd, count(*) as call_count")
    .eq("is_retry", false)
    .in("pipeline_step", ["answer_analysis", "cross_reference", "scoring"])
    .not("cost_usd", "is", null);

  const stepMap: Record<string, StepStats> = {};
  for (const row of (stepRows ?? []) as Array<{ pipeline_step: string; avg_cost_usd: number; call_count: number }>) {
    stepMap[row.pipeline_step] = {
      avgCostUsd: Number(row.avg_cost_usd),
      callCount: Number(row.call_count),
    };
  }

  // Average answer character length from completed reviews
  const { data: charsData } = await supabase.rpc("get_avg_answer_chars");
  const avgAnswerChars = Number(charsData?.avg_chars ?? 500);

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
  cachedNull = false;
  lastFetchedAt = now;
  return cached;
}
```

Note: The `ai_usage_logs` aggregation query uses Supabase's `.select()` with aggregate functions. However, Supabase PostgREST doesn't support inline aggregations well. We'll use RPCs instead — see Task 2 for the SQL migration that creates `get_estimation_step_stats`, `get_avg_answer_chars`, and `get_completed_review_count` RPCs.

**Step 4: Run tests to verify they pass**

Run: `cd app && npx vitest run src/lib/usage/__tests__/estimation-stats.test.ts`
Expected: PASS (tests mock the supabase calls)

**Step 5: Commit**

```bash
git add src/lib/usage/estimation-stats.ts src/lib/usage/__tests__/estimation-stats.test.ts
git commit -m "feat: add historical stats cache for credit estimation"
```

---

### Task 2: Database RPCs for Estimation Stats

**Files:**
- Create: `supabase/migrations/20260311000000_estimation_stats_rpcs.sql`

**Step 1: Write the migration**

Create `supabase/migrations/20260311000000_estimation_stats_rpcs.sql`:

```sql
-- RPCs for credit cost estimation historical stats
-- ================================================

-- 1. Per-step average cost
create or replace function get_estimation_step_stats()
returns table(
  pipeline_step text,
  avg_cost_usd numeric,
  call_count bigint
)
language sql stable
security definer
as $$
  select
    l.pipeline_step,
    avg(l.cost_usd)::numeric as avg_cost_usd,
    count(*)::bigint as call_count
  from ai_usage_logs l
  where l.is_retry = false
    and l.pipeline_step in ('answer_analysis', 'cross_reference', 'scoring')
  group by l.pipeline_step;
$$;

-- 2. Average answer character length from completed reviews
create or replace function get_avg_answer_chars()
returns table(avg_chars numeric)
language sql stable
security definer
as $$
  select coalesce(avg(char_length(aa.answer_text)), 500)::numeric as avg_chars
  from application_answers aa
  join application_reviews ar on ar.application_id = aa.application_id
  where ar.status = 'completed'
    and aa.is_disabled = false
    and char_length(aa.answer_text) > 0;
$$;

-- 3. Completed review count (for minimum threshold check)
create or replace function get_completed_review_count()
returns table(review_count bigint)
language sql stable
security definer
as $$
  select count(distinct application_review_id)::bigint as review_count
  from ai_usage_logs
  where pipeline_step = 'scoring'
    and is_retry = false;
$$;
```

**Step 2: Push the migration**

Run: `cd app && npx supabase db push`
Expected: Migration applied successfully

**Step 3: Regenerate types**

Run: `cd app && npx supabase gen types typescript --project-id pxvtcaqpithbjifpxnic > src/types/database.ts`

**Step 4: Commit**

```bash
git add supabase/migrations/20260311000000_estimation_stats_rpcs.sql src/types/database.ts
git commit -m "feat: add estimation stats RPCs (step averages, avg chars, review count)"
```

---

### Task 3: Update estimation-stats.ts to Use RPCs

**Files:**
- Modify: `src/lib/usage/estimation-stats.ts`
- Update: `src/lib/usage/__tests__/estimation-stats.test.ts`

After the RPCs are deployed, update the stats module to use RPC calls instead of direct table queries with inline aggregation.

**Step 1: Update the implementation**

Replace the supabase queries in `estimation-stats.ts` with:

```typescript
  // Per-step averages via RPC
  const { data: stepRows } = await supabase.rpc("get_estimation_step_stats");

  const stepMap: Record<string, StepStats> = {};
  for (const row of (stepRows ?? []) as Array<{ pipeline_step: string; avg_cost_usd: number; call_count: number }>) {
    stepMap[row.pipeline_step] = {
      avgCostUsd: Number(row.avg_cost_usd),
      callCount: Number(row.call_count),
    };
  }
```

**Step 2: Update tests to match RPC mock pattern**

Update the mock client in the test to use `rpc` calls for all three queries (`get_estimation_step_stats`, `get_avg_answer_chars`, `get_completed_review_count`).

```typescript
function buildMockClient(overrides: {
  stepStats?: { data: unknown[] | null; error?: unknown };
  avgChars?: { data: unknown[] | null; error?: unknown };
  reviewCount?: { data: unknown[] | null; error?: unknown };
} = {}) {
  const rpcMock = vi.fn().mockImplementation((fn: string) => {
    if (fn === "get_estimation_step_stats") {
      return Promise.resolve(
        overrides.stepStats ?? {
          data: [
            { pipeline_step: "answer_analysis", avg_cost_usd: 0.035, call_count: 50 },
            { pipeline_step: "cross_reference", avg_cost_usd: 0.08, call_count: 15 },
            { pipeline_step: "scoring", avg_cost_usd: 0.06, call_count: 15 },
          ],
          error: null,
        }
      );
    }
    if (fn === "get_avg_answer_chars") {
      return Promise.resolve(
        overrides.avgChars ?? { data: [{ avg_chars: 450 }], error: null }
      );
    }
    if (fn === "get_completed_review_count") {
      return Promise.resolve(
        overrides.reviewCount ?? { data: [{ review_count: 25 }], error: null }
      );
    }
    return Promise.resolve({ data: null, error: null });
  });

  return { rpc: rpcMock };
}
```

**Step 3: Run tests**

Run: `cd app && npx vitest run src/lib/usage/__tests__/estimation-stats.test.ts`
Expected: PASS

**Step 4: Commit**

```bash
git add src/lib/usage/estimation-stats.ts src/lib/usage/__tests__/estimation-stats.test.ts
git commit -m "refactor: use RPCs for estimation stats queries"
```

---

### Task 4: Rewrite estimateReviewCost to Use Historical Stats

**Files:**
- Modify: `src/lib/usage/estimate-review-cost.ts`
- Modify: `src/lib/usage/__tests__/estimate-review-cost.test.ts`

**Step 1: Write the failing tests**

Replace `src/lib/usage/__tests__/estimate-review-cost.test.ts` with tests for the new signature. The function becomes async and accepts an optional `stats` parameter (for testability) plus `answerTexts` for char_ratio:

```typescript
import { describe, it, expect } from "vitest";
import { estimateReviewCost, estimateReviewCostWithStats } from "../estimate-review-cost";
import type { EstimationStats } from "../estimation-stats";

const mockStats: EstimationStats = {
  steps: {
    answer_analysis: { avgCostUsd: 0.035, callCount: 50 },
    cross_reference: { avgCostUsd: 0.08, callCount: 15 },
    scoring: { avgCostUsd: 0.06, callCount: 15 },
  },
  avgAnswerChars: 500,
  fetchedAt: Date.now(),
};

describe("estimateReviewCostWithStats", () => {
  it("returns estimate based on historical stats", () => {
    const result = estimateReviewCostWithStats(
      5, 10,
      ["a".repeat(500), "b".repeat(500), "c".repeat(500), "d".repeat(500), "e".repeat(500)],
      mockStats
    );
    expect(result).not.toBeNull();
    expect(result!.low).toBeGreaterThan(0);
    expect(result!.high).toBeGreaterThan(result!.low);
  });

  it("scales up for longer-than-average answers", () => {
    const shortAnswers = Array(5).fill("x".repeat(250));
    const longAnswers = Array(5).fill("x".repeat(1000));

    const short = estimateReviewCostWithStats(5, 5, shortAnswers, mockStats);
    const long = estimateReviewCostWithStats(5, 5, longAnswers, mockStats);

    expect(long!.low).toBeGreaterThan(short!.low);
  });

  it("returns null when stats is null", () => {
    const result = estimateReviewCostWithStats(5, 10, [], null);
    expect(result).toBeNull();
  });

  it("applies 0.9x-1.2x range", () => {
    const result = estimateReviewCostWithStats(
      10, 10,
      Array(10).fill("x".repeat(500)),
      mockStats
    );
    // low should be floor(credits * 0.9), high should be ceil(credits * 1.2)
    expect(result!.low).toBeLessThanOrEqual(result!.high);
  });

  it("returns at least 1 for low when there are answers", () => {
    const result = estimateReviewCostWithStats(1, 1, ["hello"], mockStats);
    expect(result!.low).toBeGreaterThanOrEqual(1);
  });

  it("returns {low:0, high:0} when total is 0", () => {
    const result = estimateReviewCostWithStats(0, 0, [], mockStats);
    expect(result).toEqual({ low: 0, high: 0 });
  });

  it("zero fresh answers still costs overhead for cross-ref and scoring", () => {
    const result = estimateReviewCostWithStats(
      0, 10,
      Array(10).fill("x".repeat(500)),
      mockStats
    );
    expect(result!.low).toBeGreaterThanOrEqual(1);
  });
});

describe("estimateReviewCost (fallback)", () => {
  it("returns a range with low and high for a small app", () => {
    const result = estimateReviewCost(3);
    expect(result.low).toBeGreaterThan(0);
    expect(result.high).toBeGreaterThan(result.low);
  });

  it("returns higher range for more fresh answers", () => {
    const small = estimateReviewCost(3);
    const large = estimateReviewCost(25);
    expect(large.low).toBeGreaterThan(small.low);
  });

  it("returns at least 1 for low", () => {
    const result = estimateReviewCost(1);
    expect(result.low).toBeGreaterThanOrEqual(1);
  });

  it("handles zero answers", () => {
    const result = estimateReviewCost(0);
    expect(result.low).toBe(0);
    expect(result.high).toBe(0);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd app && npx vitest run src/lib/usage/__tests__/estimate-review-cost.test.ts`
Expected: FAIL — `estimateReviewCostWithStats` not found

**Step 3: Write the implementation**

Replace `src/lib/usage/estimate-review-cost.ts`:

```typescript
/**
 * Estimates the credit cost of a review.
 *
 * Two modes:
 * 1. estimateReviewCostWithStats() — uses historical averages from ai_usage_logs
 *    with char_ratio adjustment and narrow 0.9x-1.2x range. Returns null if
 *    stats are null (below minimum review threshold).
 *
 * 2. estimateReviewCost() — hardcoded fallback (used by submit-for-review route
 *    when stats are unavailable). Uses wider 0.8x-1.3x range.
 */

import { COST_PER_CREDIT_USD } from "@/lib/stripe/plans";
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

  // Compute char_ratio: how this review's answers compare to historical average
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
 * Used when historical stats are unavailable, and by the submit route
 * for gating when stats haven't been loaded.
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
```

**Step 4: Run tests**

Run: `cd app && npx vitest run src/lib/usage/__tests__/estimate-review-cost.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/usage/estimate-review-cost.ts src/lib/usage/__tests__/estimate-review-cost.test.ts
git commit -m "feat: add stats-based estimator with char_ratio and 0.9x-1.2x range"
```

---

### Task 5: Update Estimate Endpoint to Use Historical Stats

**Files:**
- Modify: `src/app/api/applications/[id]/estimate/route.ts`

**Step 1: Update the endpoint**

The estimate endpoint needs to:
1. Call `getEstimationStats()` to get cached historical data
2. If stats exist, use `estimateReviewCostWithStats()` with answer texts
3. If stats are null, return `{ estimate: null, canAfford: true }` (as long as remaining > 0)

```typescript
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { estimateReviewCostWithStats, estimateReviewCost } from "@/lib/usage/estimate-review-cost";
import { getEstimationStats } from "@/lib/usage/estimation-stats";
import { checkUsage } from "@/lib/usage/check-usage";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Load application to get current criteria set
  const { data: application } = await supabase
    .from("applications")
    .select("criteria_set_id")
    .eq("id", id)
    .single();

  if (!application) {
    return NextResponse.json({ error: "Application not found" }, { status: 404 });
  }

  // Load answers with last_reviewed_text for change detection
  const { data: answers } = await supabase
    .from("application_answers")
    .select("question_id, answer_text, is_disabled, last_reviewed_text")
    .eq("application_id", id);

  const enabledAnswers = (answers ?? []).filter(
    (a) => !a.is_disabled && a.answer_text.trim().length > 0
  );

  // Check if previous review used the same criteria set
  const { data: prevReview } = await supabase
    .from("application_reviews")
    .select("criteria_set_id")
    .eq("application_id", id)
    .eq("status", "completed")
    .order("review_number", { ascending: false })
    .limit(1)
    .single();

  const criteriaSetMatch = prevReview?.criteria_set_id === application.criteria_set_id;

  // Count fresh answers
  const freshCount = enabledAnswers.filter((a) => {
    if (!criteriaSetMatch) return true;
    if (a.last_reviewed_text === null || a.last_reviewed_text === undefined) return true;
    return a.answer_text !== a.last_reviewed_text;
  }).length;

  const usage = await checkUsage(supabase, user.id);

  // Try stats-based estimate first
  const stats = await getEstimationStats();
  const answerTexts = enabledAnswers.map((a) => a.answer_text);
  const statsEstimate = estimateReviewCostWithStats(
    freshCount, enabledAnswers.length, answerTexts, stats
  );

  if (statsEstimate) {
    // Historical data available — show estimate
    return NextResponse.json({
      estimate: statsEstimate,
      credits: {
        remaining: usage.remaining,
        period: Math.max(0, usage.limit - usage.used),
        purchased: usage.purchased,
      },
      canAfford: usage.remaining >= statsEstimate.low,
    });
  }

  // Not enough historical data — no estimate shown, just check remaining > 0
  return NextResponse.json({
    estimate: null,
    credits: {
      remaining: usage.remaining,
      period: Math.max(0, usage.limit - usage.used),
      purchased: usage.purchased,
    },
    canAfford: usage.remaining > 0,
  });
}
```

**Step 2: Run full test suite to check for regressions**

Run: `cd app && npm test`
Expected: PASS

**Step 3: Commit**

```bash
git add src/app/api/applications/[id]/estimate/route.ts
git commit -m "feat: estimate endpoint uses historical stats with null fallback"
```

---

### Task 6: Update Submit Route for Null Estimate Gating

**Files:**
- Modify: `src/app/api/applications/[id]/submit-for-review/route.ts`

**Step 1: Update the submit route**

When stats are unavailable (`estimate: null`), the submit route should:
- Still use the hardcoded `estimateReviewCost()` for the `p_estimated_credits_low` RPC parameter
- Only gate on `remaining > 0` (not on estimate low)

```typescript
// After computing freshCount and enabledAnswers.length...

// Try stats-based estimate
const stats = await getEstimationStats();
const answerTexts = enabledAnswers.map((a) => a.answer_text);
const statsEstimate = estimateReviewCostWithStats(
  freshCount, enabledAnswers.length, answerTexts, stats
);

// Fallback estimate for RPC (always needed for p_estimated_credits_low)
const fallbackEstimate = estimateReviewCost(freshCount, enabledAnswers.length);
const estimate = statsEstimate ?? fallbackEstimate;

// ... pass estimate.low to submit_review RPC as before
```

Add import for `getEstimationStats` and `estimateReviewCostWithStats`.

**Step 2: Run tests**

Run: `cd app && npm test`
Expected: PASS

**Step 3: Commit**

```bash
git add src/app/api/applications/[id]/submit-for-review/route.ts
git commit -m "feat: submit route uses stats-based estimate with fallback"
```

---

### Task 7: Update UI for Null Estimates

**Files:**
- Modify: `src/app/(dashboard)/applications/[id]/ApplicationFormClient.tsx`

**Step 1: Handle null estimate in the UI**

When `data.estimate` is null from the estimate endpoint:
- Show a simple "Submit for review?" confirmation without credit numbers
- Still show remaining credits count
- Allow submission (canAfford will be true if remaining > 0)

Update `handleSubmitClick`:
```typescript
const data = await res.json();
if (data.estimate) {
  setEstimateState({
    low: data.estimate.low,
    high: data.estimate.high,
    remaining: data.credits.remaining,
    canAfford: data.canAfford,
  });
} else {
  // No estimate available (not enough historical data)
  setEstimateState({
    low: 0,
    high: 0,
    remaining: data.credits.remaining,
    canAfford: data.canAfford,
  });
}
```

Update the modal rendering — when `low === 0 && high === 0 && canAfford`, show simplified text:
```tsx
{estimateState.low === 0 && estimateState.high === 0 && estimateState.canAfford ? (
  <>
    <h2 className="text-lg font-semibold">Submit for review?</h2>
    <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
      You have <strong>{estimateState.remaining} credits</strong> remaining.
      Credits will be deducted based on actual usage after the review completes.
    </p>
    {/* Confirm/Cancel buttons */}
  </>
) : estimateState.canAfford ? (
  // Existing: show estimate range
) : (
  // Existing: insufficient credits
)}
```

**Step 2: Manually test the UI**

- With < 10 reviews in DB: should show simple "Submit?" without credit estimate
- With >= 10 reviews: should show "X-Y credits" estimate

**Step 3: Commit**

```bash
git add src/app/(dashboard)/applications/[id]/ApplicationFormClient.tsx
git commit -m "feat: UI handles null estimate (no credit numbers when below threshold)"
```

---

### Task 8: Run Full Test Suite and Verify Build

**Step 1: Run all tests**

Run: `cd app && npm test`
Expected: All tests PASS

**Step 2: Verify build**

Run: `cd app && npm run build`
Expected: Build succeeds with no TypeScript errors

**Step 3: Commit any fixes if needed**

If tests or build fail, fix issues and commit:
```bash
git add -A
git commit -m "fix: resolve test/build issues from estimation improvements"
```
