# Component Extraction — Design Spec

**Date:** 2026-04-05
**Scope:** Full codebase component extraction sweep
**Branch strategy:** Single feature branch on a separate git worktree
**Commit strategy:** Option C — shared primitives first, then file-by-file

---

## Motivation

Several files have grown beyond a single responsibility. This spec covers a pure structural refactor — no logic changes, no API changes, no behaviour changes. The goal is to extract self-contained UI blocks into named components so that files are easier to read, modify, and test in isolation.

Files over the threshold:
- `ApplicationReviewClient.tsx` — 401 lines, 4 inline render states
- `FormField.tsx` — 433 lines, internal counter functions
- `QuestionsPreview.tsx` — 471 lines, inline per-question editor
- `CriteriaPreview.tsx` — 265 lines, inline per-criterion editor
- `FundDetection.tsx` — 229 lines, inline search results list
- Admin fund detail page — duplicate inline card patterns
- Auth login + signup pages — duplicated OAuth button group

---

## Architecture & File Layout

### New files

```
src/app/(dashboard)/applications/[id]/review/components/
  ReviewCard.tsx          ← shared status card wrapper (colour-variant shell)
  ReviewFailed.tsx        ← extracted from ApplicationReviewClient lines 137-156
  ReviewProgress.tsx      ← extracted from ApplicationReviewClient lines 158-232

src/components/
  WordCounter.tsx         ← extracted from FormField.tsx internal function
  CharCounter.tsx         ← extracted from FormField.tsx internal function
  OAuthButtons.tsx        ← shared OAuth button group (login + signup)

src/app/(dashboard)/applications/[id]/review/components/__tests__/
  ReviewProgress.test.tsx

src/components/__tests__/
  WordCounter.test.tsx
  CharCounter.test.tsx
```

Subdirectories for components collocated with their parent:
```
src/components/questions/
  QuestionItem.tsx        ← extracted from QuestionsPreview.tsx (same src/components/ dir)

src/components/criteria/
  CriterionItem.tsx       ← extracted from CriteriaPreview.tsx (same src/components/ dir)

src/components/funds/
  FundSearchResults.tsx   ← extracted from FundDetection.tsx (same src/components/ dir)

src/app/(dashboard)/admin/orgs/[orgId]/funds/[fundId]/components/
  CriteriaSetCard.tsx     ← extracted from admin fund detail page.tsx
  QuestionsSetCard.tsx    ← extracted from admin fund detail page.tsx
```

### Conventions
- PascalCase filenames, named exports (no default exports)
- TypeScript interfaces defined in the same file as the component
- Page-local components go in a `components/` subfolder next to the page
- App-wide reusable components go in `src/components/`

---

## Component Interfaces

### ReviewCard
```ts
interface ReviewCardProps {
  variant: 'error' | 'info' | 'neutral';
  children: React.ReactNode;
}
```
Renders the `rounded-lg border bg-X-50 p-6 dark:...` shell. Variant drives colour tokens. Consumers own their inner content.

### ReviewFailed
```ts
interface ReviewFailedProps {
  review: { error_message: string | null; created_at: string };
  application: { id: string };
}
```
Pure display. Renders error `ReviewCard` + "Edit & Retry" link. No state.

### ReviewProgress
```ts
interface ReviewProgressProps {
  review: { status: string; progress: unknown; created_at: string };
  application: { id: string };
  cancellingReview: boolean;
  showCancelConfirm: boolean;
  onCancel: () => void;
}
```
Cancel state remains in `ApplicationReviewClient` — `ReviewProgress` is presentation-only, receives state + callback as props. All async logic stays in the parent.

### WordCounter
```ts
interface WordCounterProps {
  text: string;
  min?: number;
  max?: number;
}
```
Extracted as-is from `FormField.tsx`. Contains colour-threshold logic: red >95% of max, amber >80%, neutral below. Returns `null` when no min or max provided.

### CharCounter
Same pattern as `WordCounter`, operating on character count instead of word count.

### QuestionItem
```ts
interface QuestionItemProps {
  question: ExtendedQuestion;
  index: number;
  onUpdate: (index: number, field: string, value: unknown) => void;
  onRemove: (index: number) => void;
  dragHandleProps?: DragHandleProps;
}
```
Isolates per-question drag wrapper + field editors. `QuestionsPreview` becomes list orchestration only.

### CriterionItem
Same pattern as `QuestionItem`, scoped to a single criterion's edit UI within `CriteriaPreview`.

### FundSearchResults
```ts
interface FundSearchResultsProps {
  results: Fund[];
  onSelect: (fund: Fund) => void;
  isLoading: boolean;
}
```
Pulled from the search results rendering block in `FundDetection`.

### CriteriaSetCard / QuestionsSetCard
Local to the admin fund detail page. Each takes its respective set object and renders the card. No shared interface needed.

### OAuthButtons
```ts
interface OAuthButtonsProps {
  redirectTo?: string;
}
```
Shared across login and signup pages. Contains Google OAuth button and any future providers.

---

## Testing

Only components with meaningful logic get tests.

### WordCounter — `src/components/__tests__/WordCounter.test.tsx`
- Returns `null` when no min or max provided
- Displays correct word count
- Applies `text-red-600` when count > 95% of max
- Applies `text-amber-600` when count > 80% of max
- Applies `text-zinc-500` below 80%

### CharCounter — `src/components/__tests__/CharCounter.test.tsx`
- Same threshold cases as WordCounter, operating on character count

### ReviewProgress — `src/app/(dashboard)/applications/[id]/review/components/__tests__/ReviewProgress.test.tsx`
- Renders correct step as "current" (pulsing dot) based on `review.status`
- Renders prior steps as "done" (green tick)
- Shows cancel button when `status === 'pending'`
- Shows disabled cancel button when status is past pending
- Passes `cancellingReview` / `showCancelConfirm` display states correctly

No tests for: `ReviewFailed` (pure markup), `ReviewCard` (pure styling), `QuestionItem`/`CriterionItem` (drag logic is framework-owned), `FundSearchResults` (list render), `OAuthButtons` (OAuth trigger is external), admin cards (pure display).

---

## Commit Sequence

### Commit 1 — Shared primitive: ReviewCard
Create `ReviewCard.tsx`. No other files touched. Establishes the colour-variant shell used by subsequent commits.

### Commit 2 — Review page state extractions
Extract `ReviewFailed` and `ReviewProgress` from `ApplicationReviewClient.tsx`. Import back in. Add `ReviewProgress.test.tsx`. `ApplicationReviewClient` shrinks from ~401 to ~230 lines.

### Commit 3 — FormField counters
Extract `WordCounter` and `CharCounter` from `FormField.tsx` into `src/components/`. Import back in `FormField`. Add `WordCounter.test.tsx` and `CharCounter.test.tsx`.

### Commit 4 — QuestionsPreview + CriteriaPreview item extraction
Extract `QuestionItem` and `CriterionItem` into local `components/` subdirectories. Parents become list-orchestration only.

### Commit 5 — FundDetection search results
Extract `FundSearchResults` from `FundDetection.tsx`. Import back in.

### Commit 6 — Admin fund detail page cards
Extract `CriteriaSetCard` and `QuestionsSetCard` into a local `components/` folder next to the admin page.

### Commit 7 — Shared OAuthButtons
Extract the OAuth button group from login and signup pages into `src/components/OAuthButtons.tsx`. Import back into both auth pages.

Each commit leaves the build passing and behaviour identical.

---

## Constraints

- No logic changes — purely structural
- No API changes
- No behaviour changes
- Build must pass after every commit
- Existing tests must continue to pass throughout
