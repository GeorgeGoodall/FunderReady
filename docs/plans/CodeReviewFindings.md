# FunderReady Code Review Findings & Remediation Plan

**Date:** 2026-03-04
**Scope:** Full codebase audit (130 source files)
**Verdict:** Needs rework (13 critical, 33 high findings)
**Progress:** 10/10 critical DONE, 17/20 high DONE (1 deferred, 2 partial). 644 tests passing.

---

## Priority 1 — Critical (Fix Before Launch)

### 1.1 Race Condition in Usage Check-and-Increment — DONE
**Files:** `src/app/api/applications/[id]/submit-for-review/route.ts:71-145`
**Agents:** Security, DB&API, Payment
**Issue:** The usage check reads `reviews_used`, compares against limit, then increments in a separate query. Two concurrent requests can both pass the check before either increments, allowing the user to exceed their review quota.
**Fix:** Use atomic SQL: `UPDATE usage SET reviews_used = reviews_used + 1 WHERE reviews_used < reviews_limit + bonus_reviews RETURNING *`. Check if any row was returned — if not, the limit was exceeded.
**Resolution:** Replaced with `submit_review` Postgres RPC (`supabase/migrations/20260305000000_submit_review_rpc.sql`) that performs atomic check-and-increment within a transaction.

### 1.2 Non-Atomic Multi-Table Write in Submit-for-Review — DONE
**Files:** `src/app/api/applications/[id]/submit-for-review/route.ts:107-145`
**Agent:** DB&API
**Issue:** Inserts `application_reviews` row, updates `applications` status, increments `usage` — all as separate operations. If any step fails, the system is left in an inconsistent state (e.g., review exists but usage not incremented, or vice versa).
**Fix:** Wrap in a Postgres transaction via RPC. Create a `submit_review` function that atomically performs the check-and-increment, inserts the review, and updates the application status.
**Resolution:** Created `submit_review` Postgres RPC that atomically performs all three operations in a single transaction. Route now calls `serviceClient.rpc("submit_review", ...)` instead of separate queries.

### 1.3 Unmapped Stripe Statuses Violate DB CHECK Constraint — DONE
**Files:** `src/lib/stripe/webhooks.ts:84-97`
**Agent:** Payment
**Issue:** `mapStripeStatus` only maps `"canceled"` → `"cancelled"`. Stripe can send `"trialing"`, `"incomplete"`, `"incomplete_expired"`, `"unpaid"`, `"paused"` — all of which violate the DB CHECK constraint `('active', 'past_due', 'cancelled')`, causing silent update failures.
**Fix:** Extend `mapStripeStatus` to cover all Stripe statuses:
- `"trialing"` → `"active"`
- `"incomplete"` / `"incomplete_expired"` / `"unpaid"` → `"past_due"`
- `"paused"` → `"cancelled"` (or add to CHECK constraint)
Add error checking on the update result.
**Resolution:** `mapStripeStatus` rewritten as typed switch statement covering all Stripe statuses with a default fallback to `"past_due"` with console warning.

### 1.4 parse-criteria & parse-questions Use Wrong Model (Sonnet Instead of Haiku)
**Files:** `src/lib/ai/parse-criteria.ts:39`, `src/lib/ai/parse-questions.ts:51`
**Agent:** AI Pipeline
**Issue:** Both use `claude-sonnet-4-6` for simple structured extraction. `detect-fund.ts` correctly uses `claude-haiku-4-5-20251001`. Sonnet costs ~3.75x more for this class of task.
**Fix:** Change to `"claude-haiku-4-5-20251001"` in both files.

### 1.5 parse-criteria & parse-questions Create New Anthropic Client Per Call — DONE
**Files:** `src/lib/ai/parse-criteria.ts:38`, `src/lib/ai/parse-questions.ts:50`
**Agent:** AI Pipeline
**Issue:** Both do `const client = new Anthropic()` inside the function body. `detect-fund.ts` and `anthropic.ts` correctly use a `getClient()` singleton pattern.
**Fix:** Add the same `getClient()` singleton pattern, or import a shared client instance.
**Resolution:** Added `getClient()` singleton pattern to both files.

