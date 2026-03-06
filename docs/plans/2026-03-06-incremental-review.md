# Incremental Review Optimisation — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reduce Anthropic token spend on re-reviews by reusing previous answer analyses for unchanged answers, skipping redundant Claude calls.

**Architecture:** In the `answer-analyses` Inngest step, split answers into reusable (unchanged text + same criteria set + valid previous analysis) and fresh (everything else). Only call Claude for fresh answers. Merge both into the same array — downstream pipeline unchanged.

**Tech Stack:** TypeScript, Inngest, Zod, Vitest

---

### Task 1: Extract reusable analyses helper function

**Files:**
- Modify: `src/lib/inngest/application-review.ts:226-237` (after `computeAnswerChanges`)
- Test: `src/lib/inngest/__tests__/review-helpers.test.ts`

**Step 1: Write the failing tests**

Add to `review-helpers.test.ts`, importing the new function:

```typescript
import {
  trimPreviousReviewResults,
  computeAnswerChanges,
  annotateResolvedWeaknesses,
  extractReusableAnalyses,
} from "../application-review";
```

```typescript
// ---------------------------------------------------------------------------
// extractReusableAnalyses
// ---------------------------------------------------------------------------

describe("extractReusableAnalyses", () => {
  const validAnalysis: AnswerAnalysis = {
    question_id: "q1",
    inline_comments: [],
    criteria_relevance: [{ criterion_id: "c1", relevance: "directly_addresses" }],
    strengths: ["Good"],
    weaknesses: ["Bad"],
    answer_score: "Strong",
  };

  it("returns analyses for unchanged answers with matching criteria set", () => {
    const previousResults = {
      answer_feedback: { q1: validAnalysis, q2: { ...validAnalysis, question_id: "q2" } },
    };
    const answerChanges = { q1: false, q2: true };
    const result = extractReusableAnalyses(previousResults, answerChanges, true);

    expect(result.q1).toBeDefined();
    expect(result.q1!.question_id).toBe("q1");
    expect(result.q2).toBeUndefined();
  });

  it("returns empty when criteria set does not match", () => {
    const previousResults = {
      answer_feedback: { q1: validAnalysis },
    };
    const answerChanges = { q1: false };
    const result = extractReusableAnalyses(previousResults, answerChanges, false);

    expect(Object.keys(result)).toHaveLength(0);
  });

  it("returns empty when no previous results", () => {
    const result = extractReusableAnalyses(null, { q1: false }, true);
    expect(Object.keys(result)).toHaveLength(0);
  });

  it("returns empty when answer_feedback is missing", () => {
    const result = extractReusableAnalyses({}, { q1: false }, true);
    expect(Object.keys(result)).toHaveLength(0);
  });

  it("skips answers not in answerChanges", () => {
    const previousResults = {
      answer_feedback: { q1: validAnalysis },
    };
    const result = extractReusableAnalyses(previousResults, {}, true);
    expect(result.q1).toBeUndefined();
  });

  it("skips answers where answerChanges entry is true (changed)", () => {
    const previousResults = {
      answer_feedback: { q1: validAnalysis },
    };
    const result = extractReusableAnalyses(previousResults, { q1: true }, true);
    expect(result.q1).toBeUndefined();
  });

  it("skips analyses that fail schema validation", () => {
    const previousResults = {
      answer_feedback: {
        q1: { question_id: "q1", bad_field: true }, // missing required fields
      },
    };
    const answerChanges = { q1: false };
    const result = extractReusableAnalyses(previousResults, answerChanges, true);
    expect(result.q1).toBeUndefined();
  });

  it("handles first-review scenario (null previousResults)", () => {
    const result = extractReusableAnalyses(null, {}, true);
    expect(result).toEqual({});
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd app && npx vitest run src/lib/inngest/__tests__/review-helpers.test.ts`
Expected: FAIL — `extractReusableAnalyses` is not exported

**Step 3: Implement extractReusableAnalyses**

Add after `computeAnswerChanges` (around line 237) in `application-review.ts`:

```typescript
/**
 * Extract reusable answer analyses from a previous review's results.
 * An analysis is reusable when: criteria set matches, answer text unchanged,
 * and the previous analysis passes schema validation.
 */
export function extractReusableAnalyses(
  previousResults: Record<string, unknown> | null | undefined,
  answerChanges: Record<string, boolean>,
  criteriaSetMatch: boolean
): Record<string, AnswerAnalysis> {
  const reusable: Record<string, AnswerAnalysis> = {};

  if (!criteriaSetMatch || !previousResults) return reusable;

  const af = previousResults.answer_feedback;
  if (!af || typeof af !== "object") return reusable;

  const feedbackMap = af as Record<string, unknown>;

  for (const [questionId, raw] of Object.entries(feedbackMap)) {
    // Only reuse if answer is explicitly unchanged
    if (answerChanges[questionId] !== false) continue;

    // Validate against schema before accepting
    const parsed = AnswerAnalysisSchema.safeParse(raw);
    if (!parsed.success) continue;

    reusable[questionId] = parsed.data;
  }

  return reusable;
}
```

