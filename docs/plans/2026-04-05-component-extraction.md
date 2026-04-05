# Component Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract self-contained UI blocks from large files into named components — purely structural, no logic or behaviour changes.

**Architecture:** Option C (shared primitives first, then file-by-file). `ReviewCard` is created first as a shared shell component; subsequent tasks depend on it. One feature branch, one worktree, 7 logical commits.

**Tech Stack:** Next.js 16, React 19, TypeScript strict mode, Tailwind CSS v4, Vitest + @testing-library/react, @dnd-kit/core + @dnd-kit/sortable

---

## File Structure

### New files created
```
src/app/(dashboard)/applications/[id]/review/components/
  ReviewCard.tsx          — shared card shell (error | info | neutral variant)
  ReviewFailed.tsx        — failed-state display (extracted from ApplicationReviewClient)
  ReviewProgress.tsx      — in-progress display with step indicators (extracted from ApplicationReviewClient)
  __tests__/ReviewProgress.test.tsx

src/components/
  WordCounter.tsx         — word count display with colour thresholds (extracted from FormField)
  CharCounter.tsx         — char count display with colour thresholds (extracted from FormField)
  OAuthButtons.tsx        — Google OAuth button shared across login + signup
  questions/
    SortableQuestionCard.tsx — single draggable question editor (extracted from QuestionsPreview)
  criteria/
    SortableCriterionCard.tsx — single draggable criterion editor (extracted from CriteriaPreview)
  funds/
    FundSearchResults.tsx — fund search results list (extracted from FundDetection)
  __tests__/
    WordCounter.test.tsx
    CharCounter.test.tsx

src/app/(dashboard)/admin/orgs/[orgId]/funds/[fundId]/components/
  CriteriaSetCard.tsx     — criteria set link card (extracted from admin fund detail page)
  QuestionsSetCard.tsx    — questions set link card (extracted from admin fund detail page)
```

### Modified files
```
src/app/(dashboard)/applications/[id]/review/ApplicationReviewClient.tsx
src/components/FormField.tsx
src/components/QuestionsPreview.tsx
src/components/CriteriaPreview.tsx
src/components/FundDetection.tsx
src/app/(dashboard)/admin/orgs/[orgId]/funds/[fundId]/page.tsx
src/app/(auth)/login/page.tsx
src/app/(auth)/signup/page.tsx
```

---

## Task 0: Create Git Worktree

**Files:** None — git operations only

- [ ] **Step 1: Create the feature branch and worktree**

From the `app/` directory (the git root):

```bash
git checkout -b component-extraction
git worktree add ../projectBidReviewer-component-extraction component-extraction
```

- [ ] **Step 2: Verify the worktree exists**

```bash
git worktree list
```

Expected output includes two entries: the main `app/` directory and the new worktree at `../projectBidReviewer-component-extraction`.

- [ ] **Step 3: All remaining tasks run inside the worktree**

```bash
cd ../projectBidReviewer-component-extraction
```

All subsequent commands run from this directory.

---

## Task 1: Shared Primitive — ReviewCard

**Files:**
- Create: `src/app/(dashboard)/applications/[id]/review/components/ReviewCard.tsx`

- [ ] **Step 1: Create ReviewCard.tsx**

```tsx
interface ReviewCardProps {
  variant: 'error' | 'info' | 'neutral';
  children: React.ReactNode;
}

const variantStyles: Record<'error' | 'info' | 'neutral', string> = {
  error: 'border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-900/20',
  info: 'border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800/50',
  neutral: 'border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900',
};

export function ReviewCard({ variant, children }: ReviewCardProps) {
  return (
    <div className={`rounded-lg border p-6 ${variantStyles[variant]}`}>
      {children}
    </div>
  );
}
```

- [ ] **Step 2: Verify build passes**

```bash
npm run build 2>&1 | tail -5
```

Expected: `✓ Compiled successfully` (or similar — no TypeScript errors).

- [ ] **Step 3: Commit**

```bash
git add src/app/\(dashboard\)/applications/\[id\]/review/components/ReviewCard.tsx
git commit -m "refactor: add ReviewCard shared primitive"
```

---

## Task 2: Review Page State Extractions

**Files:**
- Create: `src/app/(dashboard)/applications/[id]/review/components/ReviewFailed.tsx`
- Create: `src/app/(dashboard)/applications/[id]/review/components/ReviewProgress.tsx`
- Create: `src/app/(dashboard)/applications/[id]/review/components/__tests__/ReviewProgress.test.tsx`
- Modify: `src/app/(dashboard)/applications/[id]/review/ApplicationReviewClient.tsx`

The `PIPELINE_STEPS` constant lives in `constants.ts` in the review directory:
```ts
export const PIPELINE_STEPS = [
  { key: "pending", label: "Queued" },
  { key: "analysing", label: "Analysing answers" },
  { key: "cross_referencing", label: "Cross-referencing" },
  { key: "scoring", label: "Scoring" },
];
```

- [ ] **Step 1: Write the failing test for ReviewProgress**

