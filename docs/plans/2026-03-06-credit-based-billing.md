# Credit-Based Billing Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace flat per-review billing with a credit-based system where credits map to actual AI token costs, with Basic (£19/mo, 30 credits) and Pro (£49/mo, 100 credits) tiers plus purchasable top-up packs.

**Architecture:** New SQL migration adds `purchased_credits` to profiles, renames usage columns from reviews to credits, and replaces the `submit_review` / `rollback_usage` RPCs with credit-aware versions. A new `estimate-review-cost` utility calculates expected credit range before submission. The Inngest pipeline deducts actual credits post-completion. Stripe integration adds Basic tier subscription + two top-up product types.

**Tech Stack:** Supabase (SQL migrations, RPCs, RLS), Next.js 16 API routes, Stripe (subscriptions + one-time payments), Inngest, Vitest, TypeScript.

**Design doc:** `docs/plans/2026-03-06-credit-based-billing-design.md`

---

## Task 1: Update Plans Configuration

**Files:**
- Modify: `src/lib/stripe/plans.ts`
- Test: `src/lib/stripe/__tests__/plans.test.ts`

**Step 1: Write the failing test**

Create `src/lib/stripe/__tests__/plans.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { PLANS, TOPUP_PACKS, COST_PER_CREDIT_USD } from "../plans";

describe("PLANS", () => {
  it("has free, basic, and pro tiers", () => {
    expect(PLANS.free).toBeDefined();
    expect(PLANS.basic).toBeDefined();
    expect(PLANS.pro).toBeDefined();
  });

  it("free tier has 0 credits", () => {
    expect(PLANS.free.creditsPerMonth).toBe(0);
  });

  it("basic tier has 30 credits at £19/month", () => {
    expect(PLANS.basic.creditsPerMonth).toBe(30);
    expect(PLANS.basic.priceMonthly).toBe(1900);
  });

  it("pro tier has 100 credits at £49/month", () => {
    expect(PLANS.pro.creditsPerMonth).toBe(100);
    expect(PLANS.pro.priceMonthly).toBe(4900);
  });

  it("does not have reviewsPerMonth on any tier", () => {
    for (const plan of Object.values(PLANS)) {
      expect(plan).not.toHaveProperty("reviewsPerMonth");
    }
  });
});

describe("TOPUP_PACKS", () => {
  it("has standard and pro packs", () => {
    expect(TOPUP_PACKS.standard).toBeDefined();
    expect(TOPUP_PACKS.pro).toBeDefined();
  });

  it("standard pack: £5 for 10 credits, available to basic and pro", () => {
    expect(TOPUP_PACKS.standard.pricePence).toBe(500);
    expect(TOPUP_PACKS.standard.credits).toBe(10);
    expect(TOPUP_PACKS.standard.availableTo).toEqual(["basic", "pro"]);
  });

  it("pro pack: £10 for 30 credits, available to pro only", () => {
    expect(TOPUP_PACKS.pro.pricePence).toBe(1000);
    expect(TOPUP_PACKS.pro.credits).toBe(30);
    expect(TOPUP_PACKS.pro.availableTo).toEqual(["pro"]);
  });
});

describe("COST_PER_CREDIT_USD", () => {
  it("is a positive number", () => {
    expect(COST_PER_CREDIT_USD).toBeGreaterThan(0);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd app && npx vitest run src/lib/stripe/__tests__/plans.test.ts`
Expected: FAIL — imports don't exist yet.

**Step 3: Write the implementation**

Replace `src/lib/stripe/plans.ts`:

```typescript
export const COST_PER_CREDIT_USD = 0.05;

export const PLANS = {
  free: {
    name: "Free",
    price: 0,
    creditsPerMonth: 0,
    features: ["No active plan"],
  },
  basic: {
    name: "Basic",
    priceMonthly: 1900, // pence
    creditsPerMonth: 30,
    model: "sonnet" as const,
    stripePriceId: process.env.STRIPE_BASIC_PRICE_ID!,
    features: ["Full review", "Inline comments", "Improvement appendix"],
  },
  pro: {
    name: "Pro",
    priceMonthly: 4900, // pence
    creditsPerMonth: 100,
    model: "sonnet" as const,
    stripePriceId: process.env.STRIPE_PRO_PRICE_ID!,
    features: [
      "Full review",
      "Inline comments",
      "Improvement appendix",
      "Pro top-up packs",
    ],
  },
} as const;

export type PlanTier = keyof typeof PLANS;

export const TOPUP_PACKS = {
  standard: {
    name: "Standard Top-Up",
    pricePence: 500,
    credits: 10,
    availableTo: ["basic", "pro"] as const,
    stripePriceId: process.env.STRIPE_STANDARD_TOPUP_PRICE_ID!,
  },
  pro: {
    name: "Pro Top-Up",
    pricePence: 1000,
    credits: 30,
    availableTo: ["pro"] as const,
    stripePriceId: process.env.STRIPE_PRO_TOPUP_PRICE_ID!,
  },
} as const;

export type TopupPack = keyof typeof TOPUP_PACKS;
```

**Step 4: Run test to verify it passes**

Run: `cd app && npx vitest run src/lib/stripe/__tests__/plans.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/stripe/plans.ts src/lib/stripe/__tests__/plans.test.ts
git commit -m "feat: update plans config for credit-based billing (basic/pro tiers, top-up packs)"
```

---

## Task 2: SQL Migration — Schema Changes

**Files:**
- Create: `supabase/migrations/YYYYMMDD000000_credit_based_billing.sql`

**Step 1: Write the migration**

Create migration file (use current date for prefix, e.g. `20260306100000_credit_based_billing.sql`):