**Step 4: Run tests to verify they pass**

Run: `cd app && npx vitest run src/lib/inngest/__tests__/review-helpers.test.ts`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add src/lib/inngest/application-review.ts src/lib/inngest/__tests__/review-helpers.test.ts
git commit -m "feat: add extractReusableAnalyses helper for incremental reviews"
```

---

### Task 2: Load criteria_set_id from previous review

**Files:**
- Modify: `src/lib/inngest/application-review.ts:384-459` (load-application step)

**Step 1: Update the previous review query to include criteria_set_id**

In the `load-application` step, change line 386:

```typescript
// BEFORE:
.select("review_number, results")

// AFTER:
.select("review_number, results, criteria_set_id")
```

**Step 2: Add criteriaSetMatch and reusableAnalyses to the return value**

After the existing `previousReviewContext` block (around line 448), add:

```typescript
      // Determine if previous review used the same criteria set
      const criteriaSetMatch = prevReview
        ? prevReview.criteria_set_id === app.criteria_set_id
        : false;

      // Extract full reusable analyses (only when criteria set matches)
      const reusableAnalyses = prevReview?.results && typeof prevReview.results === "object"
        ? extractReusableAnalyses(
            prevReview.results as Record<string, unknown>,
            answerChanges,
            criteriaSetMatch
          )
        : {} as Record<string, AnswerAnalysis>;
```

Update the return object (line 450) to include the new field:

```typescript
      return {
        title: app.title,
        criteria: criteriaSet.criteria_json as unknown as Criterion[],
        questions,
        overallWordLimit: questionsSet.overall_word_limit ?? undefined,
        enabledAnswers,
        disabledQuestions,
        previousReview: previousReviewContext,
        answerChanges,
        reusableAnalyses,
      };
```

**Step 3: Update the destructure on line 462**

```typescript
// BEFORE:
const { criteria, questions, enabledAnswers, disabledQuestions, overallWordLimit, previousReview, answerChanges } = appData;

// AFTER:
const { criteria, questions, enabledAnswers, disabledQuestions, overallWordLimit, previousReview, answerChanges, reusableAnalyses } = appData;
```

**Step 4: Run the full test suite to check nothing broke**

Run: `cd app && npx vitest run`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add src/lib/inngest/application-review.ts
git commit -m "feat: load criteria_set_id from previous review and compute reusable analyses"
```

---

### Task 3: Modify answer-analyses step to skip unchanged answers

**Files:**
- Modify: `src/lib/inngest/application-review.ts:500-584` (answer-analyses step)

**Step 1: Split answerContexts into fresh and reusable**

At the start of the `answer-analyses` step (inside `step.run("answer-analyses", async () => {`), before the existing `analyseAnswer` function, add:

```typescript
        // Split into fresh (need Claude) and reusable (pull from previous review)
        const freshContexts: AnswerContext[] = [];
        const reusedAnalyses: AnswerAnalysis[] = [];

        for (const ctx of answerContexts) {
          const cached = reusableAnalyses[ctx.question_id];
          if (cached) {
            reusedAnalyses.push(cached);
          } else {
            freshContexts.push(ctx);
          }
        }
```

**Step 2: Change the batched analysis to use freshContexts instead of answerContexts**

Replace the first pass call (around line 555):

```typescript
        // BEFORE:
        let settled = await runBatched(answerContexts);

        // AFTER:
        let settled = freshContexts.length > 0
          ? await runBatched(freshContexts)
          : [];
```

Update the retry loop's `retryContexts` mapping (around line 567):

```typescript
        // BEFORE:
        const retryContexts = failedIndices.map((i) => answerContexts[i]);

        // AFTER:
        const retryContexts = failedIndices.map((i) => freshContexts[i]);
```

**Step 3: Merge fresh and reused analyses**

Replace the final collection block (around line 577-582):

```typescript
        // BEFORE:
        const analyses = settled.map((result) => {
          if (result.status === "fulfilled") return result.value;
          throw result.reason;
        });

        return { analyses, usage: stepUsage };

        // AFTER:
        const freshAnalyses = settled.map((result) => {
          if (result.status === "fulfilled") return result.value;
          throw result.reason;
        });

        // Merge: reused analyses + fresh analyses
        const analyses = [...reusedAnalyses, ...freshAnalyses];

        return { analyses, usage: stepUsage };
```