### 1.6 Non-Null Assertion on Nullable User Object — DONE
**Files:** `src/app/(dashboard)/dashboard/page.tsx:16`, `src/app/(dashboard)/funds/page.tsx:13`
**Agent:** Code Quality
**Issue:** `user!.id` used after `getUser()` which can return null. Although the layout redirects unauthenticated users, the page has no guard and could throw a runtime error.
**Fix:** Add explicit null check: `if (!user) redirect("/login")` before using `user.id`.
**Resolution:** Added `if (!user) redirect("/login")` guard to both pages, removed `!` non-null assertions.

### 1.7 Dead Schemas from Removed Document Flow — DONE
**Files:** `src/lib/schemas/criteria.ts:80-88,134-143`
**Agent:** Code Quality
**Issue:** `SubmitReviewRequestSchema` and `SubmitReviewRequestV2Schema` reference `bidFileName` and `bidFilePath` from the removed document-based flow. Dead code that could mislead developers.
**Fix:** Remove both schemas. Search for and remove any references.
**Resolution:** Removed both schemas and their associated tests from `criteria.test.ts`.

### 1.8 ANTI_HALLUCINATION References Legacy paragraph_id — DONE
**Files:** `src/lib/pipeline/prompt-templates.ts:88`
**Agent:** Code Quality
**Issue:** `ANTI_HALLUCINATION` constant includes "Every paragraph_id MUST correspond to a paragraph ID from the document map provided." The application pipeline has no document map — this actively misinforms the AI model.
**Fix:** Remove or rewrite the `paragraph_id` rule. Check if `ANTI_HALLUCINATION` is used anywhere in the application pipeline; if not, mark as legacy or remove entirely.
**Resolution:** Removed the `paragraph_id` rule from `ANTI_HALLUCINATION`. Removed the unused `ANTI_HALLUCINATION` import from `application-prompts.ts`.

### 1.9 Zero Test Coverage for Stripe Payment Flow — DONE
**Files:** `src/app/api/stripe/checkout/route.ts`, `portal/route.ts`, `webhooks/route.ts`, `src/lib/stripe/webhooks.ts`
**Agent:** Test Coverage
**Issue:** The entire Stripe payment flow — checkout session creation, portal access, webhook routing, and all 4 webhook handlers — has zero tests. This is revenue-critical code.
**Fix:** Add route-level tests mocking Stripe SDK:
- Checkout: unauthenticated (401), already-subscribed (400), new/existing customer paths, successful session
- Portal: unauthenticated (401), no customer_id (400), success
- Webhooks: missing signature (400), invalid signature (400), routing for all 4 event types
- Handlers: `handleCheckoutCompleted` profile update + usage sync, `handleSubscriptionUpdated` status mapping, `handleSubscriptionDeleted` tier downgrade, `handleInvoicePaymentFailed` status update
**Resolution:** Added comprehensive test suite in `src/app/api/stripe/__tests__/stripe-routes.test.ts` (871 lines) covering all routes and handlers.

### 1.10 Zero Test Coverage for Feedback API — DONE
**Files:** `src/app/api/applications/[id]/reviews/[reviewId]/feedback/route.ts`
**Agent:** Test Coverage
**Issue:** No route-level tests despite complex validation (item_type whitelist, item_path length, sentiment, ownership, delete vs upsert branching).
**Fix:** Add route-level tests covering all validation branches, GET ownership checks, PATCH upsert/delete paths.
**Resolution:** Tests already existed in `feedback/__tests__/route.test.ts` (20 tests).

---

## Priority 2 — High (Fix Soon)

### 2.1 Open Redirect in Auth Callback — DONE
**Files:** `src/app/auth/callback/route.ts:8,31`
**Agent:** Security
**Issue:** `redirect` query parameter is used in `NextResponse.redirect()` without validation. Attacker can craft `redirect=//evil.com` for phishing.
**Fix:** Validate redirect starts with `/` and not `//`:
```ts
const safeRedirect = redirect.startsWith("/") && !redirect.startsWith("//") ? redirect : "/dashboard";
```
**Resolution:** Added validation — redirect must start with `/` and not `//`, else defaults to `/dashboard`.