```sql
-- 1. Add 'basic' to subscription_tier CHECK constraint on profiles
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_subscription_tier_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_subscription_tier_check
  CHECK (subscription_tier IN ('free', 'basic', 'pro'));

-- 2. Add purchased_credits to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS purchased_credits integer NOT NULL DEFAULT 0;

-- 3. Rename usage columns: reviews → credits
ALTER TABLE public.usage
  RENAME COLUMN reviews_used TO credits_used;

ALTER TABLE public.usage
  RENAME COLUMN reviews_limit TO credits_limit;

-- 4. Add credits_charged to application_reviews
ALTER TABLE public.application_reviews
  ADD COLUMN IF NOT EXISTS credits_charged integer NOT NULL DEFAULT 0;

-- 5. Create credit_purchases table (repurpose concept from review_purchases)
CREATE TABLE IF NOT EXISTS public.credit_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  credits integer NOT NULL,
  amount_pence integer NOT NULL,
  pack_type text NOT NULL CHECK (pack_type IN ('standard', 'pro')),
  stripe_payment_intent_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS for credit_purchases
ALTER TABLE public.credit_purchases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own credit purchases"
  ON public.credit_purchases FOR SELECT
  USING (auth.uid() = user_id);

-- 6. Replace submit_review RPC with credit-aware version
CREATE OR REPLACE FUNCTION submit_review(
  p_application_id UUID,
  p_user_id UUID,
  p_review_number INT,
  p_questions_set_id UUID,
  p_criteria_set_id UUID,
  p_period TEXT,
  p_default_limit INT DEFAULT 0,
  p_estimated_credits_low INT DEFAULT 0
)
RETURNS TABLE(review_id UUID, review_number INT) AS $$
DECLARE
  v_review_id UUID;
  v_credits_used INT;
  v_credits_limit INT;
  v_bonus INT;
  v_purchased INT;
  v_available INT;
BEGIN
  -- Ensure usage row exists
  INSERT INTO public.usage (user_id, period, credits_used, credits_limit, bonus_reviews)
  VALUES (p_user_id, p_period, 0, p_default_limit, 0)
  ON CONFLICT (user_id, period) DO NOTHING;

  -- Get current credit state
  SELECT u.credits_used, u.credits_limit, u.bonus_reviews
  INTO v_credits_used, v_credits_limit, v_bonus
  FROM public.usage u
  WHERE u.user_id = p_user_id AND u.period = p_period
  FOR UPDATE;

  -- Get purchased credits
  SELECT purchased_credits INTO v_purchased
  FROM public.profiles
  WHERE id = p_user_id
  FOR UPDATE;

  -- Calculate available: (limit - used) + bonus + purchased
  v_available := GREATEST(0, v_credits_limit - v_credits_used) + v_bonus + COALESCE(v_purchased, 0);

  -- Check if enough credits for low estimate
  IF v_available < p_estimated_credits_low THEN
    RAISE EXCEPTION 'INSUFFICIENT_CREDITS';
  END IF;

  -- Check no in-progress reviews for this user
  IF EXISTS (
    SELECT 1 FROM public.application_reviews ar
    JOIN public.applications a ON a.id = ar.application_id
    WHERE a.user_id = p_user_id
    AND ar.status IN ('pending', 'analysing', 'cross_referencing', 'scoring')
  ) THEN
    RAISE EXCEPTION 'REVIEW_IN_PROGRESS';
  END IF;

  -- Create review row
  INSERT INTO public.application_reviews (
    application_id, review_number, status, questions_set_id, criteria_set_id
  )
  VALUES (
    p_application_id, p_review_number, 'pending', p_questions_set_id, p_criteria_set_id
  )
  RETURNING id INTO v_review_id;

  -- Update application
  UPDATE public.applications
  SET status = 'submitted_for_review',
      review_count = p_review_number
  WHERE id = p_application_id;

  RETURN QUERY SELECT v_review_id, p_review_number;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Create deduct_credits RPC (called after pipeline completes)
CREATE OR REPLACE FUNCTION deduct_credits(
  p_user_id UUID,
  p_review_id UUID,
  p_credits INT,
  p_period TEXT
)
RETURNS TABLE(period_deducted INT, purchased_deducted INT) AS $$
DECLARE
  v_credits_remaining INT;
  v_period_available INT;
  v_purchased INT;
  v_from_period INT;
  v_from_purchased INT;
  v_actual_credits INT;
BEGIN
  -- Get period credits available
  SELECT GREATEST(0, credits_limit - credits_used + bonus_reviews)
  INTO v_period_available
  FROM public.usage
  WHERE user_id = p_user_id AND period = p_period
  FOR UPDATE;

  -- Get purchased credits
  SELECT purchased_credits INTO v_purchased
  FROM public.profiles
  WHERE id = p_user_id
  FOR UPDATE;

  -- Cap at available
  v_actual_credits := LEAST(p_credits, COALESCE(v_period_available, 0) + COALESCE(v_purchased, 0));

  -- Deduct from period first
  v_from_period := LEAST(v_actual_credits, COALESCE(v_period_available, 0));
  v_from_purchased := v_actual_credits - v_from_period;

  -- Update usage table
  IF v_from_period > 0 THEN
    UPDATE public.usage
    SET credits_used = credits_used + v_from_period
    WHERE user_id = p_user_id AND period = p_period;
  END IF;

  -- Update purchased credits
  IF v_from_purchased > 0 THEN
    UPDATE public.profiles
    SET purchased_credits = GREATEST(0, purchased_credits - v_from_purchased)
    WHERE id = p_user_id;
  END IF;

  -- Stamp credits_charged on review
  UPDATE public.application_reviews
  SET credits_charged = v_actual_credits
  WHERE id = p_review_id;

  RETURN QUERY SELECT v_from_period, v_from_purchased;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. Replace rollback_usage with credit-aware version
CREATE OR REPLACE FUNCTION rollback_usage(p_user_id UUID)
RETURNS void AS $$
DECLARE
  v_review RECORD;
  v_period_to_refund INT;
  v_purchased_to_refund INT;
BEGIN
  -- Find the most recent review that was charged but failed
  -- (has credits_charged > 0 and status = 'failed')
  SELECT ar.id, ar.credits_charged, a.user_id
  INTO v_review
  FROM public.application_reviews ar
  JOIN public.applications a ON a.id = ar.application_id
  WHERE a.user_id = p_user_id
  AND ar.status = 'failed'
  AND ar.credits_charged > 0
  ORDER BY ar.created_at DESC
  LIMIT 1;

  -- If no charged failed review found, nothing to rollback
  -- (credits are deducted post-completion, so failed reviews typically have 0 charged)
  IF v_review IS NULL THEN
    RETURN;
  END IF;

  -- Zero out credits_charged on the review
  UPDATE public.application_reviews
  SET credits_charged = 0
  WHERE id = v_review.id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

**Step 2: Push migration to Supabase**

Run: `cd app && npx supabase db push`
Expected: Migration applies successfully.

**Step 3: Regenerate TypeScript types**

Run: `cd app && npx supabase gen types typescript --project-id pxvtcaqpithbjifpxnic > src/types/database.ts`

**Step 4: Commit**

```bash
git add supabase/migrations/ src/types/database.ts
git commit -m "feat: SQL migration for credit-based billing (schema + RPCs)"
```

---

## Task 3: Update Usage Checking for Credits

**Files:**
- Modify: `src/lib/usage/check-usage.ts`
- Modify: `src/lib/usage/__tests__/check-usage.test.ts`
- Modify: `src/lib/usage/period.ts`

**Step 1: Update the tests**

Replace `src/lib/usage/__tests__/check-usage.test.ts` — update all references from `reviews` to `credits`, tier limits from `{free: 0, pro: 10}` to `{free: 0, basic: 30, pro: 100}`. Key test cases:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { checkUsage } from "../check-usage";

// Mock supabase client
function createMockSupabase(profileData: any, usageData: any) {
  return {
    from: vi.fn((table: string) => {
      if (table === "profiles") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: profileData, error: null }),
        };
      }
      if (table === "usage") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: usageData, error: null }),
        };
      }
      return {};
    }),
  } as any;
}

describe("checkUsage", () => {
  it("free user gets 0 credits", async () => {
    const supabase = createMockSupabase(
      { subscription_tier: "free", current_period_end: null, purchased_credits: 0 },
      null
    );
    const result = await checkUsage(supabase, "user1");
    expect(result.allowed).toBe(false);
    expect(result.limit).toBe(0);
    expect(result.remaining).toBe(0);
  });

  it("basic user gets 30 credits", async () => {
    const supabase = createMockSupabase(
      { subscription_tier: "basic", current_period_end: "2026-04-06T00:00:00Z", purchased_credits: 0 },
      null
    );
    const result = await checkUsage(supabase, "user1");
    expect(result.allowed).toBe(true);
    expect(result.limit).toBe(30);
    expect(result.remaining).toBe(30);
  });

  it("pro user gets 100 credits", async () => {
    const supabase = createMockSupabase(
      { subscription_tier: "pro", current_period_end: "2026-04-06T00:00:00Z", purchased_credits: 0 },
      null
    );
    const result = await checkUsage(supabase, "user1");
    expect(result.allowed).toBe(true);
    expect(result.limit).toBe(100);
    expect(result.remaining).toBe(100);
  });

  it("includes purchased credits in remaining", async () => {
    const supabase = createMockSupabase(
      { subscription_tier: "basic", current_period_end: "2026-04-06T00:00:00Z", purchased_credits: 15 },
      { credits_used: 25, credits_limit: 30, bonus_reviews: 0 }
    );
    const result = await checkUsage(supabase, "user1");
    // 30 - 25 = 5 period remaining + 15 purchased = 20
    expect(result.remaining).toBe(20);
    expect(result.purchased).toBe(15);
    expect(result.allowed).toBe(true);
  });

  it("purchased credits keep user allowed when period credits exhausted", async () => {
    const supabase = createMockSupabase(
      { subscription_tier: "basic", current_period_end: "2026-04-06T00:00:00Z", purchased_credits: 10 },
      { credits_used: 30, credits_limit: 30, bonus_reviews: 0 }
    );
    const result = await checkUsage(supabase, "user1");
    expect(result.remaining).toBe(10);
    expect(result.allowed).toBe(true);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd app && npx vitest run src/lib/usage/__tests__/check-usage.test.ts`
