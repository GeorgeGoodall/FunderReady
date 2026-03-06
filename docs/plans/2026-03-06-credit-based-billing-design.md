# Credit-Based Billing Design

## Problem

The current billing model gives Pro users 10 flat reviews/month at £49. This is problematic because:
- Large applications (25-30 questions) cost significantly more in AI tokens than small ones (3-5 questions)
- Re-reviews of applications where only one answer changed still consume a full review credit
- Small reviews "waste" a credit; large reviews may lose money

## Design

### Credit System Core

Users spend **credits** — an abstract unit that maps to actual AI token cost internally.

**Internal mapping:** `creditsUsed = ceil(totalCostUsd / COST_PER_CREDIT_USD)` where `COST_PER_CREDIT_USD` is a fixed constant (~$0.05). Credits represent the same amount of AI work regardless of tier. The markup difference is in what users *pay* for credits (subscription + top-up pricing), not what credits represent.

### Plans

| | Basic | Pro |
|---|---|---|
| Monthly price | £19 | £49 |
| Included credits | 30 | 100 |
| Top-up (Standard pack) | £5 for 10 credits | £5 for 10 credits |
| Top-up (Pro pack) | Not available | £10 for 30 credits |
| Per-credit rate (top-up) | £0.50 | £0.33 (Pro pack) |

**Free tier:** No reviews without a subscription. `subscription_tier = 'free'` means no active plan.

**Credit expiry:**
- Included (monthly) credits: reset at billing period end (use-it-or-lose-it)
- Purchased credits: never expire, persist across periods and plan changes

### Estimated Credit Cost Per Review

| Application Size | Questions | Estimated Credits |
|---|---|---|
| Small | 3-5 | ~3-5 |
| Medium | 10-15 | ~8-12 |
| Large | 25-30 | ~20-30 |

### Pre-Submission Estimate & Gating

When a user clicks "Submit for Review":

1. **Check active subscription** (Basic or Pro)
2. **Check no in-progress reviews** for this user across any application (query `application_reviews WHERE user_id = X AND status IN ('pending', 'analysing', 'cross_referencing', 'scoring')`)
3. **Calculate estimate range:**
   - Count enabled, non-empty answers = `N`
   - `estimate = N * AVG_ANSWER_CREDITS + OVERHEAD_CREDITS`
   - `low = floor(estimate * 0.8)`
   - `high = ceil(estimate * 1.3)` (buffer to avoid underestimation)
   - Constants (`AVG_ANSWER_CREDITS`, `OVERHEAD_CREDITS`) tuned from actual `ai_usage_logs` data
4. **Calculate available credits:** `available = (periodAllowance - periodCreditsUsed) + purchasedCredits`
5. **Gate:**
   - `available < low` → block: "This review is estimated to cost **X-Y credits**. You have **Z credits** remaining. Top up to continue."
   - `available >= low` → confirm: "This review will cost approximately **X-Y credits**. You have **Z credits** remaining. Submit?"

### Credit Deduction

Credits are deducted **after** the review completes (in the save-results Inngest step), not reserved upfront.

**Deduction order:**
1. Deduct from period allowance first (use-it-or-lose-it)
2. Overflow deducts from purchased credits

**Example:** 5 period credits remaining + 10 purchased. Review costs 8 credits -> deduct 5 from period, 3 from purchased.

**Cap:** `actualDeduction = min(creditsUsed, availableCredits)`. If actual cost exceeds available credits, the review completes for free (the overage is absorbed). The gating buffer makes this rare.

**Failure rollback:** Existing `rollback_usage` RPC updated to roll back credits instead of review count.

### Stripe Integration

**Subscriptions:**
- Two Stripe Price IDs: `STRIPE_BASIC_PRICE_ID`, `STRIPE_PRO_PRICE_ID`
- Downgrade Pro -> Basic takes effect at period end (standard Stripe behaviour)

**Top-up packs:**

| Pack | Price | Credits | Available to |
|---|---|---|---|
| Standard | £5 | 10 credits | Basic + Pro |
| Pro | £10 | 30 credits | Pro only |

- Users can buy multiple packs (quantity on Stripe Checkout or separate purchases)
- Webhook validates Pro pack purchases come from Pro-tier users
- Each successful payment increments `profiles.purchased_credits`

### Database Changes

**`profiles` table:**
- `subscription_tier`: values change from `free | pro` to `free | basic | pro`
- Add `purchased_credits` (integer, default 0) — persists across periods

**`usage` table:**
- Rename `reviews_used` -> `credits_used`
- Rename `reviews_limit` -> `credits_limit`

**`application_reviews` table:**
- Add `credits_charged` (integer) — audit trail for how many credits were deducted

**`review_purchases` table:**
- Repurpose as `credit_purchases` (amount paid, credits granted, timestamp)

### UI Changes

**Dashboard credits display:**
- Replace "X of 10 reviews used" with "24 credits remaining"
- Tooltip: "18 monthly credits + 6 purchased credits. Monthly credits reset on [date]."

**Submit for review flow:**
- Confirmation dialog showing estimated range and current balance
- Insufficient credits: same message with "Buy credits" CTA

**Billing page:**
- Plan selector: Basic (£19/mo) vs Pro (£49/mo)
- Credits balance with breakdown (monthly vs purchased)
- "Buy credits" section with available packs
- Purchase history

**UpsellPrompt component:**
- Context-aware: insufficient credits -> "Buy credits" CTA, no subscription -> "Subscribe" CTA
