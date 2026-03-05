# FunderReady Code Review Findings & Remediation Plan

**Last Updated:** 2026-03-04
**Reviews:** Initial full audit (Sprints 1-3 completed) + Second full audit (153 files)
**Previous Progress:** 30 critical+high items remediated across Sprints 1-3. 686 tests across 29 files.
**Current Findings:** 4 critical | 14 high | 25 medium | 22 low

---

## Completed Work (Sprints 1-3)

All previously identified critical and high-priority items have been remediated:
- Atomic usage check via `submit_review` RPC (race condition + non-atomic multi-table write)
- Stripe: status mapping, webhook error handling, customer creation race, subscription status checks, usage rollback on failure
- AI pipeline: refactored parse-criteria/parse-questions to use `callClaude()` (tool use, retries, Zod validation, truncation handling), tier checks, input size limits
- Security: open redirect in auth callback, JSON parse error handling
- Code quality: dead schemas removed, legacy prompt references fixed, non-null assertions, component decomposition (ApplicationFormClient 890→370 lines), shared utilities extracted
- Testing: Stripe payment flow, feedback API, 15+ API routes, AI helpers (686 tests across 29 files)
- **Deferred:** Model switch to Haiku for parse-criteria/parse-questions (Sonnet needed for accuracy on long inputs)

---

## Priority 1 — Critical (Fix Before Launch)

### 1.1 "textarea" field_type Violates DB CHECK Constraint
**File:** `src/app/api/applications/[id]/questions-set/route.ts:125,131`
**Agent:** Database & API
**Issue:** Default `field_type: "textarea"` violates the `application_answers.field_type` CHECK constraint that only allows `('text_short', 'text_long', 'dropdown', 'radio', 'checkbox')`. Every questions-set swap that inserts new answer rows will 500.
**Fix:** Change `"textarea"` to `"text_long"` in both occurrences.

### 1.2 Checkout Profile Lookup Race — First-Time Subscribers
**File:** `src/lib/stripe/webhooks.ts:86`
**Agent:** Payment & Billing
**Issue:** `handleCheckoutCompleted` looks up profile by `stripe_customer_id`, but for first-time subscribers this ID is set in the checkout route. If that write fails or the webhook arrives first, the lookup matches zero rows and silently fails — user pays but never gets upgraded.
**Fix:** Use `session.metadata.userId` (already set at checkout route line 64) as the primary lookup key, and set `stripe_customer_id` at the same time.

### 1.3 AI Rate Limit Fails Open on DB Errors
**File:** `src/lib/usage/check-ai-rate-limit.ts:27`
**Agents:** Payment & Billing, Security & Auth
**Issue:** When `increment_ai_daily_usage` RPC returns any error other than `AI_RATE_LIMIT_EXCEEDED`, the function returns `{ allowed: true }`. A database outage completely disables the 30/day rate limit, enabling unlimited AI calls with uncontrolled cost burn.
**Fix:** Fail closed — return `{ allowed: false }` on unexpected errors.

