# Draft Mode Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a per-review "draft mode" checkbox to the submit dialog that propagates through the AI pipeline to suppress placeholder penalties, reframe feedback tone, suppress word count comments, and show draft notices in the review UI.

**Architecture:** `is_draft` boolean stored on `application_reviews` → passed via Inngest event → prompt builders inject draft-mode instruction blocks → review UI shows draft banner and suppresses `submission_readiness`.

**Tech Stack:** PostgreSQL migration, TypeScript, Next.js App Router, Inngest, Anthropic Claude prompt builders, Vitest.

---

### Task 1: Database migration

**Files:**
- Create: `supabase/migrations/20260315000000_draft_mode.sql`

**Step 1: Create the migration file**

```sql
-- Add is_draft to application_reviews
ALTER TABLE public.application_reviews
  ADD COLUMN IF NOT EXISTS is_draft boolean NOT NULL DEFAULT false;

-- Update submit_review RPC to accept and store p_is_draft
CREATE OR REPLACE FUNCTION submit_review(
  p_application_id UUID,
  p_user_id UUID,
  p_review_number INT,
  p_questions_set_id UUID,
  p_criteria_set_id UUID,
  p_period TEXT,
  p_default_limit INT DEFAULT 0,
  p_estimated_credits_low INT DEFAULT 0,
  p_is_draft BOOLEAN DEFAULT false
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
  INSERT INTO public.usage (user_id, period, credits_used, credits_limit, bonus_reviews)
  VALUES (p_user_id, p_period, 0, p_default_limit, 0)
  ON CONFLICT (user_id, period) DO NOTHING;

  SELECT u.credits_used, u.credits_limit, u.bonus_reviews
  INTO v_credits_used, v_credits_limit, v_bonus
  FROM public.usage u
  WHERE u.user_id = p_user_id AND u.period = p_period
  FOR UPDATE;

  SELECT purchased_credits INTO v_purchased
  FROM public.profiles
  WHERE id = p_user_id
  FOR UPDATE;

  v_available := GREATEST(0, v_credits_limit - v_credits_used) + v_bonus + COALESCE(v_purchased, 0);

  IF v_available < p_estimated_credits_low THEN
    RAISE EXCEPTION 'INSUFFICIENT_CREDITS';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.application_reviews ar
    JOIN public.applications a ON a.id = ar.application_id
    WHERE a.user_id = p_user_id
    AND ar.status IN ('pending', 'analysing', 'cross_referencing', 'scoring')
  ) THEN
    RAISE EXCEPTION 'REVIEW_IN_PROGRESS';
  END IF;

  INSERT INTO public.application_reviews (
    application_id, review_number, status, questions_set_id, criteria_set_id, is_draft
  )
  VALUES (
    p_application_id, p_review_number, 'pending', p_questions_set_id, p_criteria_set_id, p_is_draft
  )
  RETURNING id INTO v_review_id;

  UPDATE public.applications
  SET status = 'submitted_for_review',
      review_count = p_review_number
  WHERE id = p_application_id;

  RETURN QUERY SELECT v_review_id, p_review_number;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

**Step 2: Apply the migration**

```bash
cd app
npx supabase db push
```

Expected: migration applied successfully, no errors.

**Step 3: Commit**

```bash
git add supabase/migrations/20260315000000_draft_mode.sql
git commit -m "feat: add is_draft to application_reviews + update submit_review RPC"
```

---

### Task 2: Regenerate TypeScript types

**Files:**
- Modify: `src/types/database.ts`

**Step 1: Regenerate**

```bash
cd app
npx supabase gen types typescript --project-id pxvtcaqpithbjifpxnic > src/types/database.ts
```

Expected: `application_reviews` Row type now includes `is_draft: boolean`.

**Step 2: Commit**

```bash
git add src/types/database.ts
git commit -m "chore: regenerate types after draft_mode migration"
```

---

### Task 3: Write failing tests for prompt builders

**Files:**
- Modify: `src/lib/pipeline/__tests__/application-prompts.test.ts`

**Step 1: Add draft mode tests at the end of the file**

```typescript
// ---------------------------------------------------------------------------
// Draft mode: buildAnswerAnalysisPrompt
// ---------------------------------------------------------------------------

