# High Priority Fixes — Design & Implementation Plan

**Date:** 2026-03-04
**Scope:** 18 high-priority issues from code review (Priority 2)
**Prerequisite:** All 10 critical issues (Priority 1) resolved

---

## Group 1: Security & Payment

### 2.1 Open Redirect in Auth Callback
- Validate `redirect` param: must start with `/` and not `//`
- File: `src/app/auth/callback/route.ts`

### 2.12 Webhook Error Swallowing
- Return 500 on handler errors so Stripe retries
- File: `src/app/api/stripe/webhooks/route.ts`

### 2.13 Usage Rollback on Pipeline Failure
- In Inngest `onFailure`, decrement `reviews_used` via `GREATEST(0, reviews_used - 1)`
- File: `src/lib/inngest/application-review.ts`

### 2.14 Stripe Customer Race Condition
- Use Stripe `idempotencyKey` keyed by userId on `customers.create()`
- File: `src/app/api/stripe/checkout/route.ts`

## Group 2: AI Pipeline Refactor

### 2.2 + 2.3 + 2.4 + 2.5 + 2.6 — Unified Refactor
- Refactor `parse-criteria.ts` and `parse-questions.ts` to use `callClaude()`
- Fixes: retry logic, tool use, truncation handling, input validation
- Add `.max(200000)` to rawText Zod schemas in route files
- Add tier check to `parse-questions/route.ts` matching `parse-criteria/route.ts`
- Note: `callClaude` uses `NonRetriableError` from Inngest — catch in route handlers

## Group 3: Code Quality

### 2.7 JSON Parse Error Handling
- Wrap `request.json()` in try/catch in `applications/[id]/route.ts` PATCH

### 2.8 Unbounded Admin Metrics Query
- Replace unbounded fetch with SQL aggregation via RPC

### 2.9 Unreliable Draft Count Limit
- Add `.eq("user_id", user.id)` to count query

### 2.10 Legacy FK
- Document as deprecated (review_purchases appears unused)

### 2.15 Large Component Decomposition
- Extract from ApplicationFormClient.tsx: useAutoSave, TitleEditor, ExportImportSection

### 2.16 Duplicated Code
- Extract: ApplicationStatusBadge, GripIcon, formatDateUTC, READINESS_COLOURS

### 2.17 File/Export Naming Mismatch
- Rename CreateDraftButton.tsx → NewReviewButton.tsx, update imports

### 2.18 Unsafe Type Cast
- Define proper type for cache usage fields

## Group 4: Test Coverage

### 2.19 Route Tests
- Prioritize: funds CRUD, admin approvals, create-draft, parse-questions, proxy

### 2.20 AI Helper Tests
- Add tests for detect-fund.ts and parse-questions.ts