Create `src/app/(dashboard)/applications/[id]/review/components/__tests__/ReviewProgress.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("ReviewProgress", () => {
  let React: typeof import("react");
  let render: typeof import("@testing-library/react").render;
  let cleanup: typeof import("@testing-library/react").cleanup;
  let screen: typeof import("@testing-library/react").screen;
  let fireEvent: typeof import("@testing-library/react").fireEvent;

  beforeEach(async () => {
    React = await import("react");
    const rtl = await import("@testing-library/react");
    render = rtl.render;
    cleanup = rtl.cleanup;
    screen = rtl.screen;
    fireEvent = rtl.fireEvent;
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  async function renderProgress(overrides: Record<string, unknown> = {}) {
    const { ReviewProgress } = await import("../ReviewProgress");
    const defaultProps = {
      review: { status: "pending", progress: {} },
      cancellingReview: false,
      showCancelConfirm: false,
      onCancel: vi.fn(),
    };
    return render(
      React.createElement(ReviewProgress, { ...defaultProps, ...overrides })
    );
  }

  it("shows the Queued step as current when status is pending", async () => {
    await renderProgress({ review: { status: "pending", progress: {} } });
    const label = screen.getByText("Queued");
    expect(label.className).toContain("text-blue-600");
  });

  it("shows Queued as done and Analysing answers as current when status is analysing", async () => {
    await renderProgress({ review: { status: "analysing", progress: {} } });
    const queued = screen.getByText("Queued");
    const analysing = screen.getByText("Analysing answers");
    expect(queued.className).toContain("text-zinc-500");
    expect(analysing.className).toContain("text-blue-600");
  });

  it("shows scoring as pending when status is analysing", async () => {
    await renderProgress({ review: { status: "analysing", progress: {} } });
    const scoring = screen.getByText("Scoring");
    expect(scoring.className).toContain("text-zinc-400");
  });

  it("renders an interactive cancel button when status is pending", async () => {
    await renderProgress({ review: { status: "pending", progress: {} } });
    const btn = screen.getByRole("button", { name: "Cancel review" });
    expect((btn as HTMLButtonElement).disabled).toBe(false);
  });

  it("renders a disabled cancel button when status is analysing", async () => {
    await renderProgress({ review: { status: "analysing", progress: {} } });
    const btn = screen.getByRole("button", { name: "Cancel review" });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows Cancelling... when cancellingReview is true", async () => {
    await renderProgress({
      review: { status: "pending", progress: {} },
      cancellingReview: true,
    });
    expect(screen.getByText("Cancelling...")).toBeDefined();
  });

  it("shows confirmation text when showCancelConfirm is true", async () => {
    await renderProgress({
      review: { status: "pending", progress: {} },
      showCancelConfirm: true,
    });
    expect(screen.getByText("Are you sure? Click to confirm")).toBeDefined();
  });

  it("calls onCancel when cancel button is clicked", async () => {
    const onCancel = vi.fn();
    await renderProgress({
      review: { status: "pending", progress: {} },
      onCancel,
    });
    fireEvent.click(screen.getByRole("button", { name: "Cancel review" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npm test -- "src/app/(dashboard)/applications/[id]/review/components/__tests__/ReviewProgress.test.tsx" 2>&1 | tail -10
```

Expected: FAIL — `ReviewProgress` not found / module not found.

- [ ] **Step 3: Create ReviewFailed.tsx**

```tsx
import Link from "next/link";
import { ReviewCard } from "./ReviewCard";

interface ReviewFailedProps {
  review: { error_message: string | null };
  application: { id: string };
}

export function ReviewFailed({ review, application }: ReviewFailedProps) {
  return (
    <>
      <ReviewCard variant="error">
        <h2 className="font-semibold text-red-700 dark:text-red-400">Review Failed</h2>
        <p className="mt-2 text-sm text-red-600 dark:text-red-400">
          {review.error_message ?? "An unexpected error occurred."}
        </p>
      </ReviewCard>
      <Link
        href={`/applications/${application.id}`}
        className="inline-block rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
      >
        Edit &amp; Retry
      </Link>
    </>
  );
}
```

- [ ] **Step 4: Create ReviewProgress.tsx**

```tsx
import { ReviewCard } from "./ReviewCard";
import { safeNumber } from "../types";
import { PIPELINE_STEPS } from "../constants";

interface ReviewProgressProps {
  review: { status: string; progress: unknown };
  cancellingReview: boolean;
  showCancelConfirm: boolean;
  onCancel: () => void;
}

export function ReviewProgress({
  review,
  cancellingReview,
  showCancelConfirm,
  onCancel,
}: ReviewProgressProps) {
  const currentIndex = PIPELINE_STEPS.findIndex((s) => s.key === review.status);
  const progress = review.progress as Record<string, unknown> | null;
  const answersCompleted = safeNumber(progress?.answers_completed);
  const answersTotal = safeNumber(progress?.answers_total);

  return (
    <ReviewCard variant="neutral">
      <h2 className="font-semibold">Review in progress</h2>
      <p className="mt-1 text-sm text-zinc-500">This page updates automatically.</p>

      <div className="mt-6 space-y-3">
        {PIPELINE_STEPS.map((step, i) => {
          const isCurrent = i === currentIndex;
          const isDone = i < currentIndex;
          const isPending = i > currentIndex;

          return (
            <div key={step.key} className="flex items-center gap-3">
              {isDone && (
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
                  <svg className="h-3.5 w-3.5 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                  </svg>
                </span>
              )}
              {isCurrent && (
                <span className="flex h-6 w-6 items-center justify-center">
                  <span className="h-3 w-3 animate-pulse rounded-full bg-blue-500" />
                </span>
              )}
              {isPending && (
                <span className="flex h-6 w-6 items-center justify-center">
                  <span className="h-2 w-2 rounded-full bg-zinc-300 dark:bg-zinc-600" />
                </span>
              )}
              <span className={`text-sm ${isCurrent ? "font-medium text-blue-600 dark:text-blue-400" : isDone ? "text-zinc-500" : "text-zinc-400 dark:text-zinc-500"}`}>
                {step.label}
                {isCurrent && review.status === "analysing" && answersTotal > 0 && ` (${answersCompleted}/${answersTotal})`}
              </span>
            </div>
          );
        })}
      </div>

      <div className="mt-6 border-t border-zinc-100 pt-4 dark:border-zinc-800">
        {review.status === "pending" ? (
          <button
            type="button"
            onClick={onCancel}
            disabled={cancellingReview}
            className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            {cancellingReview
              ? "Cancelling..."
              : showCancelConfirm
                ? "Are you sure? Click to confirm"
                : "Cancel review"}
          </button>
        ) : (
          <button
            type="button"
            disabled
            title="Reviews can't be cancelled once started"
            className="cursor-not-allowed rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-400 opacity-50 dark:border-zinc-800 dark:text-zinc-600"
          >
            Cancel review
          </button>
        )}
      </div>
    </ReviewCard>
  );
}
```

- [ ] **Step 5: Run the test to confirm it passes**

```bash
npm test -- "src/app/(dashboard)/applications/[id]/review/components/__tests__/ReviewProgress.test.tsx" 2>&1 | tail -10
```

Expected: all 8 tests PASS.

- [ ] **Step 6: Update ApplicationReviewClient.tsx**

Add these two imports after the existing imports block (around line 16, after the `NewReviewButton` import):

```tsx
import { ReviewFailed } from "./components/ReviewFailed";
import { ReviewProgress } from "./components/ReviewProgress";
```