describe("buildAnswerAnalysisPrompt — draft mode", () => {
  it("includes draft instruction block when isDraft is true", () => {
    const prompt = buildAnswerAnalysisPrompt(makeAnswer(), null, true);
    expect(prompt).toContain("draft application");
    expect(prompt).toContain("Do not penalise placeholders");
    expect(prompt).toContain("Consider including");
  });

  it("does NOT include draft instruction block when isDraft is false", () => {
    const prompt = buildAnswerAnalysisPrompt(makeAnswer(), null, false);
    expect(prompt).not.toContain("draft application");
  });

  it("does NOT include draft instruction block by default", () => {
    const prompt = buildAnswerAnalysisPrompt(makeAnswer());
    expect(prompt).not.toContain("draft application");
  });

  it("suppresses word count feedback when isDraft is true (regardless of field type)", () => {
    const prompt = buildAnswerAnalysisPrompt(
      makeAnswer({ word_count_max: 500 }),
      null,
      true
    );
    expect(prompt).not.toContain("## Word Count");
  });
});

// ---------------------------------------------------------------------------
// Draft mode: buildApplicationCrossReferencePrompt
// ---------------------------------------------------------------------------

describe("buildApplicationCrossReferencePrompt — draft mode", () => {
  const analyses: AnswerAnalysis[] = [];
  const questions = [{ id: "q1", question: "Describe your project" }];
  const criteria = [{ id: "c1", criterion: "Impact" }];

  it("includes draft instruction block when isDraft is true", () => {
    const { userPrompt } = buildApplicationCrossReferencePrompt(
      analyses, questions, criteria, [], [], true
    );
    expect(userPrompt).toContain("draft application");
    expect(userPrompt).toContain("Placeholders may cause apparent gaps");
  });

  it("does NOT include draft instruction block when isDraft is false", () => {
    const { userPrompt } = buildApplicationCrossReferencePrompt(
      analyses, questions, criteria, [], [], false
    );
    expect(userPrompt).not.toContain("draft application");
  });
});

// ---------------------------------------------------------------------------
// Draft mode: buildApplicationScoringPrompt
// ---------------------------------------------------------------------------

describe("buildApplicationScoringPrompt — draft mode", () => {
  const analyses: AnswerAnalysis[] = [];
  const crossRef = { findings: [], gap_criteria: [] } as unknown as import("../schemas").CrossReference;
  const questions = [{ id: "q1", question: "Describe your project" }];
  const criteria = [{ id: "c1", criterion: "Impact" }];

  it("includes draft instruction block when isDraft is true", () => {
    const { userPrompt } = buildApplicationScoringPrompt(
      analyses, crossRef, questions, criteria, undefined, [], undefined, true
    );
    expect(userPrompt).toContain("draft application");
    expect(userPrompt).toContain("Score leniently");
  });

  it("does NOT include draft instruction block when isDraft is false", () => {
    const { userPrompt } = buildApplicationScoringPrompt(
      analyses, crossRef, questions, criteria, undefined, [], undefined, false
    );
    expect(userPrompt).not.toContain("draft application");
  });
});
```

**Step 2: Run the tests to verify they fail**

```bash
cd app
npm test -- src/lib/pipeline/__tests__/application-prompts.test.ts
```

Expected: new draft mode tests FAIL with "received string does not contain expected string".

---

### Task 4: Update prompt builders

**Files:**
- Modify: `src/lib/pipeline/application-prompts.ts`

**Step 1: Add draft instruction constant near the top of the file (after `ANSWER_ANTI_HALLUCINATION`)**

```typescript
// ---------------------------------------------------------------------------
// Draft mode instruction blocks
// ---------------------------------------------------------------------------

const DRAFT_ANSWER_INSTRUCTION = `
## Draft Mode

This answer is from a draft application. It may contain placeholders (e.g. "TBC", "£X,XXX", "[partner name]", "evidence from X").
- Do not penalise placeholders — assume they will be completed with strong content.
- Score leniently on the assumption that placeholders represent intent.
- Do not comment on word count.
- Frame all inline comments as forward-looking suggestions ("Consider including...", "This section could strengthen by...") rather than evaluations of failure.
`.trim();

const DRAFT_CROSS_REFERENCE_INSTRUCTION = `
## Draft Mode

This is a draft application. Placeholders may cause apparent gaps or inconsistencies — do not flag these as contradictions or unresolved references unless the substantive content on both sides conflicts.
`.trim();