Expected: FAIL

**Step 3: Update check-usage.ts**

```typescript
import { SupabaseClient } from "@supabase/supabase-js";
import { getUsagePeriod } from "./period";

const TIER_LIMITS: Record<string, number> = {
  free: 0,
  basic: 30,
  pro: 100,
};

export interface UsageResult {
  allowed: boolean;
  used: number;
  limit: number;
  bonus: number;
  purchased: number;
  remaining: number;
  period: string;
  resetDate: Date;
}

export async function checkUsage(
  supabase: SupabaseClient,
  userId: string
): Promise<UsageResult> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("subscription_tier, current_period_end, purchased_credits")
    .eq("id", userId)
    .single();

  const tier = profile?.subscription_tier ?? "free";
  const limit = TIER_LIMITS[tier] ?? TIER_LIMITS.free;
  const purchased = profile?.purchased_credits ?? 0;
  const { periodKey: period, resetDate } = getUsagePeriod(tier, profile?.current_period_end);

  const { data: usage } = await supabase
    .from("usage")
    .select("credits_used, credits_limit, bonus_reviews")
    .eq("user_id", userId)
    .eq("period", period)
    .single();

  if (!usage) {
    return {
      allowed: limit + purchased > 0,
      used: 0,
      limit,
      bonus: 0,
      purchased,
      remaining: limit + purchased,
      period,
      resetDate,
    };
  }

  const effectiveLimit = (usage.credits_limit ?? limit) + (usage.bonus_reviews ?? 0);
  const periodRemaining = Math.max(0, effectiveLimit - (usage.credits_used ?? 0));
  const remaining = periodRemaining + purchased;

  return {
    allowed: remaining > 0,
    used: usage.credits_used ?? 0,
    limit: usage.credits_limit ?? limit,
    bonus: usage.bonus_reviews ?? 0,
    purchased,
    remaining,
    period,
    resetDate,
  };
}
```

**Step 4: Update period.ts** — change the `tier === "pro"` check to also handle `"basic"`:

In `src/lib/usage/period.ts`, line 14, change:
```typescript
if (tier === "pro" && currentPeriodEnd) {
```
to:
```typescript
if ((tier === "pro" || tier === "basic") && currentPeriodEnd) {
```

**Step 5: Run tests to verify they pass**

Run: `cd app && npx vitest run src/lib/usage/__tests__/check-usage.test.ts`
Expected: PASS

**Step 6: Run the period tests too**

Run: `cd app && npx vitest run src/lib/usage/__tests__/period.test.ts`
Expected: PASS (or update tests if needed to cover basic tier)

**Step 7: Commit**

```bash
git add src/lib/usage/check-usage.ts src/lib/usage/period.ts src/lib/usage/__tests__/check-usage.test.ts
git commit -m "feat: update usage checking for credit-based billing"
```

---

## Task 4: Review Cost Estimator

**Files:**
- Create: `src/lib/usage/estimate-review-cost.ts`
- Create: `src/lib/usage/__tests__/estimate-review-cost.test.ts`

**Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "vitest";
import { estimateReviewCost } from "../estimate-review-cost";