Replace the entire `// Failed` block (lines 137–155) with:

```tsx
  // Failed
  if (review.status === "failed") {
    return (
      <div className="space-y-4">
        <Header application={application} fund={fund} submittedAt={review?.created_at} />
        <ReviewFailed review={review} application={application} />
      </div>
    );
  }
```

Replace the entire `// In progress` block (lines 158–233) with:

```tsx
  // In progress
  if (isInProgress) {
    return (
      <div className="space-y-6">
        <Header application={application} fund={fund} submittedAt={review?.created_at} />
        <ReviewProgress
          review={review}
          cancellingReview={cancellingReview}
          showCancelConfirm={showCancelConfirm}
          onCancel={handleCancelReview}
        />
      </div>
    );
  }
```

- [ ] **Step 7: Verify build passes**

```bash
npm run build 2>&1 | tail -5
```

Expected: no TypeScript errors.

- [ ] **Step 8: Run all tests**

```bash
npm test 2>&1 | tail -5
```

Expected: all tests pass.

- [ ] **Step 9: Commit**

```bash
git add "src/app/(dashboard)/applications/[id]/review/components/ReviewFailed.tsx" \
        "src/app/(dashboard)/applications/[id]/review/components/ReviewProgress.tsx" \
        "src/app/(dashboard)/applications/[id]/review/components/__tests__/ReviewProgress.test.tsx" \
        "src/app/(dashboard)/applications/[id]/review/ApplicationReviewClient.tsx"
git commit -m "refactor: extract ReviewFailed and ReviewProgress from ApplicationReviewClient"
```

---

## Task 3: FormField Counter Extractions

**Files:**
- Create: `src/components/WordCounter.tsx`
- Create: `src/components/CharCounter.tsx`
- Create: `src/components/__tests__/WordCounter.test.tsx`
- Create: `src/components/__tests__/CharCounter.test.tsx`
- Modify: `src/components/FormField.tsx`

The current `FormField.tsx` has these internal functions at lines 33–76 that will be moved:
- `wordCount(text)` — counts whitespace-separated tokens
- `WordCounter({ text, min, max })` — renders count with colour thresholds
- `CharCounter({ text, max })` — renders char count with colour thresholds

- [ ] **Step 1: Write the failing WordCounter test**

Create `src/components/__tests__/WordCounter.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";

describe("WordCounter", () => {
  let React: typeof import("react");
  let render: typeof import("@testing-library/react").render;
  let cleanup: typeof import("@testing-library/react").cleanup;
  let screen: typeof import("@testing-library/react").screen;

  beforeEach(async () => {
    React = await import("react");
    const rtl = await import("@testing-library/react");
    render = rtl.render;
    cleanup = rtl.cleanup;
    screen = rtl.screen;
  });

  afterEach(() => cleanup());

  async function renderCounter(props: { text: string; min?: number; max?: number }) {
    const { WordCounter } = await import("../WordCounter");
    return render(React.createElement(WordCounter, props));
  }

  it("renders nothing when neither min nor max is provided", async () => {
    const { container } = await renderCounter({ text: "hello world" });
    expect(container.firstChild).toBeNull();
  });

  it("shows word count and max when max is provided", async () => {
    await renderCounter({ text: "one two three", max: 10 });
    expect(screen.getByText("3 words / 10")).toBeDefined();
  });

  it("shows min warning when count is below min", async () => {
    await renderCounter({ text: "one two", min: 5 });
    expect(screen.getByText("2 words (min 5)")).toBeDefined();
  });

  it("applies text-red-600 when count is over 95% of max", async () => {
    // 96 words, max 100 → ratio 0.96 > 0.95 → red
    const text = Array(96).fill("word").join(" ");
    await renderCounter({ text, max: 100 });
    const el = screen.getByText(/\d+ words/);
    expect(el.className).toContain("text-red-600");
  });

  it("applies text-amber-600 when count is over 80% and not over 95% of max", async () => {
    // 85 words, max 100 → ratio 0.85 → amber
    const text = Array(85).fill("word").join(" ");
    await renderCounter({ text, max: 100 });
    const el = screen.getByText(/\d+ words/);
    expect(el.className).toContain("text-amber-600");
  });

  it("applies text-zinc-500 when count is under 80% of max", async () => {
    // 3 words, max 100 → ratio 0.03 → neutral
    await renderCounter({ text: "one two three", max: 100 });
    const el = screen.getByText(/\d+ words/);
    expect(el.className).toContain("text-zinc-500");
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
npm test -- src/components/__tests__/WordCounter.test.tsx 2>&1 | tail -5
```

Expected: FAIL — `WordCounter` module not found.

- [ ] **Step 3: Create WordCounter.tsx**

```tsx
export function wordCount(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

interface WordCounterProps {
  text: string;
  min?: number;
  max?: number;
}

export function WordCounter({ text, min, max }: WordCounterProps) {
  const count = wordCount(text);
  if (!min && !max) return null;

  const limit = max ?? 0;
  const ratio = limit > 0 ? count / limit : 0;
  const colour =
    limit > 0 && ratio > 0.95
      ? "text-red-600 dark:text-red-400"
      : limit > 0 && ratio > 0.8
        ? "text-amber-600 dark:text-amber-400"
        : "text-zinc-500";

  return (
    <span className={`text-xs ${colour}`}>
      {count} words
      {max ? ` / ${max}` : ""}
      {min && count < min ? ` (min ${min})` : ""}
    </span>
  );
}
```

- [ ] **Step 4: Run the test to confirm it passes**

```bash
npm test -- src/components/__tests__/WordCounter.test.tsx 2>&1 | tail -5
```

Expected: all 6 tests PASS.

- [ ] **Step 5: Write the failing CharCounter test**