const DRAFT_SCORING_INSTRUCTION = `
## Draft Mode

This is a draft application containing placeholders. Score leniently — assume placeholders will be completed with competent content. Produce scores and quality dimensions as normal, but reflect the draft status in your overall framing.
`.trim();
```

**Step 2: Update `buildAnswerAnalysisPrompt` signature and suppress word count in draft mode**

Find the function signature:
```typescript
export function buildAnswerAnalysisPrompt(
  answer: AnswerContext,
  previousContext?: string | null
): string {
```

Replace with:
```typescript
export function buildAnswerAnalysisPrompt(
  answer: AnswerContext,
  previousContext?: string | null,
  isDraft?: boolean
): string {
```

Inside the function, find where the prompt string is assembled and prepend the draft block. The function builds a `parts` array (or similar). Find the return statement and add the draft instruction at the top of the user prompt.

Look for the section that assembles the final prompt string. Add this logic just before the return:

```typescript
const draftBlock = isDraft ? `${DRAFT_ANSWER_INSTRUCTION}\n\n` : "";
```

And prepend `draftBlock` to the returned string.

Also find the word count section logic. It currently checks `factualFieldTypes` and `constrainedFieldTypes` to suppress word count. Add `isDraft` as an additional suppression condition:

Find the existing check (approximately):
```typescript
const suppressWordCount = factualFieldTypes.has(answer.field_type ?? "") || constrainedFieldTypes.has(answer.field_type ?? "");
```

Change to:
```typescript
const suppressWordCount = isDraft || factualFieldTypes.has(answer.field_type ?? "") || constrainedFieldTypes.has(answer.field_type ?? "");
```

(If the word count suppression is implemented differently — e.g. early returns or inline conditions — apply the same `isDraft ||` prefix to any condition that gates the word count section.)

**Step 3: Update `buildApplicationCrossReferencePrompt` signature**

Find:
```typescript
export function buildApplicationCrossReferencePrompt(
  analyses: AnswerAnalysis[],
  questions: Array<{ id: string; question: string }>,
  criteria: Criterion[],
  disabledQuestions: Array<{ question_id: string; question_text: string }> = [],
  answerTexts: Array<{ question_id: string; answer_text: string }> = []
): { systemPrompt: CacheBlock[]; userPrompt: string } {
```

Replace with:
```typescript
export function buildApplicationCrossReferencePrompt(
  analyses: AnswerAnalysis[],
  questions: Array<{ id: string; question: string }>,
  criteria: Criterion[],
  disabledQuestions: Array<{ question_id: string; question_text: string }> = [],
  answerTexts: Array<{ question_id: string; answer_text: string }> = [],
  isDraft?: boolean
): { systemPrompt: CacheBlock[]; userPrompt: string } {
```

At the end of the function, where `userPrompt` is assembled, prepend the draft block:

Find the `return { systemPrompt: [...], userPrompt: ... }` statement and change `userPrompt` to:
```typescript
userPrompt: isDraft ? `${DRAFT_CROSS_REFERENCE_INSTRUCTION}\n\n${userPrompt}` : userPrompt,
```

**Step 4: Update `buildApplicationScoringPrompt` signature**

Find:
```typescript
export function buildApplicationScoringPrompt(
  analyses: AnswerAnalysis[],
  crossReference: CrossReference,
  questions: Array<{ id: string; question: string }>,
  criteria: Criterion[],
  overallWordLimit?: number,
  disabledQuestions: Array<{ question_id: string; question_text: string }> = [],
  previousOverallContext?: string | null
): { systemPrompt: CacheBlock[]; userPrompt: string } {
```

Replace with:
```typescript
export function buildApplicationScoringPrompt(
  analyses: AnswerAnalysis[],
  crossReference: CrossReference,
  questions: Array<{ id: string; question: string }>,
  criteria: Criterion[],
  overallWordLimit?: number,
  disabledQuestions: Array<{ question_id: string; question_text: string }> = [],
  previousOverallContext?: string | null,
  isDraft?: boolean
): { systemPrompt: CacheBlock[]; userPrompt: string } {
```

Same pattern — prepend draft block to `userPrompt` in the return statement:
```typescript
userPrompt: isDraft ? `${DRAFT_SCORING_INSTRUCTION}\n\n${userPrompt}` : userPrompt,
```

**Step 5: Run tests**

```bash
cd app
npm test -- src/lib/pipeline/__tests__/application-prompts.test.ts
```

Expected: all tests PASS, including new draft mode tests.

**Step 6: Commit**

```bash
git add src/lib/pipeline/application-prompts.ts src/lib/pipeline/__tests__/application-prompts.test.ts
git commit -m "feat: add isDraft param to prompt builders with draft instruction blocks"
```

---

### Task 5: Update Inngest pipeline

**Files:**
- Modify: `src/lib/inngest/application-review.ts`

**Step 1: Read `isDraft` from event data**

Find (line ~364):
```typescript
const { applicationId, reviewId, userId } = event.data;
```

Replace with:
```typescript
const { applicationId, reviewId, userId, isDraft = false } = event.data;
```

**Step 2: Pass `isDraft` to answer analysis prompt**

Find (line ~581):
```typescript
const prompt = buildAnswerAnalysisPrompt(ctx, prevContext);
```

Replace with:
```typescript
const prompt = buildAnswerAnalysisPrompt(ctx, prevContext, isDraft);
```

**Step 3: Pass `isDraft` to cross-reference prompt**

Find (line ~668):
```typescript
const { systemPrompt, userPrompt } = buildApplicationCrossReferencePrompt(
  answerAnalyses,
  questions.map((q) => ({ id: q.id, question: q.question })),
  criteria,
```

The call continues with `disabledQuestions` and `answerTexts` arguments. Add `isDraft` as the final argument after those:
```typescript
const { systemPrompt, userPrompt } = buildApplicationCrossReferencePrompt(
  answerAnalyses,
  questions.map((q) => ({ id: q.id, question: q.question })),
  criteria,
  disabledQuestions,   // existing arg
  answerTexts,         // existing arg
  isDraft
);
```

(Check the exact existing call — match whatever args are currently passed and append `isDraft` at the end.)

**Step 4: Pass `isDraft` to scoring prompt**

Find (line ~748):
```typescript
const { systemPrompt: scoringSystemPrompt, userPrompt: scoringUserPrompt } = buildApplicationScoringPrompt(
  answerAnalyses,
  crossReferenceWithGaps,
  questions.map((q) => ({ id: q.id, question: q.question })),
```

The call continues with `criteria`, `overallWordLimit`, `disabledQuestions`, `prevOverallContext`. Add `isDraft` as the final argument:
```typescript
const { systemPrompt: scoringSystemPrompt, userPrompt: scoringUserPrompt } = buildApplicationScoringPrompt(
  answerAnalyses,
  crossReferenceWithGaps,
  questions.map((q) => ({ id: q.id, question: q.question })),
  criteria,          // existing
  overallWordLimit,  // existing
  disabledQuestions, // existing
  prevOverallContext, // existing
  isDraft
);
```

**Step 5: Run full test suite**

```bash
cd app
npm test
```

Expected: all existing tests pass (no regressions from the Inngest changes — Inngest function itself isn't unit tested directly).

**Step 6: Commit**

```bash
git add src/lib/inngest/application-review.ts
git commit -m "feat: propagate isDraft through Inngest pipeline to prompt builders"
```

---

### Task 6: Update submit-for-review API route

**Files:**
- Modify: `src/app/api/applications/[id]/submit-for-review/route.ts`

**Step 1: Parse request body**

Find (line 9):
```typescript
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
```

Replace with:
```typescript
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
```

After `const { id } = await params;`, add:
```typescript
const body = await request.json().catch(() => ({}));
const isDraft = body.is_draft === true;
```

**Step 2: Pass `p_is_draft` to the RPC**

Find the `serviceClient.rpc("submit_review", { ... })` call and add `p_is_draft: isDraft` to the parameters object:

```typescript
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
    p_estimated_credits_low: gatingCredits,
    p_is_draft: isDraft,
  }
);
```

**Step 3: Pass `isDraft` to Inngest event**

Find the `inngest.send(...)` call and add `isDraft` to the data payload:
```typescript
await inngest.send({
  name: "application/review-requested",
  data: {
    applicationId: id,
    reviewId,
    reviewNumber,
    userId: user.id,
    isDraft,
  },
});
```

**Step 4: Run full test suite**

```bash
cd app
npm test
```

Expected: all tests pass.

**Step 5: Commit**

```bash
git add src/app/api/applications/[id]/submit-for-review/route.ts
git commit -m "feat: read is_draft from request body and pass to RPC and Inngest"
```

---

### Task 7: Update submit confirmation dialog UI

**Files:**
- Modify: `src/app/(dashboard)/applications/[id]/ApplicationFormClient.tsx`

**Step 1: Add `draftReviewMode` state**

Find the block of `useState` declarations near the top of `ApplicationFormClient`. Add:
```typescript
const [draftReviewMode, setDraftReviewMode] = useState(false);
```

Note: `isDraft` is already used in this file to mean `application.status === "draft"`. Use `draftReviewMode` for the new toggle to avoid collision.

**Step 2: Pass `is_draft` in the fetch body**

Find `handleConfirmSubmit` (line ~189):
```typescript
const res = await fetch(`/api/applications/${application.id}/submit-for-review`, {
  method: "POST",
});
```

Replace with:
```typescript
const res = await fetch(`/api/applications/${application.id}/submit-for-review`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ is_draft: draftReviewMode }),
});
```

**Step 3: Add draft checkbox to the submit confirmation modal**

The modal has three branches: no-estimate+canAfford, hasEstimate+canAfford, and cannotAfford. Add the checkbox to the two "canAfford" branches (not the "Buy Credits" branch).

In both `canAfford` branches, find the `<div className="mt-6 flex justify-end gap-3">` that contains Cancel + Confirm buttons, and add the checkbox above it:

```tsx
<div className="mt-4">
  <label className="flex cursor-pointer items-start gap-3">
    <input
      type="checkbox"
      checked={draftReviewMode}
      onChange={(e) => setDraftReviewMode(e.target.checked)}
      className="mt-0.5 h-4 w-4 rounded border-zinc-300 text-blue-600"
    />
    <div>
      <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
        This is a draft review
      </span>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        Placeholders won&apos;t be penalised. Feedback will be framed as suggestions to help you develop your answers.
      </p>
    </div>
  </label>
</div>
```

**Step 4: Reset `draftReviewMode` when modal closes**

When the Cancel button is clicked in the modal it calls `setShowSubmitConfirm(false)`. After this reset the draft toggle so it doesn't persist across modal opens:

Find both cancel button `onClick` handlers in the submit modal:
```tsx
onClick={() => setShowSubmitConfirm(false)}
```

Replace with:
```tsx
onClick={() => { setShowSubmitConfirm(false); setDraftReviewMode(false); }}
```

**Step 5: Commit**

```bash
git add src/app/(dashboard)/applications/[id]/ApplicationFormClient.tsx
git commit -m "feat: add draft review checkbox to submit confirmation dialog"
```

---

### Task 8: Propagate is_draft through review page

**Files:**
- Modify: `src/app/(dashboard)/applications/[id]/review/page.tsx`
- Modify: `src/app/(dashboard)/applications/[id]/review/types.ts`
- Modify: `src/app/(dashboard)/applications/[id]/review/ApplicationReviewClient.tsx`
- Modify: `src/app/(dashboard)/applications/[id]/review/components/SummaryTab.tsx`

**Step 1: Fetch `is_draft` in the review page**

In `review/page.tsx`, find the review query select (line ~58):
```typescript
.select("id, review_number, status, progress, results, error_message, questions_set_id, created_at")
```

Replace with:
```typescript
.select("id, review_number, status, progress, results, error_message, questions_set_id, created_at, is_draft")
```

Find where the `review` prop is assembled (line ~129):
```typescript
review={review ? {
  id: review.id,
  review_number: review.review_number,
  status: review.status,
  progress: review.progress as Record<string, unknown> | null,
  results: review.results as Record<string, unknown> | null,
  error_message: review.error_message,
  created_at: review.created_at,
} : null}
```

Add `is_draft`:
```typescript
review={review ? {
  id: review.id,
  review_number: review.review_number,
  status: review.status,
  progress: review.progress as Record<string, unknown> | null,
  results: review.results as Record<string, unknown> | null,
  error_message: review.error_message,
  created_at: review.created_at,
  is_draft: review.is_draft ?? false,
} : null}
```

**Step 2: Add `is_draft` to the review type in `types.ts`**

Find the `review` field in `ApplicationReviewClientProps` (line ~55):
```typescript
review: {
  id: string;
  review_number: number;
  status: string;
  progress: Record<string, unknown> | null;
  results: Record<string, unknown> | null;
  error_message: string | null;
  created_at: string;
} | null;
```

Add `is_draft: boolean`:
```typescript
review: {
  id: string;
  review_number: number;
  status: string;
  progress: Record<string, unknown> | null;
  results: Record<string, unknown> | null;
  error_message: string | null;
  created_at: string;
  is_draft: boolean;
} | null;
```

**Step 3: Pass `is_draft` from `ApplicationReviewClient` to `SummaryTab`**

In `ApplicationReviewClient.tsx`, find where `SummaryTab` is rendered and add `isDraft`:
```tsx
<SummaryTab
  // ... existing props
  isDraft={review?.is_draft ?? false}
/>
```

Check `SummaryTab`'s prop interface and add `isDraft: boolean` to it.

**Step 4: Show draft banner and replace submission_readiness in `SummaryTab`**

In `SummaryTab.tsx`, accept the new prop:
```typescript
// In props interface/destructuring, add:
isDraft: boolean;
```

Find where `submission_readiness` is rendered (line ~70):
```tsx
<span className={`rounded-full px-3 py-1 text-sm font-medium ${READINESS_COLOURS[scoring.submission_readiness] ?? ""}`}>
  {scoring.submission_readiness}
</span>
```

Replace with:
```tsx
{isDraft ? (
  <span className="rounded-full bg-zinc-100 px-3 py-1 text-sm font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
    Draft — submission readiness not assessed
  </span>
) : (
  <span className={`rounded-full px-3 py-1 text-sm font-medium ${READINESS_COLOURS[scoring.submission_readiness] ?? ""}`}>
    {scoring.submission_readiness}
  </span>
)}
```

Add a draft warning banner near the top of the SummaryTab return (before the score section):
```tsx
{isDraft && (
  <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-900/20">
    <p className="text-sm text-amber-800 dark:text-amber-200">
      <strong>Draft review</strong> — scores assume placeholders will be completed with strong content. Take scores as directional, not definitive.
    </p>
  </div>
)}
```

**Step 5: Commit**

```bash
git add src/app/(dashboard)/applications/[id]/review/page.tsx src/app/(dashboard)/applications/[id]/review/types.ts src/app/(dashboard)/applications/[id]/review/ApplicationReviewClient.tsx src/app/(dashboard)/applications/[id]/review/components/SummaryTab.tsx
git commit -m "feat: show draft banner and replace submission_readiness on draft reviews"
```

---

### Task 9: Show draft badge in review history

**Files:**
- Modify: `src/app/(dashboard)/applications/[id]/history/page.tsx`
- Modify: `src/app/(dashboard)/applications/[id]/history/HistoryClient.tsx`

**Step 1: Fetch `is_draft` in history page**

In `history/page.tsx`, find the reviews query select (line ~43):
```typescript
.select("id, review_number, status, results, error_message, created_at")
```

Replace with:
```typescript
.select("id, review_number, status, results, error_message, created_at, is_draft")
```

In the `.map()` that builds the `reviews` array, add `is_draft`:
```typescript
return {
  id: r.id,
  review_number: r.review_number,
  status: r.status,
  overall_score: ...,
  submission_readiness: ...,
  error_message: r.error_message,
  created_at: r.created_at,
  is_draft: r.is_draft ?? false,
};
```

**Step 2: Add `is_draft` to `ReviewSummary` interface in `HistoryClient.tsx`**

Find:
```typescript
interface ReviewSummary {
  id: string;
  review_number: number;
  status: string;
  overall_score: number | null;
  submission_readiness: string | null;
  error_message: string | null;
  created_at: string;
}
```

Add `is_draft: boolean`:
```typescript
interface ReviewSummary {
  id: string;
  review_number: number;
  status: string;
  overall_score: number | null;
  submission_readiness: string | null;
  error_message: string | null;
  created_at: string;
  is_draft: boolean;
}
```

**Step 3: Show "Draft" badge in `ReviewRow`**

In `ReviewRow`, find the review number span (line ~160):
```tsx
<span className="w-20 shrink-0 text-sm font-medium">
  Review #{review.review_number}
</span>
```

Replace with:
```tsx
<span className="flex w-20 shrink-0 items-center gap-1.5 text-sm font-medium">
  Review #{review.review_number}
  {review.is_draft && (
    <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs font-normal text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
      Draft
    </span>
  )}
</span>
```

**Step 4: Run full test suite**

```bash
cd app
npm test
```

Expected: all tests pass.

**Step 5: Commit**

```bash
git add src/app/(dashboard)/applications/[id]/history/page.tsx src/app/(dashboard)/applications/[id]/history/HistoryClient.tsx
git commit -m "feat: show Draft badge in review history for draft reviews"
```