### 1.4 Non-Atomic Questions-Set Swap
**File:** `src/app/api/applications/[id]/questions-set/route.ts:113-144`
**Agent:** Database & API
**Issue:** Three separate mutating operations (delete answers, insert answers, update application's `questions_set_id`) without a transaction. Intermediate failure leaves data inconsistent — answers deleted but application still references old set, etc.
**Fix:** Wrap in an RPC function to make the swap atomic, similar to `submit_review`.

---

## Priority 2 — High (Fix Soon)

### 2.1 Open Redirect on Login Page
**File:** `src/app/(auth)/login/page.tsx:43,50`
**Agent:** Security & Auth
**Issue:** `redirect` query parameter read from URL and used directly in `router.push(redirect)` after password login and in OAuth `redirectTo`. Attacker can craft `/login?redirect=https://evil.com`. (Note: auth callback redirect was previously fixed, but the login page itself was not.)
**Fix:** Validate that `redirect` starts with `/` and not `//` before use.

### 2.2 Webhook Not Idempotent
**File:** `src/app/api/stripe/webhooks/route.ts:10-68`
**Agent:** Payment & Billing
**Issue:** Stripe can deliver events more than once. Handlers perform non-idempotent operations. Partial success + retry could corrupt state.
**Fix:** Store processed `event.id` values in a `processed_webhook_events` table and skip duplicates.

### 2.3 requireProWithRateLimit Doesn't Check subscription_status
**File:** `src/lib/usage/require-pro-with-rate-limit.ts:28-29`
**Agent:** Payment & Billing
**Issue:** Only checks `subscription_tier === "pro"`, not `subscription_status === "active"`. Users with `past_due` or `cancelled` status retain access to AI features (parse-criteria, parse-questions, detect-fund). The submit-for-review route correctly checks both.
**Fix:** Add `subscription_status` to the SELECT query and reject if not `"active"`.

### 2.4 handleSubscriptionUpdated Doesn't Sync Tier
**File:** `src/lib/stripe/webhooks.ts:98-111`
**Agent:** Payment & Billing
**Issue:** Updates `subscription_status` but not `subscription_tier`. Between `subscription.updated` (cancelled) and `subscription.deleted`, user retains Pro access with cancelled status. Combined with 2.3, cancelled users keep full access.
**Fix:** Update `subscription_tier` to `"free"` when status is cancelled, or ensure all guards also check status.

### 2.5 Stale TypeScript Types
**File:** `src/types/database.ts`
**Agent:** Database & API
**Issue:** Generated types missing `application_answers.is_disabled`, `application_reviews.questions_set_id/criteria_set_id`, cost columns, `ai_daily_usage` table. Undermines compile-time safety.
**Fix:** Regenerate via `npx supabase gen types typescript --project-id pxvtcaqpithbjifpxnic > src/types/database.ts`.

### 2.6 PATCH/DELETE Returns Success on Zero Rows
**File:** `src/app/api/applications/[id]/route.ts:30-33,57-60`
**Agent:** Database & API
**Issue:** When RLS blocks an update (0 rows affected), API returns `{ success: true }`.
**Fix:** Add `.select("id").single()` and return 404 if no row was affected.

### 2.7 Admin Metrics Fetches 50K Rows Into Memory
**File:** `src/app/api/admin/metrics/route.ts:40,52`
**Agent:** Database & API
**Issue:** Two parallel fetches of up to 50,000 `ai_usage_logs` rows into application memory for aggregation. Will cause memory/performance issues as usage grows. Previous fix added `.limit(50000)` but the fundamental issue remains.
**Fix:** Move aggregation to a Postgres view or RPC: `SELECT pipeline_step, model, SUM(input_tokens), ... GROUP BY ...`.

### 2.8 N+1 Update Pattern in save-results
**File:** `src/lib/inngest/application-review.ts:810-817`
**Agent:** Database & API
**Issue:** Issues N individual UPDATE queries (one per enabled answer) to stamp `last_reviewed_text`. Creates N round-trips for applications with many questions.
**Fix:** Consolidate into a single RPC or batched update.

### 2.9 detect-fund.ts No Error Handling
**File:** `src/lib/ai/detect-fund.ts:29`
**Agent:** AI Pipeline
**Issue:** `client.messages.create()` call has no try/catch, no retry, no transient vs permanent error classification. Unlike `callClaude()` which handles all of this.
**Fix:** Refactor to use `callClaude()`, or add error handling matching that pattern.

### 2.10 Untyped onFailure Event Data
**File:** `src/lib/inngest/application-review.ts:313`
**Agent:** Code Quality
**Issue:** `event.data.event.data` is completely untyped. If event schema changes, destructured values silently become `undefined` and the rollback won't execute — review stays stuck, usage not rolled back.
**Fix:** Add runtime type guards before destructuring.

### 2.11 Legacy FK in review_purchases
**File:** `src/types/database.ts:559-578`
**Agent:** Database & API
**Issue:** `review_purchases.review_id` references deprecated `reviews` table instead of `application_reviews`.
**Fix:** Migrate FK when `review_purchases` is needed for application flow.

### 2.12 Inngest Pipeline Has No Execution Test
**File:** `src/lib/inngest/application-review.ts:307-832`
**Agent:** Test Coverage
**Issue:** The Inngest function handler — the most critical business path — has no execution-level test. Only helpers and prompt builders are tested.
**Fix:** Add test mocking `step.run` and Supabase data, verifying pipeline steps execute in order with correct schemas.

### 2.13 RLS Integration Tests Cover Legacy Tables Only
**File:** `src/lib/auth/__tests__/rls.integration.test.ts`
**Agent:** Test Coverage
**Issue:** Tests cover `profiles`, `reviews`, `review_results`, `usage` but not current `applications`, `application_answers`, `application_reviews`, or `review_feedback`.
**Fix:** Extend to test cross-user isolation on current tables.

### 2.14 handleCheckoutCompleted Silently Returns on Failure
**File:** `src/lib/stripe/webhooks.ts:62-96`
**Agent:** Payment & Billing
**Issue:** Handler returns void (no throw) when profile lookup fails or update fails. Webhook route returns 200, so Stripe won't retry. For first-time checkout where customer can't be found, user pays but never gets upgraded and no retry occurs.
**Fix:** Throw errors in handlers so webhook route returns 500 and Stripe retries.

---

## Priority 3 — Medium (Plan for Next Sprint)

### 3.1 Raw Supabase Error Messages Exposed to Client
**File:** `src/app/api/applications/[id]/route.ts:35-36`
**Fix:** Return generic error message instead of `error.message`. Log details server-side.

### 3.2 Service Client Bypasses RLS for Answer Upsert
**File:** `src/app/api/applications/[id]/answers/route.ts:52-65`
**Fix:** Document design intent or use RLS client if possible.

### 3.3 User ID Interpolated Into PostgREST Filter String
**Files:** `src/app/api/organisations/route.ts:45`, `src/app/api/funds/route.ts:46`
**Fix:** Add UUID format validation as defense-in-depth.

### 3.4 Cross-Reference Prompt Token Duplication
**File:** `src/lib/pipeline/application-prompts.ts:370-507`
**Fix:** Remove redundant raw texts if cross-reference accuracy is acceptable with excerpts alone.

### 3.5 No Memoisation of Individual Answer Analyses
**File:** `src/lib/inngest/application-review.ts:493-577`
**Fix:** Chunk answer analyses into batches of 5 per Inngest step for memoisation.

### 3.6 Hardcoded Model Pricing Returns Zero for Unknown Models
**File:** `src/lib/ai/pricing.ts:14-27`
**Fix:** Log warning on unknown model.

### 3.7 Sequential Queries in Fund Detail Route
**File:** `src/app/api/funds/[id]/route.ts:69-108`
**Fix:** Wrap four queries in `Promise.all`.

### 3.8 syncUsageOnDowngrade Uses Wrong Period Key Format
**File:** `src/lib/stripe/webhooks.ts:50-60`
**Fix:** Use `getUsagePeriod()` to match billing-period-based key format.

### 3.9 Billing Progress Bar Ignores Bonus Reviews
**File:** `src/app/(dashboard)/billing/page.tsx:97-118`
**Fix:** Use `usage.limit + usage.bonus` as denominator, or show bonus separately.

### 3.10 Repeated Type Cast for Organisation Join Shape
**Files:** 4+ server `page.tsx` files
**Fix:** Create shared `normalizeFundWithOrg()` helper.

### 3.11 Unused userId Prop Leaked to Client
**File:** `src/app/(dashboard)/applications/new/NewApplicationForm.tsx:39`
**Fix:** Remove `userId` from props and parent.

### 3.12 Hardcoded Price Strings
**Files:** `src/components/UpsellPrompt.tsx`, `BillingClient.tsx`
**Fix:** Define as constant in Stripe plans module.

### 3.13 Non-Null Assertions on Env Vars
**Files:** `src/lib/stripe/plans.ts:13`, `src/lib/stripe/client.ts:3`
**Fix:** Add runtime validation or `import 'server-only'`.

### 3.14 parseReviewResults Uses Cascading Unsafe Casts
**File:** `src/app/(dashboard)/applications/[id]/review/types.ts:72-83`
**Fix:** Use Zod parsing at the JSON boundary.

### 3.15 Answer Row Insertion Failure Silently Swallowed
**File:** `src/app/api/applications/route.ts:96-103`
**Fix:** Make failure fatal or surface warning in response.

### 3.16 CSP Allows unsafe-inline and unsafe-eval
**File:** `next.config.ts:29`
**Fix:** Use nonce-based CSP in production; only apply `unsafe-eval` in development.

### 3.17 Duplicate Criterion Interface
**File:** `src/lib/pipeline/prompt-templates.ts:122-127`
**Fix:** Import `Criterion` from `@/lib/schemas/criteria` instead of redefining with different shape.

### 3.18 Four Duplicate Question Interfaces
**Files:** `FormField.tsx`, `ApplicationFormClient.tsx`, `useMarkdownImportExport.ts`, `useFormAutoSave.ts`
**Fix:** Define single shared `Question` type and import everywhere.

### 3.19 Missing "reviewing" Status Guard in Answers Route
**File:** `src/app/api/applications/[id]/answers/route.ts:30-35`
**Fix:** Also guard against `reviewing` status to prevent edits during active pipeline run.

### 3.20 tsQuery Special Characters Not Escaped
**Files:** `src/app/api/funds/route.ts:22-26`, `src/app/api/organisations/route.ts:34-38`
**Fix:** Strip or escape tsquery special characters (`!`, `&`, `|`, `(`, `)`) before appending `:*`.

### 3.21 Submit-for-Review reviewNumber Race Condition
**File:** `src/app/api/applications/[id]/submit-for-review/route.ts:82`
**Fix:** Compute `review_number` inside the RPC function atomically using `COALESCE(MAX(review_number), 0) + 1`.

### 3.22 Cross-Reference cache_control on Too-Small Prompt
**File:** `src/lib/pipeline/application-prompts.ts:392-405`
**Fix:** Remove `cache_control` — prompt is ~200 tokens, below Anthropic's 1024-token caching minimum.

### 3.23 Scoring Cache Block Should Be Split
**File:** `src/lib/pipeline/application-prompts.ts:558-563`
**Fix:** Split into static content + fund-specific criteria as separate cache blocks for better reuse.

### 3.24 Test chainMock Helper Duplicated Across 6+ Files
**Fix:** Extract shared `chainMock` into a test utility module.

### 3.25 updateAppReviewProgress Non-Atomic JSONB Merge
**File:** `src/lib/inngest/application-review.ts:66-84`
**Fix:** Use Postgres `jsonb_set` or `||` operator for atomic merge.

---

## Priority 4 — Low (Address When Touching These Files)

### 4.1 Broad Path Prefix Matching for Webhook Bypass
`proxy.ts:13-14` — Use exact path matching instead of `startsWith`.

### 4.2 URL Param UUID Validation
Various API routes — Add `z.string().uuid()` for path params.

### 4.3 User Email Exposed as Display Name Fallback
`layout.tsx:27` — Use `email.split("@")[0]` or generic fallback.

### 4.4 No Pagination on List Endpoints
`funds/my/route.ts`, `reviews/route.ts` — Add `.limit()`.

### 4.5 Admin Approve Endpoints Don't Validate Resource Exists
Return 404 for non-existent IDs instead of silent success.

### 4.6 field_type CHECK Constraint Mismatch in Types
`types/database.ts:34` — CHECK constraint doesn't include all types from Zod schema.

### 4.7 NEXT_PUBLIC_APP_URL Falls Back to Localhost
`stripe/checkout/route.ts:45` — Throw if unset in production.

### 4.8 UpsellPrompt Doesn't Handle past_due Status
Accept `subscription_status` prop and show payment warning.

### 4.9 Model Constants Not Centralized
`application-review.ts:39` — Export shared `PIPELINE_MODEL` / `EXTRACTION_MODEL`.

### 4.10 Hardcoded USD-to-GBP Exchange Rate
`pricing.ts:29` — Document as approximate; consider periodic update.

### 4.11 Date Formatting Inconsistency
Standardize on one approach (locale-sensitive or manual UTC) project-wide.

### 4.12 detect-fund Duplicated Singleton Client
`detect-fund.ts:19-22` — Reuse `getClient()` from `anthropic.ts`.

### 4.13 detect-fund Doesn't Use Tool Use
Acceptable for single-string extraction; consider for consistency.

### 4.14 DashboardNav Creates Supabase Client on Every Render
`DashboardNav.tsx:15` — Move to `useMemo` or module singleton.

### 4.15 is_disabled Not Selected in Review Page Query
`ApplicationReviewClient.tsx:179-185` — Guard checks `is_disabled` but review page doesn't select it. Add to select or remove guard.

### 4.16 Modal Components Lack Accessibility
Multiple modals missing `role="dialog"`, `aria-modal`, Escape key, focus trap.

### 4.17 handleCheckoutCompleted period.ts Month Boundary Bug
`period.ts:17-20` — Subtracting 1 month from March 31 produces March 3 (Feb 31 overflow). Clamp to last day of target month.

### 4.18 MAX_CONCURRENT = 5 May Be Conservative
`application-review.ts:498` — Consider increasing to 8-10.

### 4.19 Dynamic Import of calculateCost
`application-review.ts:762` — Use static import instead.

### 4.20 RLS Integration Test Silently Skips
`rls.integration.test.ts` — Add console warning when env vars missing.

### 4.21 No Component Rendering Tests
12+ key UI components lack tests. Prioritize FormField, FundDetection, OrganisationSelector.

### 4.22 Minor Test Quality Issues
- Reimplemented logic in `review-logic.test.ts` instead of importing
- Missing `QuestionsSetSchema` validation tests
- Approximate assertion in `detect-fund.test.ts` truncation test
- `chainMock` inconsistencies across test files (see 3.24)

---

## Recommended Remediation Order

### Sprint 4 — Critical Fixes
1. **1.1** — Fix `"textarea"` → `"text_long"` (1-minute fix)
2. **1.2** — Fix checkout profile lookup to use `metadata.userId`
3. **1.3** — Fail closed on AI rate limit errors
4. **1.4** — Wrap questions-set swap in atomic RPC

### Sprint 5 — High Priority
5. **2.1** — Fix login page open redirect
6. **2.3 + 2.4** — Subscription status checks across all guards
7. **2.14** — Throw on checkout handler failure (enables Stripe retry)
8. **2.2** — Add webhook idempotency table
9. **2.5** — Regenerate TypeScript types
10. **2.6** — Fix PATCH/DELETE row count check
11. **2.7** — Move admin metrics aggregation to Postgres
12. **2.8** — Batch save-results updates
13. **2.9** — Refactor detect-fund error handling
14. **2.10** — Add type guards to onFailure

### Sprint 6 — Testing & Remaining High
15. **2.12** — Add Inngest pipeline execution test
16. **2.13** — Update RLS integration tests for current tables
17. **2.11** — Migrate review_purchases FK (when needed)

### Sprint 7+ — Medium Priority
18. Items 3.1-3.25 as time permits

### Ongoing
19. Items 4.1-4.22 — address when touching relevant files