Create `src/components/__tests__/CharCounter.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";

describe("CharCounter", () => {
  let React: typeof import("react");
  let render: typeof import("@testing-library/react").render;
  let cleanup: typeof import("@testing-library/react").cleanup;
  let screen: typeof import("@testing-library/react").screen;

  beforeEach(async () => {
    React = await import("react");
    const rtl = await import("@testing-library/react");
    render = rtl.render;
    cleanup = rtl.cleanup;
    screen = rtl.screen;
  });

  afterEach(() => cleanup());

  async function renderCounter(props: { text: string; max: number }) {
    const { CharCounter } = await import("../CharCounter");
    return render(React.createElement(CharCounter, props));
  }

  it("shows char count and max", async () => {
    await renderCounter({ text: "hello", max: 100 });
    expect(screen.getByText("5 / 100 chars")).toBeDefined();
  });

  it("shows over limit message when count exceeds max", async () => {
    const text = "a".repeat(101);
    await renderCounter({ text, max: 100 });
    expect(screen.getByText("101 / 100 chars (over limit)")).toBeDefined();
  });

  it("applies text-red-600 font-semibold when over limit", async () => {
    const text = "a".repeat(101);
    await renderCounter({ text, max: 100 });
    const el = screen.getByText(/chars/);
    expect(el.className).toContain("text-red-600");
    expect(el.className).toContain("font-semibold");
  });

  it("applies text-red-600 (not font-semibold) at exactly 95-100% of max", async () => {
    // 96 chars, max 100 → ratio 0.96 → red without font-semibold
    const text = "a".repeat(96);
    await renderCounter({ text, max: 100 });
    const el = screen.getByText(/chars/);
    expect(el.className).toContain("text-red-600");
    expect(el.className).not.toContain("font-semibold");
  });

  it("applies text-amber-600 when over 80% and under 95%", async () => {
    // 85 chars, max 100 → ratio 0.85 → amber
    const text = "a".repeat(85);
    await renderCounter({ text, max: 100 });
    const el = screen.getByText(/chars/);
    expect(el.className).toContain("text-amber-600");
  });

  it("applies text-zinc-500 when under 80%", async () => {
    await renderCounter({ text: "hello", max: 100 });
    const el = screen.getByText(/chars/);
    expect(el.className).toContain("text-zinc-500");
  });
});
```

- [ ] **Step 6: Run the test to confirm it fails**

```bash
npm test -- src/components/__tests__/CharCounter.test.tsx 2>&1 | tail -5
```

Expected: FAIL — `CharCounter` module not found.

- [ ] **Step 7: Create CharCounter.tsx**

```tsx
interface CharCounterProps {
  text: string;
  max: number;
}

export function CharCounter({ text, max }: CharCounterProps) {
  const count = text.length;
  const ratio = count / max;
  const colour =
    ratio > 1
      ? "text-red-600 dark:text-red-400 font-semibold"
      : ratio > 0.95
        ? "text-red-600 dark:text-red-400"
        : ratio > 0.8
          ? "text-amber-600 dark:text-amber-400"
          : "text-zinc-500";

  return (
    <span className={`text-xs ${colour}`}>
      {count} / {max} chars{count > max ? " (over limit)" : ""}
    </span>
  );
}
```

- [ ] **Step 8: Run the test to confirm it passes**

```bash
npm test -- src/components/__tests__/CharCounter.test.tsx 2>&1 | tail -5
```

Expected: all 6 tests PASS.

- [ ] **Step 9: Update FormField.tsx**

Remove lines 33–76 from `FormField.tsx` (the `wordCount` function, `WordCounter` function, and `CharCounter` function). Replace them with these two imports, inserted after the existing imports at the top of the file:

```tsx
import { WordCounter, wordCount } from "./WordCounter";
import { CharCounter } from "./CharCounter";
```

Note: `wordCount` is also exported from `WordCounter.tsx` in case `FormField` uses it elsewhere. If the build passes without importing `wordCount`, remove it from the import.

- [ ] **Step 10: Verify build passes**

```bash
npm run build 2>&1 | tail -5
```

Expected: no TypeScript errors.

- [ ] **Step 11: Run all tests**

```bash
npm test 2>&1 | tail -5
```

Expected: all tests pass.

- [ ] **Step 12: Commit**

```bash
git add src/components/WordCounter.tsx \
        src/components/CharCounter.tsx \
        src/components/__tests__/WordCounter.test.tsx \
        src/components/__tests__/CharCounter.test.tsx \
        src/components/FormField.tsx
git commit -m "refactor: extract WordCounter and CharCounter from FormField"
```

---

## Task 4: QuestionsPreview and CriteriaPreview Item Extractions

**Files:**
- Create: `src/components/questions/SortableQuestionCard.tsx`
- Create: `src/components/criteria/SortableCriterionCard.tsx`
- Modify: `src/components/QuestionsPreview.tsx`
- Modify: `src/components/CriteriaPreview.tsx`

`SortableQuestionCard` is currently a private function at the bottom of `QuestionsPreview.tsx` (lines 182–470). It uses `useState`, `useSortable`, `CSS`, `GripIcon`, and the `Question` type. It needs `"use client"` because of `useState`.

`SortableCriterionCard` is currently a private function at the bottom of `CriteriaPreview.tsx` (lines 135–264). It uses `useSortable`, `CSS`, `GripIcon`, and the `Criterion` type. No hooks of its own, but `useSortable` is a hook.

- [ ] **Step 1: Create SortableQuestionCard.tsx**