**Step 4: Run the full test suite**

Run: `cd app && npx vitest run`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add src/lib/inngest/application-review.ts
git commit -m "feat: skip Claude calls for unchanged answers in answer-analyses step"
```

---

### Task 4: Write integration-style tests for the reuse flow

**Files:**
- Test: `src/lib/inngest/__tests__/review-helpers.test.ts`

**Step 1: Add tests verifying the split logic**

These tests verify the splitting behaviour in isolation (the actual Inngest step is hard to unit test, but `extractReusableAnalyses` + the split logic are the testable surface):

```typescript
describe("incremental review integration", () => {
  const makeValidAnalysis = (qId: string): AnswerAnalysis => ({
    question_id: qId,
    inline_comments: [],
    criteria_relevance: [{ criterion_id: "c1", relevance: "directly_addresses" }],
    strengths: ["Good"],
    weaknesses: [],
    answer_score: "Strong",
  });

  it("reuses 14 of 15 analyses when only 1 answer changed", () => {
    const previousResults: Record<string, unknown> = {
      answer_feedback: Object.fromEntries(
        Array.from({ length: 15 }, (_, i) => [`q${i + 1}`, makeValidAnalysis(`q${i + 1}`)])
      ),
    };
    // Only q3 changed
    const answerChanges: Record<string, boolean> = Object.fromEntries(
      Array.from({ length: 15 }, (_, i) => [`q${i + 1}`, i === 2])
    );

    const reusable = extractReusableAnalyses(previousResults, answerChanges, true);

    expect(Object.keys(reusable)).toHaveLength(14);
    expect(reusable.q3).toBeUndefined(); // changed answer not reused
    expect(reusable.q1).toBeDefined();
    expect(reusable.q15).toBeDefined();
  });

  it("reuses nothing when criteria set changed", () => {
    const previousResults: Record<string, unknown> = {
      answer_feedback: Object.fromEntries(
        Array.from({ length: 15 }, (_, i) => [`q${i + 1}`, makeValidAnalysis(`q${i + 1}`)])
      ),
    };
    const answerChanges: Record<string, boolean> = Object.fromEntries(
      Array.from({ length: 15 }, (_, i) => [`q${i + 1}`, false])
    );

    const reusable = extractReusableAnalyses(previousResults, answerChanges, false);

    expect(Object.keys(reusable)).toHaveLength(0);
  });

  it("reuses nothing on first review", () => {
    const reusable = extractReusableAnalyses(null, {}, true);
    expect(Object.keys(reusable)).toHaveLength(0);
  });

  it("handles mix of valid and invalid previous analyses", () => {
    const previousResults: Record<string, unknown> = {
      answer_feedback: {
        q1: makeValidAnalysis("q1"),
        q2: { question_id: "q2", bad: true }, // invalid schema
        q3: makeValidAnalysis("q3"),
      },
    };
    const answerChanges = { q1: false, q2: false, q3: false };

    const reusable = extractReusableAnalyses(previousResults, answerChanges, true);

    expect(Object.keys(reusable)).toHaveLength(2);
    expect(reusable.q1).toBeDefined();
    expect(reusable.q2).toBeUndefined(); // failed validation
    expect(reusable.q3).toBeDefined();
  });
});
```

**Step 2: Run tests to verify they pass**

Run: `cd app && npx vitest run src/lib/inngest/__tests__/review-helpers.test.ts`
Expected: ALL PASS

**Step 3: Commit**

```bash
git add src/lib/inngest/__tests__/review-helpers.test.ts
git commit -m "test: add integration tests for incremental review reuse logic"
```

---

### Task 5: Run full test suite and verify build

**Step 1: Run all tests**

Run: `cd app && npx vitest run`
Expected: ALL PASS

**Step 2: Run build**

Run: `cd app && npm run build`
Expected: Build succeeds with no type errors

**Step 3: Commit (if any lint/type fixes needed)**

```bash
git add -A
git commit -m "fix: resolve any lint/type issues from incremental review changes"
```

Only commit if there are actual changes. If tests and build pass cleanly, skip this step.

---

### Task 6: Clean up the overview doc

**Files:**
- Delete: `Scoping/incremental-review-optimisation.md` (superseded by design doc in `docs/plans/`)

**Step 1: Remove the overview doc**

```bash
rm Scoping/incremental-review-optimisation.md
```

**Step 2: Commit**

```bash
git add Scoping/incremental-review-optimisation.md
git commit -m "chore: remove superseded overview doc"
```