describe("estimateReviewCost", () => {
  it("returns a range with low and high for a small app", () => {
    const result = estimateReviewCost(3);
    expect(result.low).toBeGreaterThan(0);
    expect(result.high).toBeGreaterThan(result.low);
  });

  it("returns higher range for more answers", () => {
    const small = estimateReviewCost(3);
    const large = estimateReviewCost(25);
    expect(large.low).toBeGreaterThan(small.low);
    expect(large.high).toBeGreaterThan(small.high);
  });

  it("high estimate includes 1.3x buffer", () => {
    const result = estimateReviewCost(10);
    // estimate = 10 * AVG_ANSWER_CREDITS + OVERHEAD_CREDITS
    // high = ceil(estimate * 1.3)
    // low = floor(estimate * 0.8)
    expect(result.high).toBeGreaterThanOrEqual(Math.ceil(result.low * 1.3 / 0.8));
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

**Step 2: Run test to verify it fails**

Run: `cd app && npx vitest run src/lib/usage/__tests__/estimate-review-cost.test.ts`
Expected: FAIL

**Step 3: Write the implementation**

```typescript
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
```

**Step 4: Run test to verify it passes**

Run: `cd app && npx vitest run src/lib/usage/__tests__/estimate-review-cost.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/usage/estimate-review-cost.ts src/lib/usage/__tests__/estimate-review-cost.test.ts
git commit -m "feat: add review cost estimator for credit-based gating"
```

---

## Task 5: Credit Calculation from Token Usage

**Files:**
- Create: `src/lib/usage/calculate-credits.ts`
- Create: `src/lib/usage/__tests__/calculate-credits.test.ts`

**Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "vitest";
import { calculateCreditsFromCost } from "../calculate-credits";

describe("calculateCreditsFromCost", () => {
  it("rounds up to nearest credit", () => {
    // $0.12 / $0.05 = 2.4 → 3 credits
    expect(calculateCreditsFromCost(0.12)).toBe(3);
  });

  it("exact multiple returns exact credits", () => {
    // $0.10 / $0.05 = 2.0 → 2 credits
    expect(calculateCreditsFromCost(0.10)).toBe(2);
  });

  it("returns 0 for zero cost", () => {
    expect(calculateCreditsFromCost(0)).toBe(0);
  });

  it("returns 1 for very small cost", () => {
    expect(calculateCreditsFromCost(0.001)).toBe(1);
  });

  it("handles typical small review cost", () => {
    // ~$0.15 → 3 credits
    expect(calculateCreditsFromCost(0.15)).toBe(3);
  });

  it("handles typical large review cost", () => {
    // ~$1.20 → 24 credits
    expect(calculateCreditsFromCost(1.20)).toBe(24);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd app && npx vitest run src/lib/usage/__tests__/calculate-credits.test.ts`
Expected: FAIL

**Step 3: Write the implementation**

```typescript
import { COST_PER_CREDIT_USD } from "@/lib/stripe/plans";

/**
 * Converts a USD cost into credits. Always rounds up so the user is never
 * undercharged (fractional credits always cost 1 full credit).
 */
export function calculateCreditsFromCost(costUsd: number): number {
  if (costUsd <= 0) return 0;
  return Math.ceil(costUsd / COST_PER_CREDIT_USD);
}
```

**Step 4: Run test to verify it passes**

Run: `cd app && npx vitest run src/lib/usage/__tests__/calculate-credits.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/usage/calculate-credits.ts src/lib/usage/__tests__/calculate-credits.test.ts
git commit -m "feat: add credit calculation from USD cost"
```

---

## Task 6: Update Submit-for-Review API Route

**Files:**
- Modify: `src/app/api/applications/[id]/submit-for-review/route.ts`
- Modify: `src/app/api/__tests__/applications.test.ts` (if submit tests exist there)

**Step 1: Update the route**

Key changes to `src/app/api/applications/[id]/submit-for-review/route.ts`:

1. Accept `basic` as well as `pro` tier (line 49: change `tier !== "pro"` to `tier === "free"`)
2. Replace `defaultLimit = 10` with tier-based credit limit: `PLANS[tier].creditsPerMonth`
3. Count enabled non-empty answers and compute estimate via `estimateReviewCost()`
4. Pass `p_estimated_credits_low` to the `submit_review` RPC
5. Handle `INSUFFICIENT_CREDITS` and `REVIEW_IN_PROGRESS` exceptions
6. Return the estimate range in the response for the UI

Updated route (full replacement):

```typescript
import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { inngest } from "@/lib/inngest/client";
import { getUsagePeriod } from "@/lib/usage/period";
import { estimateReviewCost } from "@/lib/usage/estimate-review-cost";
import { PLANS } from "@/lib/stripe/plans";

export async function POST(
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

  // Verify ownership and status (RLS enforced)
  const { data: application } = await supabase
    .from("applications")
    .select("id, status, review_count, fund_id, criteria_set_id, questions_set_id")
    .eq("id", id)
    .single();

  if (!application) {
    return NextResponse.json({ error: "Application not found" }, { status: 404 });
  }

  if (application.status !== "draft" && application.status !== "reviewed") {
    return NextResponse.json(
      { error: "Application is already being reviewed" },
      { status: 409 }
    );
  }

  const serviceClient = createServiceClient();

  // Get profile for tier, status, and billing period
  const { data: profile } = await serviceClient
    .from("profiles")
    .select("subscription_tier, subscription_status, current_period_end")
    .eq("id", user.id)
    .single();

  const tier = (profile?.subscription_tier ?? "free") as keyof typeof PLANS;

  if (tier === "free") {
    return NextResponse.json(
      { error: "Active subscription required" },
      { status: 403 }
    );
  }

  if (profile?.subscription_status !== "active") {
    return NextResponse.json(
      { error: "Active subscription required" },
      { status: 403 }
    );
  }

  const defaultLimit = PLANS[tier]?.creditsPerMonth ?? 0;
  const { periodKey: period } = getUsagePeriod(tier, profile?.current_period_end);

  // Check there are non-empty, non-disabled answers
  const { data: answers } = await supabase
    .from("application_answers")
    .select("question_id, answer_text, is_disabled")
    .eq("application_id", id);

  const enabledAnswers = (answers ?? []).filter(
    (a) => !a.is_disabled && a.answer_text.trim().length > 0
  );
  if (enabledAnswers.length === 0) {
    return NextResponse.json(
      { error: "At least one answer must be filled in" },
      { status: 400 }
    );
  }

  // Estimate credit cost
  const estimate = estimateReviewCost(enabledAnswers.length);

  const reviewNumber = application.review_count + 1;

  // Atomic: check credits + in-progress + create review
  const { data: rpcResult, error: rpcError } = await serviceClient.rpc(
    "submit_review",
    {
      p_application_id: id,
      p_user_id: user.id,
      p_review_number: reviewNumber,
      p_questions_set_id: application.questions_set_id,
      p_criteria_set_id: application.criteria_set_id,
      p_period: period,
      p_default_limit: defaultLimit,
      p_estimated_credits_low: estimate.low,
    }
  );

  if (rpcError) {
    if (rpcError.message?.includes("INSUFFICIENT_CREDITS")) {
      return NextResponse.json(
        { error: "Insufficient credits", estimate },
        { status: 402 }
      );
    }
    if (rpcError.message?.includes("REVIEW_IN_PROGRESS")) {
      return NextResponse.json(
        { error: "You already have a review in progress" },
        { status: 409 }
      );
    }
    console.error("submit_review RPC error:", rpcError);
    return NextResponse.json(
      { error: "Failed to submit review" },
      { status: 500 }
    );
  }

  const reviewId = rpcResult?.[0]?.review_id ?? rpcResult?.review_id;
  if (!reviewId) {
    console.error("submit_review RPC returned no review_id:", rpcResult);
    return NextResponse.json(
      { error: "Failed to create review" },
      { status: 500 }
    );
  }

  // Fire Inngest event
  await inngest.send({
    name: "application/review-requested",
    data: {
      applicationId: id,
      reviewId,
      reviewNumber,
      userId: user.id,
    },
  });

  return NextResponse.json(
    { reviewId, reviewNumber, estimate },
    { status: 201 }
  );
}
```

**Step 2: Run existing tests**

Run: `cd app && npx vitest run src/app/api/__tests__/applications.test.ts`
Expected: Update any broken tests (references to `reviews_used`, `USAGE_LIMIT_EXCEEDED`, etc.)

**Step 3: Commit**

```bash
git add src/app/api/applications/[id]/submit-for-review/route.ts
git commit -m "feat: update submit-for-review for credit-based gating"
```

---

## Task 7: Update Inngest Pipeline — Credit Deduction

**Files:**
- Modify: `src/lib/inngest/application-review.ts`

**Step 1: Update the save-results step**

In `src/lib/inngest/application-review.ts`, in the `save-results` step (starting at line 800), after computing `totalCostUsd` and saving results to the `application_reviews` table, add credit deduction:

After line 872 (after the `.eq("id", reviewId)` update), add:

```typescript
// Deduct credits based on actual cost
const { calculateCreditsFromCost } = await import("@/lib/usage/calculate-credits");
const creditsToCharge = calculateCreditsFromCost(totalCostUsd);

const { periodKey: period } = (await import("@/lib/usage/period")).getUsagePeriod(
  "pro", // tier doesn't matter for period calc when we have the period from the event
  null
);

// Use the deduct_credits RPC for atomic deduction with period-first ordering
if (creditsToCharge > 0) {
  // We need the user's current billing period. Fetch it.
  const { data: userProfile } = await supabase
    .from("profiles")
    .select("subscription_tier, current_period_end")
    .eq("id", userId)
    .single();

  const { periodKey } = (await import("@/lib/usage/period")).getUsagePeriod(
    userProfile?.subscription_tier ?? "pro",
    userProfile?.current_period_end
  );

  await supabase.rpc("deduct_credits", {
    p_user_id: userId,
    p_review_id: reviewId,
    p_credits: creditsToCharge,
    p_period: periodKey,
  });
}
```

**Step 2: Update the onFailure handler**

The `rollback_usage` RPC has been updated (Task 2) to handle credits. Since credits are now deducted post-completion (not pre-reserved), a failed pipeline typically won't have any credits charged. The rollback RPC handles the edge case where the save-results step itself fails mid-way.

No code change needed in the onFailure handler — it already calls `rollback_usage`.

**Step 3: Run existing pipeline tests**

Run: `cd app && npx vitest run src/lib/inngest/`
Expected: PASS (or update mocks for renamed columns)

**Step 4: Commit**

```bash
git add src/lib/inngest/application-review.ts
git commit -m "feat: add credit deduction to Inngest pipeline save-results step"
```

---

## Task 8: Update Stripe Webhook Handlers

**Files:**
- Modify: `src/lib/stripe/webhooks.ts`
- Modify: `src/app/api/stripe/__tests__/stripe-routes.test.ts`

**Step 1: Update webhooks.ts**

Key changes:

1. `syncUsageOnUpgrade()` — use `PLANS[tier].creditsPerMonth` instead of `PLANS.pro.reviewsPerMonth`, accept tier param
2. `syncUsageOnDowngrade()` — set `credits_limit = 0`
3. `handleCheckoutCompleted()` — determine tier from Stripe Price ID (map to basic or pro)
4. Column references: `reviews_limit` → `credits_limit`, `reviews_used` → `credits_used`

```typescript
import Stripe from "stripe";
import { createServiceClient } from "@/lib/supabase/server";
import { PLANS, type PlanTier } from "@/lib/stripe/plans";
import { getUsagePeriod } from "@/lib/usage/period";

function mapStripeStatus(status: string): "active" | "past_due" | "cancelled" {
  switch (status) {
    case "active":
    case "trialing":
      return "active";
    case "past_due":
    case "incomplete":
    case "incomplete_expired":
    case "unpaid":
      return "past_due";
    case "canceled":
    case "paused":
      return "cancelled";
    default:
      console.warn(`[stripe] Unknown subscription status: ${status}, defaulting to past_due`);
      return "past_due";
  }
}

function getPeriodEnd(subscription: Stripe.Subscription): string | null {
  const item = subscription.items?.data?.[0];
  if (!item) return null;
  return new Date(item.current_period_end * 1000).toISOString();
}

function tierFromPriceId(priceId: string): PlanTier {
  if (priceId === PLANS.basic.stripePriceId) return "basic";
  if (priceId === PLANS.pro.stripePriceId) return "pro";
  console.warn(`[stripe] Unknown price ID: ${priceId}, defaulting to basic`);
  return "basic";
}

async function syncUsageOnUpgrade(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
  tier: PlanTier,
  currentPeriodEnd: string | null
) {
  const { periodKey: period } = getUsagePeriod(tier, currentPeriodEnd);
  const creditsLimit = PLANS[tier]?.creditsPerMonth ?? 0;
  await supabase.from("usage").upsert(
    {
      user_id: userId,
      period,
      credits_limit: creditsLimit,
      credits_used: 0,
      bonus_reviews: 0,
    },
    { onConflict: "user_id,period" }
  );
}

async function syncUsageOnDowngrade(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string
) {
  const period = new Date().toISOString().slice(0, 7);
  await supabase
    .from("usage")
    .update({ credits_limit: 0 })
    .eq("user_id", userId)
    .eq("period", period);
}

export async function handleCheckoutCompleted(
  session: Stripe.Checkout.Session
) {
  const subscriptionId = session.subscription as string;
  const customerId = session.customer as string;

  if (!subscriptionId || !customerId) {
    console.error("Missing subscription or customer ID in checkout session");
    return;
  }

  const { stripe } = await import("@/lib/stripe/client");
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);

  const priceId = subscription.items?.data?.[0]?.price?.id;
  const tier = priceId ? tierFromPriceId(priceId) : "basic";

  const supabase = createServiceClient();
  const { data: profile, error } = await supabase
    .from("profiles")
    .update({
      subscription_tier: tier,
      subscription_status: "active",
      stripe_customer_id: customerId,
      stripe_subscription_id: subscriptionId,
      current_period_end: getPeriodEnd(subscription),
    })
    .eq("stripe_customer_id", customerId)
    .select("id")
    .single();

  if (error || !profile) {
    console.error("Failed to update profile by customer_id:", error);
    return;
  }

  await syncUsageOnUpgrade(supabase, profile.id, tier, getPeriodEnd(subscription));
}

export async function handleSubscriptionUpdated(
  subscription: Stripe.Subscription
) {
  const customerId = subscription.customer as string;

  const supabase = createServiceClient();
  await supabase
    .from("profiles")
    .update({
      subscription_status: mapStripeStatus(subscription.status),
      current_period_end: getPeriodEnd(subscription),
    })
    .eq("stripe_customer_id", customerId);
}

export async function handleSubscriptionDeleted(
  subscription: Stripe.Subscription
) {
  const customerId = subscription.customer as string;

  const supabase = createServiceClient();
  const { data: profile, error } = await supabase
    .from("profiles")
    .update({
      subscription_tier: "free",
      subscription_status: "cancelled",
      stripe_subscription_id: null,
      current_period_end: null,
    })
    .eq("stripe_customer_id", customerId)
    .select("id")
    .single();

  if (error) {
    console.error("Failed to downgrade profile:", error);
    return;
  }

  if (profile) {
    await syncUsageOnDowngrade(supabase, profile.id);
  }
}

export async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  const customerId = invoice.customer as string;

  const supabase = createServiceClient();
  await supabase
    .from("profiles")
    .update({
      subscription_status: "past_due",
    })
    .eq("stripe_customer_id", customerId);
}
```

**Step 2: Update Stripe route tests**

Update `src/app/api/stripe/__tests__/stripe-routes.test.ts`:
- All references to `reviews_limit` → `credits_limit`
- All references to `reviews_used` → `credits_used`
- `subscription_tier: "pro"` may now be `"basic"` or `"pro"` depending on price ID
- Test `tierFromPriceId` logic via checkout completion tests

**Step 3: Run tests**

Run: `cd app && npx vitest run src/app/api/stripe/__tests__/stripe-routes.test.ts`
Expected: PASS

**Step 4: Commit**

```bash
git add src/lib/stripe/webhooks.ts src/app/api/stripe/__tests__/stripe-routes.test.ts
git commit -m "feat: update Stripe webhooks for credit-based billing with basic/pro tiers"
```

---

## Task 9: Credit Top-Up API Route

**Files:**
- Create: `src/app/api/stripe/topup/route.ts`
- Create: `src/app/api/stripe/__tests__/topup.test.ts`

**Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "../topup/route";

// Mock Supabase
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

// Mock Stripe
vi.mock("@/lib/stripe/client", () => ({
  stripe: {
    checkout: {
      sessions: {
        create: vi.fn().mockResolvedValue({ url: "https://checkout.stripe.com/test" }),
      },
    },
  },
}));

describe("POST /api/stripe/topup", () => {
  it("returns 401 if not authenticated", async () => {
    const { createClient } = await import("@/lib/supabase/server");
    (createClient as any).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    });

    const req = new Request("http://localhost/api/stripe/topup", {
      method: "POST",
      body: JSON.stringify({ pack: "standard", quantity: 1 }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 403 if free tier tries to buy", async () => {
    const { createClient } = await import("@/lib/supabase/server");
    (createClient as any).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } } }) },
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { subscription_tier: "free", stripe_customer_id: null },
          error: null,
        }),
      }),
    });

    const req = new Request("http://localhost/api/stripe/topup", {
      method: "POST",
      body: JSON.stringify({ pack: "standard", quantity: 1 }),
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it("returns 403 if basic tier tries to buy pro pack", async () => {
    const { createClient } = await import("@/lib/supabase/server");
    (createClient as any).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } } }) },
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { subscription_tier: "basic", stripe_customer_id: "cus_123" },
          error: null,
        }),
      }),
    });

    const req = new Request("http://localhost/api/stripe/topup", {
      method: "POST",
      body: JSON.stringify({ pack: "pro", quantity: 1 }),
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd app && npx vitest run src/app/api/stripe/__tests__/topup.test.ts`
Expected: FAIL

**Step 3: Write the implementation**

```typescript
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { stripe } from "@/lib/stripe/client";
import { TOPUP_PACKS, type TopupPack } from "@/lib/stripe/plans";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const pack = body.pack as TopupPack;
  const quantity = Math.max(1, Math.min(10, Number(body.quantity) || 1));

  if (!TOPUP_PACKS[pack]) {
    return NextResponse.json({ error: "Invalid pack" }, { status: 400 });
  }

  // Get user profile
  const { data: profile } = await supabase
    .from("profiles")
    .select("subscription_tier, stripe_customer_id")
    .eq("id", user.id)
    .single();

  const tier = profile?.subscription_tier ?? "free";

  // Must have active subscription
  if (tier === "free") {
    return NextResponse.json(
      { error: "Active subscription required" },
      { status: 403 }
    );
  }

  // Check pack availability for tier
  const packConfig = TOPUP_PACKS[pack];
  if (!packConfig.availableTo.includes(tier as any)) {
    return NextResponse.json(
      { error: "This pack is not available on your plan" },
      { status: 403 }
    );
  }

  // Create Stripe Checkout session for one-time payment
  const session = await stripe.checkout.sessions.create({
    customer: profile?.stripe_customer_id || undefined,
    mode: "payment",
    line_items: [
      {
        price: packConfig.stripePriceId,
        quantity,
      },
    ],
    metadata: {
      user_id: user.id,
      pack_type: pack,
      credits: String(packConfig.credits * quantity),
    },
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/billing?topup=success`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/billing?topup=cancelled`,
  });

  return NextResponse.json({ url: session.url });
}
```

**Step 4: Run tests**

Run: `cd app && npx vitest run src/app/api/stripe/__tests__/topup.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/app/api/stripe/topup/route.ts src/app/api/stripe/__tests__/topup.test.ts
git commit -m "feat: add credit top-up Stripe checkout route"
```

---

## Task 10: Handle Top-Up Webhook

**Files:**
- Modify: `src/app/api/stripe/webhooks/route.ts`
- Modify: `src/lib/stripe/webhooks.ts`

**Step 1: Update webhook route**

In `src/app/api/stripe/webhooks/route.ts`, add handling for `checkout.session.completed` events that are `mode: "payment"` (top-ups) vs `mode: "subscription"` (new subscriptions).

In the existing `checkout.session.completed` handler, add a check:

```typescript
case "checkout.session.completed": {
  const session = event.data.object as Stripe.Checkout.Session;
  if (session.mode === "payment") {
    // Top-up purchase
    await handleTopupCompleted(session);
  } else {
    // Subscription checkout
    await handleCheckoutCompleted(session);
  }
  break;
}
```

**Step 2: Add handleTopupCompleted to webhooks.ts**

```typescript
export async function handleTopupCompleted(session: Stripe.Checkout.Session) {
  const userId = session.metadata?.user_id;
  const packType = session.metadata?.pack_type;
  const credits = Number(session.metadata?.credits);

  if (!userId || !packType || !credits || credits <= 0) {
    console.error("[stripe] Invalid top-up metadata:", session.metadata);
    return;
  }

  const supabase = createServiceClient();

  // Increment purchased_credits
  const { error: profileError } = await supabase.rpc("increment_purchased_credits", {
    p_user_id: userId,
    p_credits: credits,
  });

  if (profileError) {
    console.error("[stripe] Failed to increment purchased credits:", profileError);
    return;
  }

  // Record purchase for audit trail
  await supabase.from("credit_purchases").insert({
    user_id: userId,
    credits,
    amount_pence: session.amount_total ?? 0,
    pack_type: packType,
    stripe_payment_intent_id: session.payment_intent as string,
  });
}
```

**Step 3: Add `increment_purchased_credits` RPC to the migration (Task 2)**

Add to the migration SQL:

```sql
CREATE OR REPLACE FUNCTION increment_purchased_credits(
  p_user_id UUID,
  p_credits INT
)
RETURNS void AS $$
BEGIN
  UPDATE public.profiles
  SET purchased_credits = purchased_credits + p_credits
  WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

Note: If the migration has already been pushed, create a new migration file for this RPC.

**Step 4: Run webhook tests**

Run: `cd app && npx vitest run src/app/api/stripe/__tests__/stripe-routes.test.ts`
Expected: PASS (add new test cases for top-up webhook)

**Step 5: Commit**

```bash
git add src/app/api/stripe/webhooks/route.ts src/lib/stripe/webhooks.ts
git commit -m "feat: handle top-up webhook — increment purchased credits"
```

---

## Task 11: Update Billing Page UI

**Files:**
- Modify: `src/app/(dashboard)/billing/page.tsx`
- Modify: `src/app/(dashboard)/billing/BillingClient.tsx`

**Step 1: Update billing page.tsx**

Replace the usage section to show credits instead of reviews, with monthly/purchased breakdown:

Key changes:
- `usage.used` of `usage.limit` reviews → credits display with breakdown
- Add purchased credits display
- Show "Buy credits" section
- Update plan display to show Basic/Pro with correct pricing

```typescript
// In the usage section, replace the reviews display:
<div className="flex items-center justify-between text-sm">
  <span>{usage.remaining} credits remaining</span>
  <span className="text-zinc-500 dark:text-zinc-400">Resets {resetDate}</span>
</div>
// Add breakdown tooltip
<p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
  {Math.max(0, usage.limit - usage.used)} monthly + {usage.purchased} purchased credits
</p>
// Update progress bar to show credits_used / credits_limit
```

**Step 2: Update BillingClient.tsx**

Replace with tier-aware component supporting free/basic/pro, showing:
- Current plan badge
- "Buy Credits" button that opens top-up flow
- Plan upgrade/downgrade option

The tier type changes from `"free" | "pro"` to `"free" | "basic" | "pro"`.

**Step 3: Verify in browser**

Run: `cd app && npm run dev`
Navigate to `/billing`, verify credits display correctly.

**Step 4: Commit**

```bash
git add src/app/(dashboard)/billing/page.tsx src/app/(dashboard)/billing/BillingClient.tsx
git commit -m "feat: update billing page for credit-based display"
```

---

## Task 12: Update UpsellPrompt Component

**Files:**
- Modify: `src/components/UpsellPrompt.tsx`

**Step 1: Update the component**

Change the interface to accept credit-based props and show contextual messages:

```typescript
"use client";

interface UpsellPromptProps {
  tier: "free" | "basic" | "pro";
  remaining: number;
  resetDate: string;
  estimateLow?: number;
  estimateHigh?: number;
}

export function UpsellPrompt({ tier, remaining, resetDate, estimateLow, estimateHigh }: UpsellPromptProps) {
  if (tier === "free") {
    return (
      <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-6 dark:border-zinc-700 dark:bg-zinc-800/50">
        <h3 className="text-lg font-semibold text-zinc-800 dark:text-zinc-200">
          Subscription Required
        </h3>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Subscribe to a Basic or Pro plan to start reviewing applications.
        </p>
      </div>
    );
  }

  // Subscribed user with insufficient credits
  const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const d = new Date(resetDate);
  const resetStr = `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 dark:border-amber-800 dark:bg-amber-900/20">
      <h3 className="text-lg font-semibold text-amber-800 dark:text-amber-200">
        Insufficient credits
      </h3>
      <p className="mt-2 text-sm text-amber-700 dark:text-amber-300">
        {estimateLow && estimateHigh
          ? `This review needs approximately ${estimateLow}–${estimateHigh} credits. You have ${remaining} credits remaining.`
          : `You have ${remaining} credits remaining.`}
        {" "}Your monthly credits reset on {resetStr}.
      </p>
      <a
        href="/billing"
        className="mt-3 inline-block rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700"
      >
        Buy credits
      </a>
    </div>
  );
}
```

**Step 2: Update all consumers of UpsellPrompt**

Search for UpsellPrompt imports and update the props passed. Key consumers:
- Application form page (`src/app/(dashboard)/applications/[id]/page.tsx`)
- Any page that shows the upsell when reviews are blocked

**Step 3: Commit**

```bash
git add src/components/UpsellPrompt.tsx
git commit -m "feat: update UpsellPrompt for credit-based messaging"
```

---

## Task 13: Update DashboardNav

**Files:**
- Modify: `src/components/DashboardNav.tsx`

**Step 1: Update tier display**

The nav already handles `tier !== "free"` as `isPro` (line 44). Update to show the actual tier name (Basic/Pro) in the dropdown badge. The existing code at line 108 already shows `{tier} Plan` — this will automatically work for "basic" and "pro".

Minor change: update the `isPro` variable name to `hasSubscription` for clarity:

```typescript
const hasSubscription = tier !== "free";
```

And update the badge display to capitalize properly.

**Step 2: Commit**

```bash
git add src/components/DashboardNav.tsx
git commit -m "feat: update DashboardNav for basic/pro tier display"
```

---

## Task 14: Update Stripe Checkout Route

**Files:**
- Modify: `src/app/api/stripe/checkout/route.ts`

**Step 1: Re-enable and update checkout**

Replace the 503 response with actual checkout session creation supporting both Basic and Pro tiers:

```typescript
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { stripe } from "@/lib/stripe/client";
import { PLANS } from "@/lib/stripe/plans";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const tier = body.tier as "basic" | "pro";

  if (tier !== "basic" && tier !== "pro") {
    return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
  }

  const plan = PLANS[tier];

  // Get or create Stripe customer
  const { data: profile } = await supabase
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", user.id)
    .single();

  let customerId = profile?.stripe_customer_id;

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      metadata: { supabase_user_id: user.id },
    });
    customerId = customer.id;

    await supabase
      .from("profiles")
      .update({ stripe_customer_id: customerId })
      .eq("id", user.id);
  }

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    line_items: [{ price: plan.stripePriceId, quantity: 1 }],
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/billing?checkout=success`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/billing?checkout=cancelled`,
  });

  return NextResponse.json({ url: session.url });
}
```

**Step 2: Commit**

```bash
git add src/app/api/stripe/checkout/route.ts
git commit -m "feat: re-enable Stripe checkout with basic/pro tier support"
```

---

## Task 15: Update Require-Pro Guard to Accept Basic

**Files:**
- Modify: `src/lib/usage/require-pro-with-rate-limit.ts`
- Modify: `src/lib/usage/__tests__/require-pro-with-rate-limit.test.ts`

**Step 1: Update the guard**

The `requireProWithRateLimit` function currently checks `tier !== "pro"`. Update to check `tier === "free"` instead, so both basic and pro users can access AI parsing endpoints.

**Step 2: Update tests**

Add test case for basic tier being allowed.

**Step 3: Run tests**

Run: `cd app && npx vitest run src/lib/usage/__tests__/require-pro-with-rate-limit.test.ts`
Expected: PASS

**Step 4: Commit**

```bash
git add src/lib/usage/require-pro-with-rate-limit.ts src/lib/usage/__tests__/require-pro-with-rate-limit.test.ts
git commit -m "feat: allow basic tier in requireProWithRateLimit guard"
```

---

## Task 16: Add Estimate Endpoint for Client-Side Display

**Files:**
- Create: `src/app/api/applications/[id]/estimate/route.ts`

**Step 1: Write the endpoint**

This allows the client to fetch the credit estimate before showing the confirmation dialog:

```typescript
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { estimateReviewCost } from "@/lib/usage/estimate-review-cost";
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

  // Count enabled non-empty answers
  const { data: answers } = await supabase
    .from("application_answers")
    .select("question_id, answer_text, is_disabled")
    .eq("application_id", id);

  const enabledCount = (answers ?? []).filter(
    (a) => !a.is_disabled && a.answer_text.trim().length > 0
  ).length;

  const estimate = estimateReviewCost(enabledCount);
  const usage = await checkUsage(supabase, user.id);

  return NextResponse.json({
    estimate,
    credits: {
      remaining: usage.remaining,
      period: Math.max(0, usage.limit - usage.used),
      purchased: usage.purchased,
    },
    canAfford: usage.remaining >= estimate.low,
  });
}
```

**Step 2: Commit**

```bash
git add src/app/api/applications/[id]/estimate/route.ts
git commit -m "feat: add estimate endpoint for pre-submission credit display"
```

---

## Task 17: Update Application Form Submit Confirmation

**Files:**
- Modify: `src/app/(dashboard)/applications/[id]/ApplicationFormClient.tsx`

**Step 1: Update submit flow**

Before submitting, fetch the estimate from `/api/applications/[id]/estimate` and show a confirmation dialog:

- If `canAfford: true` → show "This review will cost approximately X–Y credits. You have Z credits remaining. Submit?"
- If `canAfford: false` → show UpsellPrompt with estimate and link to buy credits

This modifies the existing submit button handler. The estimate fetch happens on button click, before the actual submit POST.

**Step 2: Verify in browser**

Run: `cd app && npm run dev`
Navigate to an application form, click submit, verify the estimate dialog appears.

**Step 3: Commit**

```bash
git add src/app/(dashboard)/applications/[id]/ApplicationFormClient.tsx
git commit -m "feat: show credit estimate confirmation before review submission"
```

---

## Task 18: Update Usage API Route

**Files:**
- Modify: `src/app/api/usage/route.ts` (if it exists and references reviews)

**Step 1: Check and update**

Search for any `/api/usage` route and update column references from `reviews_used`/`reviews_limit` to `credits_used`/`credits_limit`.

**Step 2: Commit (if changes needed)**

```bash
git add src/app/api/usage/route.ts
git commit -m "fix: update usage API route for credit columns"
```

---

## Task 19: Run Full Test Suite

**Step 1: Run all tests**

Run: `cd app && npm test`

Fix any remaining failures caused by:
- Column renames (`reviews_used` → `credits_used`, `reviews_limit` → `credits_limit`)
- Tier type changes (`"free" | "pro"` → `"free" | "basic" | "pro"`)
- `UsageResult` interface change (added `purchased` field)
- `PLANS` shape change (removed `reviewsPerMonth`, added `creditsPerMonth`)

**Step 2: Run build**

Run: `cd app && npm run build`
Expected: Build succeeds with no type errors.

**Step 3: Commit any remaining fixes**

```bash
git add -A
git commit -m "fix: update remaining references for credit-based billing"
```

---

## Task 20: Update Environment Variables Documentation

**Step 1: Document new env vars needed**

Add to `.env.local.example` (or create if doesn't exist):

```
# Stripe — Subscriptions
STRIPE_BASIC_PRICE_ID=price_xxx
STRIPE_PRO_PRICE_ID=price_xxx

# Stripe — Top-up packs
STRIPE_STANDARD_TOPUP_PRICE_ID=price_xxx
STRIPE_PRO_TOPUP_PRICE_ID=price_xxx
```

**Step 2: Commit**

```bash
git add .env.local.example
git commit -m "docs: add new Stripe price ID env vars for credit-based billing"
```