```tsx
"use client";

import { useState } from "react";
import { GripIcon } from "@/components/icons/GripIcon";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Question } from "@/lib/schemas/criteria";

const FIELD_TYPE_LABELS: Record<string, string> = {
  text_long: "Long text",
  text_short: "Short text",
  dropdown: "Dropdown",
  radio: "Radio buttons",
  checkbox: "Checkboxes",
  radio_other: "Radio (with Other)",
  checkbox_other: "Checkboxes (with Other)",
  email: "Email address",
  url: "Website / URL",
  phone: "Phone number",
  number: "Number / Amount",
  date: "Date",
  time: "Time",
};

const FIELD_TYPES = ["text_long", "text_short", "dropdown", "radio", "checkbox", "radio_other", "checkbox_other", "email", "url", "phone", "number", "date", "time"] as const;

interface SortableQuestionCardProps {
  question: Question;
  index: number;
  canRemove: boolean;
  onUpdate: (updates: Partial<Question>) => void;
  onRemove: () => void;
}

export function SortableQuestionCard({
  question,
  index,
  canRemove,
  onUpdate,
  onRemove,
}: SortableQuestionCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: question.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const fieldType = question.field_type ?? "text_long";
  const hasOptions = fieldType === "dropdown" || fieldType === "radio" || fieldType === "checkbox" || fieldType === "radio_other" || fieldType === "checkbox_other";
  const isSelectionType = hasOptions;
  const isSingleValueType = fieldType === "email" || fieldType === "url" || fieldType === "phone" || fieldType === "number" || fieldType === "date" || fieldType === "time";
  const showWordCount = !isSelectionType && !isSingleValueType;
  const showCharCount = !isSelectionType && !isSingleValueType;
  const [newOption, setNewOption] = useState("");

  const handleFieldTypeChange = (newType: string) => {
    const updates: Partial<Question> = { field_type: newType as Question["field_type"] };
    const newIsSelection = newType === "dropdown" || newType === "radio" || newType === "checkbox" || newType === "radio_other" || newType === "checkbox_other";
    const newIsSingleValue = newType === "email" || newType === "url" || newType === "phone" || newType === "number" || newType === "date" || newType === "time";
    if (!newIsSelection) {
      updates.options = undefined;
    }
    if (newIsSelection && !question.options?.length) {
      updates.options = [];
    }
    if (newIsSelection || newIsSingleValue) {
      updates.word_count_min = undefined;
      updates.word_count_max = undefined;
    }
    if (newIsSelection || newIsSingleValue) {
      updates.char_count_max = undefined;
    }
    onUpdate(updates);
  };

  const addOption = () => {
    if (!newOption.trim()) return;
    onUpdate({ options: [...(question.options ?? []), newOption.trim()] });
    setNewOption("");
  };

  const removeOption = (optIndex: number) => {
    onUpdate({ options: (question.options ?? []).filter((_, i) => i !== optIndex) });
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
    >
      <div className="flex items-start gap-3">
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="mt-1.5 cursor-grab touch-none text-zinc-300 hover:text-zinc-500 active:cursor-grabbing dark:text-zinc-600 dark:hover:text-zinc-400"
          aria-label="Drag to reorder"
        >
          <GripIcon />
        </button>

        <span className="mt-1.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-purple-100 text-xs font-bold text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
          {index + 1}
        </span>
        <div className="flex-1 space-y-2">
          <textarea
            value={question.question}
            onChange={(e) => onUpdate({ question: e.target.value })}
            placeholder="Question text"
            rows={2}
            className="block w-full rounded-lg border border-zinc-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
          />

          <div className="flex flex-wrap items-center gap-3">
            <label className="text-xs text-zinc-500">Type:</label>
            <select
              value={fieldType}
              onChange={(e) => handleFieldTypeChange(e.target.value)}
              className="rounded border border-zinc-300 px-2 py-1 text-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            >
              {FIELD_TYPES.map((ft) => (
                <option key={ft} value={ft}>
                  {FIELD_TYPE_LABELS[ft]}
                </option>
              ))}
            </select>

            {showWordCount && (
              <>
                <span className="mx-1 text-zinc-300 dark:text-zinc-700">|</span>
                <label className="text-xs text-zinc-500">Words:</label>
                <input
                  type="number"
                  value={question.word_count_min ?? ""}
                  onChange={(e) =>
                    onUpdate({
                      word_count_min: e.target.value ? parseInt(e.target.value, 10) : undefined,
                    })
                  }
                  placeholder="Min"
                  title={question.word_count_min !== undefined && question.word_count_min < 1 ? "Must be greater than 0" : ""}
                  className={`w-20 rounded border px-2 py-1 text-xs focus:outline-none focus:ring-1 dark:bg-zinc-800 dark:text-zinc-100 ${
                    question.word_count_min !== undefined && question.word_count_min < 1
                      ? "border-red-400 focus:border-red-500 focus:ring-red-500 dark:border-red-600"
                      : "border-zinc-300 focus:border-blue-500 focus:ring-blue-500 dark:border-zinc-700"
                  }`}
                />
                <span className="text-xs text-zinc-400">to</span>
                <input
                  type="number"
                  value={question.word_count_max ?? ""}
                  onChange={(e) =>
                    onUpdate({
                      word_count_max: e.target.value ? parseInt(e.target.value, 10) : undefined,
                    })
                  }
                  placeholder="Max"
                  title={question.word_count_max !== undefined && question.word_count_max < 1 ? "Must be greater than 0" : ""}
                  className={`w-20 rounded border px-2 py-1 text-xs focus:outline-none focus:ring-1 dark:bg-zinc-800 dark:text-zinc-100 ${
                    question.word_count_max !== undefined && question.word_count_max < 1
                      ? "border-red-400 focus:border-red-500 focus:ring-red-500 dark:border-red-600"
                      : "border-zinc-300 focus:border-blue-500 focus:ring-blue-500 dark:border-zinc-700"
                  }`}
                />
              </>
            )}

            {showCharCount && (
              <>
                <span className="mx-1 text-zinc-300 dark:text-zinc-700">|</span>
                <label className="text-xs text-zinc-500">Chars:</label>
                <input
                  type="number"
                  value={question.char_count_max ?? ""}
                  onChange={(e) =>
                    onUpdate({
                      char_count_max: e.target.value ? parseInt(e.target.value, 10) : undefined,
                    })
                  }
                  placeholder="Max"
                  title={question.char_count_max !== undefined && question.char_count_max < 1 ? "Must be greater than 0" : ""}
                  className={`w-20 rounded border px-2 py-1 text-xs focus:outline-none focus:ring-1 dark:bg-zinc-800 dark:text-zinc-100 ${
                    question.char_count_max !== undefined && question.char_count_max < 1
                      ? "border-red-400 focus:border-red-500 focus:ring-red-500 dark:border-red-600"
                      : "border-zinc-300 focus:border-blue-500 focus:ring-blue-500 dark:border-zinc-700"
                  }`}
                />
              </>
            )}

            <span className="mx-1 text-zinc-300 dark:text-zinc-700">|</span>
            <label className="text-xs text-zinc-500">Priority:</label>
            <select
              value={question.priority ?? ""}
              onChange={(e) =>
                onUpdate({
                  priority: e.target.value ? parseInt(e.target.value, 10) : undefined,
                })
              }
              className="rounded border border-zinc-300 px-2 py-1 text-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            >
              <option value="">—</option>
              <option value="1">1 (Low)</option>
              <option value="2">2</option>
              <option value="3">3</option>
              <option value="4">4</option>
              <option value="5">5 (High)</option>
            </select>
          </div>

          {hasOptions && (
            <div className="rounded border border-zinc-100 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-800/50">
              <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                Options
              </label>
              {(question.options ?? []).length > 0 && (
                <div className="mt-1.5 space-y-1">
                  {(question.options ?? []).map((opt, oi) => (
                    <div key={oi} className="flex items-center gap-2">
                      <span className="flex-1 rounded border border-zinc-200 bg-white px-2 py-1 text-xs dark:border-zinc-600 dark:bg-zinc-800">
                        {opt}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeOption(oi)}
                        className="text-xs text-zinc-400 hover:text-red-500"
                      >
                        &times;
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="text"
                  value={newOption}
                  onChange={(e) => setNewOption(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addOption();
                    }
                  }}
                  placeholder="Add an option..."
                  className="flex-1 rounded border border-zinc-300 px-2 py-1 text-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                />
                <button
                  type="button"
                  onClick={addOption}
                  disabled={!newOption.trim()}
                  className="rounded bg-zinc-200 px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-300 disabled:opacity-50 dark:bg-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-600"
                >
                  Add
                </button>
              </div>
            </div>
          )}
          {(fieldType === "radio_other" || fieldType === "checkbox_other") && (
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              An &ldquo;Other (please specify)&rdquo; option will be appended automatically.
            </p>
          )}

          {question.guidance !== undefined && (
            <div>
              <label className="text-xs text-zinc-500">Guidance:</label>
              <textarea
                value={question.guidance ?? ""}
                onChange={(e) =>
                  onUpdate({ guidance: e.target.value || undefined })
                }
                rows={2}
                placeholder="Funder guidance for this question"
                className="mt-1 block w-full rounded border border-zinc-200 px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              />
            </div>
          )}

          {question.guidance === undefined && (
            <button
              type="button"
              onClick={() => onUpdate({ guidance: "" })}
              className="text-xs text-zinc-500 hover:text-blue-600 dark:hover:text-blue-400"
            >
              + Add guidance
            </button>
          )}
        </div>
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="text-xs text-zinc-400 hover:text-red-500"
          >
            Remove
          </button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Update QuestionsPreview.tsx**

Add this import after the existing imports:

```tsx
import { SortableQuestionCard } from "./questions/SortableQuestionCard";
```

Delete the `FIELD_TYPE_LABELS`, `FIELD_TYPES` constants (lines 27–43) and the entire `SortableQuestionCard` function (lines 182–470) from `QuestionsPreview.tsx`. The `SortableContext` loop now references the imported component, which is unchanged in usage.

- [ ] **Step 3: Create SortableCriterionCard.tsx**

```tsx
"use client";