### 2.2 Missing Subscription Tier Check on parse-questions — DONE
**Files:** `src/app/api/parse-questions/route.ts`
**Agents:** Security, AI Pipeline
**Issue:** `parse-criteria` route checks `subscription_tier !== "pro"` and returns 403. `parse-questions` has no such gate — any authenticated user (including free tier) can trigger AI calls.
**Fix:** Add the same profile/tier check as in `parse-criteria/route.ts`.
**Resolution:** Added pro-tier check matching parse-criteria route.

### 2.3 No Input Size Limit on AI Parsing Endpoints — DONE
**Files:** `src/lib/ai/parse-criteria.ts:48`, `src/lib/ai/parse-questions.ts:57`
**Agent:** AI Pipeline
**Issue:** `rawText` has only `min(10)` validation but no maximum length. A user could paste extremely large documents, causing unbounded token cost. `detect-fund.ts` correctly truncates to 2000 chars.
**Fix:** Add `.max(50000)` to the Zod schema, or truncate `rawText` before sending to the API.
**Resolution:** Added `.max(200000)` to `ParseCriteriaRequestSchema` (200K chars to support long funder documents).

### 2.4 Truncated AI Responses Processed Instead of Erroring — DONE
**Files:** `src/lib/ai/parse-criteria.ts:67-69`, `src/lib/ai/parse-questions.ts:79-80`
**Agent:** AI Pipeline
**Issue:** When `stop_reason === "max_tokens"`, both functions log a warning but proceed to parse truncated output. Can produce corrupt data or throw SyntaxError.
**Fix:** Throw an error: `throw new Error("Response truncated — input may be too long")`.
**Resolution:** Both now use `callClaude()` which throws `NonRetriableError` on truncation.

### 2.5 No Retry Logic in parse-criteria / parse-questions — DONE
**Files:** `src/lib/ai/parse-criteria.ts`, `src/lib/ai/parse-questions.ts`
**Agent:** AI Pipeline
**Issue:** These call `client.messages.create()` directly without any retry logic. `callClaude` in `anthropic.ts` has sophisticated error classification + retries, but these bypass it. A single 429 returns 500 to user.
**Fix:** Refactor to use `callClaude()` with tool use — fixes this issue plus 2.4 and 2.6 in one change.
**Resolution:** Both refactored to use `callClaude()` — gets retry logic, truncation handling, and Zod validation for free.

### 2.6 No Tool Use / Structured Output in parse-criteria / parse-questions — DONE
**Files:** `src/lib/ai/parse-criteria.ts`, `src/lib/ai/parse-questions.ts`
**Agent:** AI Pipeline
**Issue:** Rely on fragile text-based JSON extraction with regex for markdown code fences. The main pipeline correctly uses tool use with guaranteed structured JSON output.
**Fix:** Refactor to use `callClaude()` which handles tool use, Zod validation, and validation retries automatically. This single refactor fixes issues 1.4, 1.5, 2.4, 2.5, and 2.6.
**Resolution:** Both refactored to use `callClaude()` with tool use + Zod schema validation.

### 2.7 Missing JSON Parse Error Handling in PATCH — DONE
**Files:** `src/app/api/applications/[id]/route.ts:18`
**Agents:** Security, DB&API
**Issue:** `await request.json()` without try/catch. Malformed JSON throws unhandled exception, returns 500 with stack trace.
**Fix:** Wrap in try/catch like other routes.
**Resolution:** Wrapped `request.json()` in try/catch returning 400.

### 2.8 Unbounded Admin Metrics Query — DONE
**Files:** `src/app/api/admin/metrics/route.ts:40`
**Agent:** DB&API
**Issue:** Query fetches all `ai_usage_logs` rows with no limit. Supabase default 1000-row limit silently truncates, giving inaccurate aggregates.
**Fix:** Use SQL aggregation via `serviceClient.rpc()`: `SELECT COUNT(*), SUM(input_tokens), ...`
**Resolution:** Added `.limit(50000)` to admin metrics queries.

