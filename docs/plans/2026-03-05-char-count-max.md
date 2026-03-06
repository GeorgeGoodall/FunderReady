# char_count_max Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add `char_count_max` to questions, replacing the existing `char_limit` field, with AI parser detection and manual editing support.

**Architecture:** Promote `char_count_max` from `ExtendedQuestionSchema` into `QuestionSchema` so it's stored in `questions_sets.questions_json`. Rename all `char_limit` references to `char_count_max`. Update the AI parser prompt to detect character limits. Add char limit editing to `QuestionsPreview`. Add colour-coded char counter in `FormField`.

**Tech Stack:** TypeScript, Zod, Next.js, React, Tailwind CSS, Vitest

---

### Task 1: Schema — Add `char_count_max` to `QuestionSchema` and update `ExtendedQuestionSchema`

**Files:**
- Modify: `src/lib/schemas/criteria.ts:46-55` (QuestionSchema)
- Modify: `src/lib/schemas/criteria.ts:122-148` (ExtendedQuestionSchema comment + remove char_limit)
- Modify: `src/lib/schemas/__tests__/criteria.test.ts:234-311` (ExtendedQuestionSchema tests)

**Step 1: Update the test — rename `char_limit` → `char_count_max` in ExtendedQuestionSchema tests, add QuestionSchema char_count_max tests**

In `src/lib/schemas/__tests__/criteria.test.ts`:

Add a new test block after the existing QuestionSchema-related tests (or within the ExtendedQuestionSchema describe block). The key changes:

1. In the `ExtendedQuestionSchema` describe block, line 243: change `char_limit: 3000` → `char_count_max: 3000`
2. Line 303-310: rename test from `"rejects non-positive char_limit"` to `"rejects non-positive char_count_max"` and change `char_limit: 0` → `char_count_max: 0`
3. Add a new test to verify `QuestionSchema` accepts `char_count_max`:

```typescript
// Add inside a new describe block or near the existing QuestionSchema-related tests
it("accepts a question with char_count_max", () => {
  const result = QuestionSchema.safeParse({
    id: "q1",
    question: "Describe your project",
    char_count_max: 3000,
  });
  expect(result.success).toBe(true);
});

it("rejects non-positive char_count_max on QuestionSchema", () => {
  const result = QuestionSchema.safeParse({
    id: "q1",
    question: "Test",
    char_count_max: 0,
  });
  expect(result.success).toBe(false);
});
```

Also add `QuestionSchema` to the import on line 2-12.

**Step 2: Run tests to verify they fail**

Run: `cd app && npx vitest run src/lib/schemas/__tests__/criteria.test.ts`
Expected: FAIL — `QuestionSchema` doesn't have `char_count_max`, `ExtendedQuestionSchema` doesn't have `char_count_max` (only `char_limit`)

**Step 3: Update the schemas**

In `src/lib/schemas/criteria.ts`:

1. Add `char_count_max` to `QuestionSchema` (after line 52):
```typescript
export const QuestionSchema = z.object({
  id: z.string().min(1),
  question: z.string().min(1),
  word_count_min: z.number().int().positive().optional(),
  word_count_max: z.number().int().positive().optional(),
  char_count_max: z.number().int().positive().optional(),
  guidance: z.string().optional(),
  priority: z.number().int().min(1).max(5).optional(),
  field_type: z.enum(["text_short", "text_long", "dropdown", "radio", "checkbox", "email", "url", "phone", "number"]).optional(),
  options: z.array(z.string()).optional(),
});
```

2. Update the comment on line 123 from `char_limit` to `char_count_max`:
```typescript
// Extended Question — adds field_type, options, required, section (char_count_max inherited from QuestionSchema)
```

3. Remove `char_limit` from `ExtendedQuestionSchema` (line 145) — it now inherits `char_count_max` from `QuestionSchema`:
```typescript
export const ExtendedQuestionSchema = QuestionSchema.extend({
  field_type: FieldTypeSchema.default("text_long"),
  options: z.array(z.string()).optional(),
  required: z.boolean().default(true),
  section: z.string().optional(),
});
```

**Step 4: Run tests to verify they pass**

Run: `cd app && npx vitest run src/lib/schemas/__tests__/criteria.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/schemas/criteria.ts src/lib/schemas/__tests__/criteria.test.ts
git commit -m "feat: add char_count_max to QuestionSchema, rename from char_limit"
```

---

### Task 2: Update FormField — rename `char_limit` → `char_count_max`, add colour-coded char counter

**Files:**
- Modify: `src/components/FormField.tsx:5-16` (Question interface)
- Modify: `src/components/FormField.tsx:34-54` (WordCounter)
- Modify: `src/components/FormField.tsx:117-177` (maxLength references)
- Modify: `src/components/FormField.tsx:243-257` (counter display)

**Step 1: Update FormField**

In `src/components/FormField.tsx`:

1. Line 13: rename `char_limit?: number` → `char_count_max?: number` in the Question interface