import { GripIcon } from "@/components/icons/GripIcon";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Criterion } from "@/lib/schemas/criteria";

interface SortableCriterionCardProps {
  criterion: Criterion;
  index: number;
  canRemove: boolean;
  onUpdate: (updates: Partial<Criterion>) => void;
  onRemove: () => void;
  onAddSubQuestion: () => void;
  onUpdateSubQuestion: (sqIndex: number, value: string) => void;
  onToggleSubQuestionRequired: (sqIndex: number) => void;
  onRemoveSubQuestion: (sqIndex: number) => void;
}

export function SortableCriterionCard({
  criterion,
  index,
  canRemove,
  onUpdate,
  onRemove,
  onAddSubQuestion,
  onUpdateSubQuestion,
  onToggleSubQuestionRequired,
  onRemoveSubQuestion,
}: SortableCriterionCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: criterion.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
    >
      <div className="flex items-start gap-3">
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="mt-1.5 cursor-grab touch-none text-zinc-300 hover:text-zinc-500 active:cursor-grabbing dark:text-zinc-600 dark:hover:text-zinc-400"
          aria-label="Drag to reorder"
        >
          <GripIcon />
        </button>

        <span className="mt-1.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
          {index + 1}
        </span>
        <div className="flex-1 space-y-2">
          <input
            type="text"
            value={criterion.criterion}
            onChange={(e) => onUpdate({ criterion: e.target.value })}
            placeholder="Criterion name"
            className="block w-full rounded-lg border border-zinc-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
          />
          <div className="flex items-center gap-2">
            <label className="text-xs text-zinc-500">Weight:</label>
            <input
              type="text"
              value={criterion.weight ?? ""}
              onChange={(e) => onUpdate({ weight: e.target.value || undefined })}
              placeholder="e.g. 25%"
              className="w-20 rounded border border-zinc-300 px-2 py-1 text-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            />
          </div>

          {criterion.sub_questions.length > 0 && (
            <div className="space-y-1.5 pl-2">
              <p className="text-xs font-medium text-zinc-500">Sub-questions:</p>
              {criterion.sub_questions.map((sq, sqi) => {
                const sqText = typeof sq === "string" ? sq : sq.text;
                const sqRequired = typeof sq === "string" ? true : sq.required;
                return (
                  <div key={sqi} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={sqText}
                      onChange={(e) => onUpdateSubQuestion(sqi, e.target.value)}
                      className="flex-1 rounded border border-zinc-200 px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                    />
                    <button
                      type="button"
                      onClick={() => onToggleSubQuestionRequired(sqi)}
                      className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${
                        sqRequired
                          ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                          : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                      }`}
                    >
                      {sqRequired ? "Required" : "Optional"}
                    </button>
                    <button
                      type="button"
                      onClick={() => onRemoveSubQuestion(sqi)}
                      className="text-xs text-zinc-400 hover:text-red-500"
                    >
                      Remove
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          <button
            type="button"
            onClick={onAddSubQuestion}
            className="text-xs text-zinc-500 hover:text-blue-600 dark:hover:text-blue-400"
          >
            + Add sub-question
          </button>
        </div>
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="text-xs text-zinc-400 hover:text-red-500"
          >
            Remove
          </button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Update CriteriaPreview.tsx**

Add this import after the existing imports:

```tsx
import { SortableCriterionCard } from "./criteria/SortableCriterionCard";
```

Delete the entire `SortableCriterionCard` function (lines 135–264) from `CriteriaPreview.tsx`.

- [ ] **Step 5: Verify build passes**

```bash
npm run build 2>&1 | tail -5
```

Expected: no TypeScript errors.

- [ ] **Step 6: Run all tests**

```bash
npm test 2>&1 | tail -5
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/components/questions/SortableQuestionCard.tsx \
        src/components/criteria/SortableCriterionCard.tsx \
        src/components/QuestionsPreview.tsx \
        src/components/CriteriaPreview.tsx
git commit -m "refactor: extract SortableQuestionCard and SortableCriterionCard"
```

---

## Task 5: FundDetection Search Results Extraction

**Files:**
- Create: `src/components/funds/FundSearchResults.tsx`
- Modify: `src/components/FundDetection.tsx`

The `searchResults.length > 0` block in `FundDetection.tsx` (lines 194–210) renders a list of fund buttons. `FundSearchResults` wraps this cleanly.

- [ ] **Step 1: Create FundSearchResults.tsx**

```tsx
interface Fund {
  id: string;
  name: string;
  organisation: { id: string; name: string } | null;
}

interface FundSearchResultsProps {
  results: Fund[];
  onSelect: (fund: Fund) => void;
}

export function FundSearchResults({ results, onSelect }: FundSearchResultsProps) {
  if (results.length === 0) return null;
  return (
    <div className="mt-2 space-y-2">
      {results.map((fund) => (
        <button
          key={fund.id}
          onClick={() => onSelect(fund)}
          className="w-full rounded-lg border border-zinc-200 p-3 text-left transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          <p className="text-sm font-medium">{fund.name}</p>
          {fund.organisation && (
            <p className="text-xs text-zinc-500">{fund.organisation.name}</p>
          )}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Update FundDetection.tsx**

Add this import after the existing imports:

```tsx
import { FundSearchResults } from "./funds/FundSearchResults";
```

Replace the `{searchResults.length > 0 && (...)}` block inside the search card with:

```tsx
        <FundSearchResults results={searchResults} onSelect={onFundSelected} />
```

The full search card section becomes:

```tsx
      {/* Search existing funds */}
      <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Search for an existing fund
        </label>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="Type fund name..."
          className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800"
        />

        {searching && (
          <p className="mt-2 text-xs text-zinc-500">Searching...</p>
        )}

        <FundSearchResults results={searchResults} onSelect={onFundSelected} />
      </div>
```

- [ ] **Step 3: Verify build passes**

```bash
npm run build 2>&1 | tail -5
```

Expected: no TypeScript errors.

- [ ] **Step 4: Run all tests**

```bash
npm test 2>&1 | tail -5
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/funds/FundSearchResults.tsx \
        src/components/FundDetection.tsx
git commit -m "refactor: extract FundSearchResults from FundDetection"
```

---

## Task 6: Admin Fund Detail Page Card Extractions

**Files:**
- Create: `src/app/(dashboard)/admin/orgs/[orgId]/funds/[fundId]/components/CriteriaSetCard.tsx`
- Create: `src/app/(dashboard)/admin/orgs/[orgId]/funds/[fundId]/components/QuestionsSetCard.tsx`
- Modify: `src/app/(dashboard)/admin/orgs/[orgId]/funds/[fundId]/page.tsx`

The page currently has `CriteriaSetCard` and `QuestionsSetCard` as local functions (lines 41–96). Both are server components (no `"use client"`). Both use `formatDate` from `../../../../lib/format` (which resolves to `src/app/(dashboard)/admin/lib/format.ts`). From the new `components/` subdirectory the relative path becomes `../../../../../lib/format`. Both use a `countJson` helper — each card file will include it inline to avoid cross-file coupling.

- [ ] **Step 1: Create the components directory**

```bash
mkdir -p "src/app/(dashboard)/admin/orgs/[orgId]/funds/[fundId]/components"
```

- [ ] **Step 2: Create CriteriaSetCard.tsx**

```tsx
import Link from "next/link";
import { formatDate } from "../../../../../lib/format";
import type { Json } from "@/types/database";

function countJson(json: Json): number {
  if (Array.isArray(json)) return json.length;
  if (json && typeof json === "object") {
    const obj = json as Record<string, unknown>;
    if (Array.isArray(obj.criteria)) return obj.criteria.length;
    if (Array.isArray(obj.questions)) return obj.questions.length;
  }
  return 0;
}

export interface CriteriaSetRow {
  id: string;
  name: string;
  label: string | null;
  description: string | null;
  criteria_json: Json;
  approved: boolean;
  created_at: string;
}

export function CriteriaSetCard({ cs, orgId, fundId }: { cs: CriteriaSetRow; orgId: string; fundId: string }) {
  return (
    <Link
      href={`/admin/orgs/${orgId}/funds/${fundId}/sets/${cs.id}`}
      className="block bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg p-3 hover:bg-zinc-50 dark:hover:bg-zinc-750"
    >
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
          {cs.name || cs.label || "Untitled"}
        </span>
        <span className="text-xs text-zinc-500">
          {countJson(cs.criteria_json)} criteria
        </span>
        <span className={`text-xs px-2 py-0.5 rounded-full ${
          cs.approved
            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300"
            : "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
        }`}>
          {cs.approved ? "approved" : "pending"}
        </span>
      </div>
      <p className="text-xs text-zinc-400 mt-0.5">{formatDate(cs.created_at)}</p>
    </Link>
  );
}
```

- [ ] **Step 3: Create QuestionsSetCard.tsx**

```tsx
import Link from "next/link";
import { formatDate } from "../../../../../lib/format";
import type { Json } from "@/types/database";

function countJson(json: Json): number {
  if (Array.isArray(json)) return json.length;
  if (json && typeof json === "object") {
    const obj = json as Record<string, unknown>;
    if (Array.isArray(obj.criteria)) return obj.criteria.length;
    if (Array.isArray(obj.questions)) return obj.questions.length;
  }
  return 0;
}

export interface QuestionsSetRow {
  id: string;
  label: string | null;
  questions_json: Json;
  overall_word_limit: number | null;
  approved: boolean;
  created_at: string;
}

export function QuestionsSetCard({ qs, orgId, fundId }: { qs: QuestionsSetRow; orgId: string; fundId: string }) {
  return (
    <Link
      href={`/admin/orgs/${orgId}/funds/${fundId}/sets/${qs.id}`}
      className="block bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg p-3 hover:bg-zinc-50 dark:hover:bg-zinc-750"
    >
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
          {qs.label || "Untitled"}
        </span>
        <span className="text-xs text-zinc-500">
          {countJson(qs.questions_json)} questions
        </span>
        {qs.overall_word_limit && (
          <span className="text-xs text-zinc-500">
            ({qs.overall_word_limit} word limit)
          </span>
        )}
        <span className={`text-xs px-2 py-0.5 rounded-full ${
          qs.approved
            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300"
            : "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
        }`}>
          {qs.approved ? "approved" : "pending"}
        </span>
      </div>
      <p className="text-xs text-zinc-400 mt-0.5">{formatDate(qs.created_at)}</p>
    </Link>
  );
}
```

- [ ] **Step 4: Update page.tsx**

Replace the local `CriteriaSetRow`, `QuestionsSetRow` interface definitions and `CriteriaSetCard`, `QuestionsSetCard`, `countJson` function definitions (lines 12–96) with these imports:

```tsx
import { CriteriaSetCard } from "./components/CriteriaSetCard";
import { QuestionsSetCard } from "./components/QuestionsSetCard";
import type { CriteriaSetRow } from "./components/CriteriaSetCard";
import type { QuestionsSetRow } from "./components/QuestionsSetCard";
```

Also remove the `import type { Json } from "@/types/database"` line from the page (it's no longer needed there — now used inside the card files).

- [ ] **Step 5: Verify build passes**

```bash
npm run build 2>&1 | tail -5
```

Expected: no TypeScript errors.

- [ ] **Step 6: Run all tests**

```bash
npm test 2>&1 | tail -5
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(dashboard)/admin/orgs/[orgId]/funds/[fundId]/components/CriteriaSetCard.tsx" \
        "src/app/(dashboard)/admin/orgs/[orgId]/funds/[fundId]/components/QuestionsSetCard.tsx" \
        "src/app/(dashboard)/admin/orgs/[orgId]/funds/[fundId]/page.tsx"
git commit -m "refactor: extract CriteriaSetCard and QuestionsSetCard to components subfolder"
```

---

## Task 7: OAuthButtons Extraction

**Files:**
- Create: `src/components/OAuthButtons.tsx`
- Modify: `src/app/(auth)/login/page.tsx`
- Modify: `src/app/(auth)/signup/page.tsx`

Both auth pages contain identical Google OAuth button markup (lines 86–109 in login, lines 116–139 in signup). They differ only in the options passed to `signInWithOAuth`:
- Login passes: `redirectTo: ${origin}/auth/callback?redirect=${redirect}`
- Signup passes: `redirectTo: ${origin}/auth/callback` + `queryParams: isBeta ? { is_beta: "true" } : undefined`

`OAuthButtons` accepts `redirectTo` and optional `queryParams` and owns the Supabase call internally. Errors are surfaced via `onError` callback.

- [ ] **Step 1: Create OAuthButtons.tsx**

```tsx
"use client";

import { createClient } from "@/lib/supabase/client";

interface OAuthButtonsProps {
  redirectTo: string;
  queryParams?: Record<string, string>;
  onError: (message: string) => void;
}

export function OAuthButtons({ redirectTo, queryParams, onError }: OAuthButtonsProps) {
  const supabase = createClient();

  async function handleGoogleAuth() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
        queryParams,
      },
    });
    if (error) onError(error.message);
  }

  return (
    <button
      onClick={handleGoogleAuth}
      className="flex w-full items-center justify-center gap-2 rounded-lg border border-zinc-300 px-4 py-2.5 text-sm font-medium transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
    >
      <svg className="h-5 w-5" viewBox="0 0 24 24">
        <path
          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
          fill="#4285F4"
        />
        <path
          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
          fill="#34A853"
        />
        <path
          d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
          fill="#FBBC05"
        />
        <path
          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
          fill="#EA4335"
        />
      </svg>
      Continue with Google
    </button>
  );
}
```

- [ ] **Step 2: Update login/page.tsx**

Add the import after the existing imports:

```tsx
import { OAuthButtons } from "@/components/OAuthButtons";
```

Remove the `handleGoogleLogin` function (lines 48–56).

Replace the `<button onClick={handleGoogleLogin} ...>` block (lines 86–109) with:

```tsx
        <OAuthButtons
          redirectTo={`${window.location.origin}/auth/callback?redirect=${redirect}`}
          onError={setError}
        />
```

- [ ] **Step 3: Update signup/page.tsx**

Add the import after the existing imports:

```tsx
import { OAuthButtons } from "@/components/OAuthButtons";
```

Remove the `handleGoogleSignup` function (lines 61–70).

Replace the `<button onClick={handleGoogleSignup} ...>` block (lines 116–139) with:

```tsx
        <OAuthButtons
          redirectTo={`${window.location.origin}/auth/callback`}
          queryParams={isBeta ? { is_beta: "true" } : undefined}
          onError={setError}
        />
```

- [ ] **Step 4: Verify build passes**

```bash
npm run build 2>&1 | tail -5
```

Expected: no TypeScript errors.

- [ ] **Step 5: Run all tests**

```bash
npm test 2>&1 | tail -5
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/components/OAuthButtons.tsx \
        "src/app/(auth)/login/page.tsx" \
        "src/app/(auth)/signup/page.tsx"
git commit -m "refactor: extract OAuthButtons shared component from login and signup"
```

---

## Task 8: Final Verification

- [ ] **Step 1: Run the full test suite**

```bash
npm test 2>&1 | tail -20
```

Expected: all tests pass. Note the total count — it should be higher than before this branch (new tests added in Tasks 2 and 3).

- [ ] **Step 2: Run a production build**

```bash
npm run build 2>&1 | tail -10
```

Expected: `✓ Compiled successfully` with no TypeScript errors and no missing module errors.

- [ ] **Step 3: Confirm git log looks clean**

```bash
git log --oneline -8
```

Expected output (7 extraction commits + original):
```
<hash> refactor: extract OAuthButtons shared component from login and signup
<hash> refactor: extract CriteriaSetCard and QuestionsSetCard to components subfolder
<hash> refactor: extract FundSearchResults from FundDetection
<hash> refactor: extract SortableQuestionCard and SortableCriterionCard
<hash> refactor: extract WordCounter and CharCounter from FormField
<hash> refactor: extract ReviewFailed and ReviewProgress from ApplicationReviewClient
<hash> refactor: add ReviewCard shared primitive
...
```