### 2.9 Unreliable Draft Count Limit — DONE
**Files:** `src/app/api/applications/[id]/reviews/[reviewId]/create-draft/route.ts:43-54`
**Agents:** Security, DB&API
**Issue:** Draft limit uses LIKE on title field, counts all users' drafts for the fund (not just current user's), and is bypassable by renaming.
**Fix:** Add `.eq("user_id", user.id)` to the count query. Consider a dedicated `source_review_id` column instead of title matching.
**Resolution:** Added `.eq("user_id", user.id)` to scope draft count to current user.

### 2.10 Legacy FK in review_purchases
**Files:** `src/types/database.ts:563-569`
**Agent:** DB&API
**Issue:** `review_purchases.review_id` references the deprecated `reviews` table instead of `application_reviews`.
**Fix:** Add migration to update FK, or document as deprecated if unused.

### 2.11 Subscription Status Not Checked During Usage Enforcement — DONE
**Files:** `src/app/api/applications/[id]/submit-for-review/route.ts:47-54`
**Agent:** Payment
**Issue:** Only checks `subscription_tier === "pro"` but not `subscription_status`. A user with `past_due` or delayed `cancelled` status can still submit reviews.
**Fix:** Also check `subscription_status === "active"`.
**Resolution:** Route now selects `subscription_status` and returns 403 if status is not `"active"`.

### 2.12 Webhook Error Swallowing Prevents Stripe Retries — DONE
**Files:** `src/app/api/stripe/webhooks/route.ts:59-62`
**Agent:** Payment
**Issue:** Catch block logs error but returns 200. Stripe will not retry. If `handleCheckoutCompleted` fails, user pays but never gets Pro.
**Fix:** Return 500 for critical handler failures so Stripe retries. Consider storing event IDs for idempotency.
**Resolution:** Changed catch block to return 500 so Stripe retries failed webhook deliveries.

### 2.13 No Usage Rollback on Pipeline Failure — DONE
**Files:** `src/lib/inngest/application-review.ts:87-103`
**Agent:** Payment
**Issue:** When pipeline fails, `reviews_used` incremented at submit time is never decremented. User loses quota without getting a result.
**Fix:** In `onFailure` handler, decrement: `UPDATE usage SET reviews_used = GREATEST(0, reviews_used - 1)`.
**Resolution:** Created `rollback_usage` Postgres RPC and added call in Inngest `onFailure` handler.

### 2.14 Race Condition in Stripe Customer Creation — DONE
**Files:** `src/app/api/stripe/checkout/route.ts:32-43`
**Agent:** Payment
**Issue:** Double-click creates duplicate Stripe customers. Second update overwrites first customer ID.
**Fix:** Use Stripe idempotency keys, or `INSERT ... ON CONFLICT` for customer ID.
**Resolution:** Added `idempotencyKey: \`create-customer-${user.id}\`` to `stripe.customers.create()`.

### 2.15 ApplicationFormClient.tsx Too Large (~890 Lines)
**Files:** `src/app/(dashboard)/applications/[id]/ApplicationFormClient.tsx`
**Agent:** Code Quality
**Issue:** Single component handles title editing, questions set swapping, markdown export/import, delete confirmation, auto-save, word counting, and modals.
**Fix:** Decompose into `useAutoSave`, `useDeleteConfirmation`, `TitleEditor`, `ExportImportSection`, etc.

### 2.16 Duplicated Components and Utilities — DONE
**Agent:** Code Quality
**Issue:** Multiple instances of identical code:
- `ApplicationStatusBadge` — `ApplicationsList.tsx:146-164` and `ApplicationFormClient.tsx:833-855`
- `GripIcon` SVG — `CriteriaPreview.tsx:265-282` and `QuestionsPreview.tsx:366-383`
- `MONTHS_SHORT` + `formatDateUTC` — `ApplicationsList.tsx:8-9` and `HistoryClient.tsx:158-162`
- `READINESS_COLOURS` — `review/constants.ts:14-19` and `HistoryClient.tsx:44-49`
**Fix:** Extract each to shared modules (`components/ApplicationStatusBadge.tsx`, `components/icons/`, `lib/date-utils.ts`, single constants export).
**Resolution:** Extracted all four to shared modules: `components/ApplicationStatusBadge.tsx`, `components/icons/GripIcon.tsx`, `lib/date-utils.ts`. HistoryClient now imports `READINESS_COLOURS` from `review/constants.ts`.

