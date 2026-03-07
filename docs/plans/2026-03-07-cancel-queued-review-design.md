# Cancel Queued Review — Design

## Problem

When a review is stuck in `submitted_for_review` status (e.g. Inngest not running when the event fired), the user is blocked from submitting any other review due to the `REVIEW_IN_PROGRESS` check in the `submit_review` RPC. There is no mechanism to recover without manual database intervention.

## Solution

A manual cancel button on the application form page, visible only when the application is in `submitted_for_review` status. Cancelling resets the application to `draft` and marks the pending review as `failed`.

## Architecture

### API Endpoint

`POST /api/applications/[id]/cancel-review`

- **Auth:** user must be authenticated
- **Ownership:** application must belong to the authenticated user (enforced via RLS using `createClient()`)
- **Guard:** application status must be `submitted_for_review` — returns `409 Conflict` if not (nothing to cancel)
- **Actions (in order):**
  1. Mark the pending `application_reviews` row as `failed` with `error_message = 'Cancelled by user'`
  2. Set `applications.status = 'draft'`
- **Response:** `200 { success: true }` on success
- **No credit rollback needed** — credits are only deducted after pipeline completion, so nothing was charged for a stuck review

### UI

In `ApplicationFormClient.tsx`, alongside the existing submit button area:

- Renders **only** when `application.status === 'submitted_for_review'`
- Label: "Cancel queued review"
- Single-click with inline confirmation state (button label changes to "Are you sure? Click to confirm" on first click, second click fires the request) — no modal needed
- On success: calls `router.refresh()` to reload the page in editable draft state
- On error: shows error message via existing `setError`

### No DB Migration Required

Uses existing `applications.status` and `application_reviews.status` columns and their existing allowed values (`draft`, `failed`).

## Non-Goals

- No auto-timeout/auto-cancel
- No cancel once `reviewing` has started (Inngest has picked it up)
- No admin cancel UI (can be done via Supabase dashboard if needed)