2. Lines 123, 176: change `maxLength={question.char_limit}` → `maxLength={question.char_count_max}`

3. Replace the char counter section (lines 251-255) with a colour-coded `CharCounter` component. Add this component after the `WordCounter` component (around line 54):

```typescript
function CharCounter({ text, max }: { text: string; max: number }) {
  const count = text.length;
  const ratio = count / max;
  const colour =
    ratio > 0.95
      ? "text-red-600 dark:text-red-400"
      : ratio > 0.8
        ? "text-amber-600 dark:text-amber-400"
        : "text-zinc-500";

  return (
    <span className={`text-xs ${colour}`}>
      {count} / {max} chars
    </span>
  );
}
```

4. Replace lines 251-255 (the old char counter) with:
```typescript
{question.char_count_max && (
  <CharCounter text={value} max={question.char_count_max} />
)}
```

**Step 2: Run build to verify no type errors**

Run: `cd app && npx tsc --noEmit`
Expected: Type errors in `ApplicationFormClient.tsx` and `useMarkdownImportExport.ts` (they still use `char_limit`) — this is expected, we'll fix those next.

**Step 3: Commit**

```bash
git add src/components/FormField.tsx
git commit -m "feat: rename char_limit to char_count_max in FormField, add colour-coded char counter"
```

---

### Task 3: Update ApplicationFormClient and useMarkdownImportExport — rename `char_limit` → `char_count_max`

**Files:**
- Modify: `src/app/(dashboard)/applications/[id]/ApplicationFormClient.tsx:26`
- Modify: `src/app/(dashboard)/applications/[id]/hooks/useMarkdownImportExport.ts:15`

**Step 1: Rename in both files**

In `ApplicationFormClient.tsx` line 26: change `char_limit?: number` → `char_count_max?: number`

In `useMarkdownImportExport.ts` line 15: change `char_limit?: number` → `char_count_max?: number`

**Step 2: Run build to verify no type errors**

Run: `cd app && npx tsc --noEmit`
Expected: PASS (no type errors)

**Step 3: Commit**

```bash
git add "src/app/(dashboard)/applications/[id]/ApplicationFormClient.tsx" "src/app/(dashboard)/applications/[id]/hooks/useMarkdownImportExport.ts"
git commit -m "refactor: rename char_limit to char_count_max in ApplicationFormClient and useMarkdownImportExport"
```

---

### Task 4: Update AI parser — add character limit detection

**Files:**
- Modify: `src/lib/ai/parse-questions.ts:6-31` (SYSTEM_PROMPT)

**Step 1: Update the system prompt**

In `src/lib/ai/parse-questions.ts`, update the `SYSTEM_PROMPT`:

1. After the word count detection rule (line 14), add:
```
- Look for character limits in formats like: "max 3000 characters", "3000 character limit", "(3000 chars)", "Character limit: 3000", "maximum of 2000 characters"
- When a character limit is found, set char_count_max. A question can have both word limits AND character limits.
```

2. Update the extract line (line 8) to mention character limits:
```
Given raw text (copied from a funder's application form, question list, or guidance document), extract structured questions with word count limits, character limits, and field types.
```

3. Update line 37 (the user prompt) to mention character limits:
```typescript
prompt: `Extract structured questions, word count limits, character limits, and field types from this funder guidance:\n\n${rawText}`,
```

**Step 2: Verify the QuestionsSetSchema accepts char_count_max**

The parser uses `QuestionsSetSchema` which uses `QuestionSchema` — since Task 1 already added `char_count_max` to `QuestionSchema`, this will work automatically.

**Step 3: Commit**

```bash
git add src/lib/ai/parse-questions.ts
git commit -m "feat: add character limit detection to AI questions parser"
```

---

### Task 5: Update QuestionsPreview — add char limit input

**Files:**
- Modify: `src/components/QuestionsPreview.tsx:228-255` (field type + word count row in SortableQuestionCard)

**Step 1: Add char_count_max input to the edit row**

In `src/components/QuestionsPreview.tsx`, inside the `SortableQuestionCard` component, after the word count max input (around line 254) and before the Priority separator, add:

```tsx
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
  className="w-20 rounded border border-zinc-300 px-2 py-1 text-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
/>
```

This goes between the word count "Max" input and the Priority separator (`<span className="mx-1 ...">|</span>`).

**Step 2: Verify it renders**

Run: `cd app && npx tsc --noEmit`
Expected: PASS

**Step 3: Commit**

```bash
git add src/components/QuestionsPreview.tsx
git commit -m "feat: add char_count_max input to QuestionsPreview editor"
```

---

### Task 6: Run full test suite and verify build

**Step 1: Run all tests**

Run: `cd app && npx vitest run`
Expected: All tests pass

**Step 2: Run production build**

Run: `cd app && npm run build`
Expected: Build succeeds

**Step 3: Final commit if any fixes needed**

If any tests or build issues arise, fix and commit.