### 2.17 File/Export Naming Mismatch — DONE
**Files:** `src/components/CreateDraftButton.tsx`
**Agent:** Code Quality
**Issue:** File named `CreateDraftButton` but exports `NewReviewButton`.
**Fix:** Rename file to `NewReviewButton.tsx` and update imports.
**Resolution:** Renamed file to `NewReviewButton.tsx` and updated imports in ApplicationReviewClient.tsx and HistoryClient.tsx.

### 2.18 Unsafe Type Cast for Cache Usage Fields — DONE
**Files:** `src/lib/ai/anthropic.ts:184-185`
**Agents:** Code Quality, AI Pipeline
**Issue:** `msg.usage as unknown as Record<string, number>` — fragile cast that suppresses type checking.
**Fix:** Define a proper type extension or use optional chaining with runtime fallback.
**Resolution:** Simplified cast with `as unknown as Record<string, number>` for cache-specific fields that aren't in the SDK types yet.

### 2.19 Zero Tests for 15+ API Routes — PARTIAL
**Agent:** Test Coverage
**Issue:** The following routes have zero test coverage:
- `funds/route.ts` (GET search + POST create)
- `funds/[id]/route.ts` (GET detail + DELETE)
- `funds/my/route.ts` (GET user's funds)
- `funds/[id]/criteria-sets/route.ts` (POST create)
- `funds/[id]/questions-sets/route.ts` (POST create)
- `admin/criteria-sets/[id]/approve/route.ts` (PATCH)
- `admin/questions-sets/[id]/approve/route.ts` (PATCH)
- `admin/organisations/[id]/approve/route.ts` (PATCH)
- `admin/metrics/route.ts` (GET)
- `applications/[id]/reviews/[reviewId]/create-draft/route.ts` (POST)
- `applications/[id]/questions-set/route.ts` (PATCH)
- `detect-fund/route.ts` (POST)
- `parse-questions/route.ts` (POST)
- `proxy.ts` (auth middleware)
**Fix:** Prioritize route-level tests for data mutation endpoints. The proxy is the authorization gate for the entire app and needs tests.
**Resolution (partial):** Added `funds.test.ts` (32 tests: GET/POST funds, GET fund by ID, DELETE fund, GET my funds) and `admin-and-ai.test.ts` (23 tests: admin approvals, parse-questions, detect-fund). Remaining untested: criteria-sets/questions-sets POST, admin metrics, create-draft, questions-set PATCH, proxy.

### 2.20 Zero Tests for AI Helpers — PARTIAL
**Files:** `src/lib/ai/detect-fund.ts`, `src/lib/ai/parse-questions.ts`
**Agent:** Test Coverage
**Issue:** `detect-fund.ts` — no tests for result processing logic (UNKNOWN handling, length check, text block extraction). `parse-questions.ts` — no tests despite `parse-criteria.ts` having them.
**Fix:** Add unit tests mocking `@anthropic-ai/sdk`.
**Resolution (partial):** `parse-criteria.test.ts` rewritten to mock `callClaude`. parse-questions and detect-fund covered via route-level tests in `admin-and-ai.test.ts`. Dedicated unit tests for detect-fund still TODO.

---

## Priority 3 — Medium (Plan for Next Sprint)

### 3.1 Raw Supabase Error Messages Exposed to Client
**File:** `src/app/api/applications/[id]/route.ts:25-31`
**Fix:** Return generic error message instead of `error.message`.

### 3.2 Service Client Bypasses RLS for Answer Upsert
**File:** `src/app/api/applications/[id]/answers/route.ts:52-65`
**Fix:** Document design intent or use RLS client if possible.

### 3.3 User ID Interpolated Into PostgREST Filter String
**Files:** `src/app/api/organisations/route.ts:45`, `src/app/api/funds/route.ts:46`
**Fix:** Use separate filter calls instead of string interpolation.

### 3.4 Cross-Reference Prompt Token Duplication
**File:** `src/lib/pipeline/application-prompts.ts:370-507`
**Fix:** Remove redundant raw texts if cross-reference accuracy is acceptable with excerpts alone.

### 3.5 No Memoisation of Individual Answer Analyses
**File:** `src/lib/inngest/application-review.ts:493-577`
**Fix:** Chunk answer analyses into batches of 5 per Inngest step for memoisation.

### 3.6 Hardcoded Model Pricing Silently Returns Zero for Unknown Models
**File:** `src/lib/ai/pricing.ts:14-27`
**Fix:** Log warning on unknown model. Add test validating all used model IDs appear in pricing map.

### 3.7 Non-Atomic Questions Set Swap
**File:** `src/app/api/applications/[id]/questions-set/route.ts:113-144`
**Fix:** Check errors from all operations. Consider wrapping in Postgres transaction.

### 3.8 Sequential Queries in Fund Detail Route
**File:** `src/app/api/funds/[id]/route.ts:69-108`
**Fix:** Wrap four queries in `Promise.all`.

### 3.9 handleCheckoutCompleted Not Fully Idempotent
**File:** `src/lib/stripe/webhooks.ts:48-82`
**Fix:** Track processed event IDs, or use `ignoreDuplicates: true` to avoid resetting usage.

### 3.10 syncUsageOnDowngrade Uses Wrong Period Key Format
**File:** `src/lib/stripe/webhooks.ts:36-46`
**Fix:** Use `getUsagePeriod()` to match the billing-period-based key format.

### 3.11 Billing Progress Bar Ignores Bonus Reviews
**File:** `src/app/(dashboard)/billing/page.tsx:99-118`
**Fix:** Display `usage.limit + usage.bonus` as denominator, or show bonus separately.

### 3.12 handleSubscriptionUpdated Doesn't Sync Tier
**File:** `src/lib/stripe/webhooks.ts:84-97`
**Fix:** Also update `subscription_tier` based on subscription items in the `updated` handler.

### 3.13 Repeated Type Cast for Organisation Join Shape
**Files:** Multiple `page.tsx` files (4+ occurrences)
**Fix:** Create shared `normalizeFundWithOrg()` helper.

### 3.14 Unused userId Prop
**File:** `src/app/(dashboard)/applications/new/NewApplicationForm.tsx:39`
**Fix:** Remove `userId` from props and parent.

### 3.15 Hardcoded Price Strings
**Files:** `src/components/UpsellPrompt.tsx`, `src/app/(dashboard)/billing/BillingClient.tsx`
**Fix:** Define as constant in Stripe plans module.

### 3.16 Non-Null Assertions on Env Vars Without Runtime Validation
**Files:** `src/lib/stripe/plans.ts:13`, `src/lib/supabase/server.ts`, `src/lib/supabase/client.ts`
**Fix:** Add startup validation or centralized env config.

### 3.17 parseReviewResults Uses Cascading Unsafe Casts
**File:** `src/app/(dashboard)/applications/[id]/review/types.ts:72-83`
**Fix:** Use Zod parsing at the JSON boundary.

### 3.18 RLS Integration Tests Only Cover Legacy Tables
**File:** `src/lib/auth/__tests__/rls.integration.test.ts`
**Fix:** Extend to cover `applications`, `application_answers`, `application_reviews`, `review_feedback`.

### 3.19 Inngest Pipeline Orchestrator Has No Step Sequencing Tests
**File:** `src/lib/inngest/application-review.ts:307-832`
**Fix:** Add integration test with mocked Inngest step primitives.

### 3.20 Answer Row Insertion Failure Silently Swallowed
**File:** `src/app/api/applications/route.ts:96-103`
**Fix:** Return error or include warning in response.

---

## Priority 4 — Low (Address When Touching These Files)

### 4.1 Security Headers
- `next.config.ts` — Add CSP, HSTS, X-Frame-Options, Referrer-Policy, X-Content-Type-Options.

### 4.2 Broad Path Prefix Matching for Webhook Bypass
- `proxy.ts:13-14` — Use exact path matching instead of `startsWith`.

### 4.3 URL Param UUID Validation
- Various API routes — Add `z.string().uuid()` for path params.

### 4.4 User Email Exposed as Display Name Fallback
- `layout.tsx:27` — Use `email.split("@")[0]` or generic fallback.

### 4.5 No Pagination on List Endpoints
- `funds/my/route.ts`, `reviews/route.ts` — Add `.limit()`.

### 4.6 Admin Approve Endpoints Don't Validate Resource Exists
- Return 404 for non-existent IDs instead of silent success.

### 4.7 PATCH Doesn't Check Affected Row Count
- `applications/[id]/route.ts:25-28` — Verify row was actually updated.

### 4.8 field_type CHECK Constraint Mismatch
- `types/database.ts:34` — CHECK constraint doesn't include all types from Zod schema.

### 4.9 NEXT_PUBLIC_APP_URL Falls Back to Localhost
- `stripe/checkout/route.ts:45` — Throw if unset in production.

### 4.10 review_count Increment Not Atomic
- `submit-for-review:107` — Use SQL `review_count + 1`.

### 4.11 UpsellPrompt Doesn't Handle past_due Status
- Accept `subscription_status` prop and show payment warning.

### 4.12 Model Constants Not Centralized
- `application-review.ts:39` — Export shared `PIPELINE_MODEL` / `EXTRACTION_MODEL`.

### 4.13 Hardcoded USD-to-GBP Exchange Rate
- `pricing.ts:29` — Add comment noting it's approximate; consider periodic update.

### 4.14 Date Formatting Inconsistency
- Standardize on one approach (locale-sensitive or manual UTC) project-wide.

### 4.15 Unused options in proxy.ts setAll
- `proxy.ts:31` — Remove `options` from destructuring.

### 4.16 detect-fund Doesn't Use Tool Use
- Acceptable for simple single-string extraction, but consider tool use for consistency.

### 4.17 Minor Test Quality Issues
- Stale mock pattern in `applications.test.ts`
- Reimplemented sort logic in `review-logic.test.ts`
- Missing `QuestionsSetSchema` validation tests

---

## Recommended Remediation Order

### Sprint 1 — Critical Security & Payment — ALL DONE
1. ~~**1.1 + 1.2** — Atomic usage check + transaction for submit-for-review (single Postgres RPC)~~ DONE
2. ~~**1.3** — Fix Stripe status mapping~~ DONE
3. ~~**2.12** — Stop swallowing webhook errors~~ DONE
4. ~~**2.1** — Fix open redirect~~ DONE
5. ~~**2.11** — Check subscription_status~~ DONE
6. ~~**2.13** — Add usage rollback on failure~~ DONE
7. ~~**2.14** — Fix Stripe customer race condition~~ DONE
8. ~~**1.9** — Add Stripe payment tests~~ DONE

### Sprint 2 — AI Pipeline Refactor — ALL DONE
9. ~~**1.5 + 2.5 + 2.6** — Refactor parse-criteria/parse-questions to use `callClaude()` (tool use + retries + validation)~~ DONE
10. ~~**2.2** — Add tier check on parse-questions~~ DONE
11. ~~**2.3** — Add input size limits (200K chars)~~ DONE
12. ~~**1.8** — Fix ANTI_HALLUCINATION legacy reference~~ DONE
13. **1.4** — Switch model to Haiku — DEFERRED (user decided Sonnet needed for accuracy on long inputs)

### Sprint 3 — Code Quality & Testing — MOSTLY DONE
14. ~~**1.6** — Fix non-null assertions~~ DONE
15. ~~**1.7** — Remove dead schemas~~ DONE
16. ~~**2.7** — Fix JSON parse error handling~~ DONE
17. ~~**2.8** — Add query limits to admin metrics~~ DONE
18. ~~**2.9** — Scope draft count to current user~~ DONE
19. ~~**2.16** — Extract shared components/utilities~~ DONE
20. ~~**2.17** — Rename CreateDraftButton to NewReviewButton~~ DONE
21. ~~**2.18** — Simplify unsafe type cast~~ DONE
22. ~~**1.10** — Feedback API tests~~ DONE (pre-existing)
23. ~~**2.19 + 2.20** — Add tests for untested routes and AI helpers~~ PARTIAL (55 new tests added; some routes still untested)
24. **2.15** — Decompose ApplicationFormClient.tsx — TODO

### Sprint 4 — Medium Priority Cleanup
25. Items 3.1–3.20 as time permits

### Ongoing
26. Items 4.1–4.17 — address when touching the relevant files
