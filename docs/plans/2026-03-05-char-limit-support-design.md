# Character Limit Support for Questions

## Summary

Add `char_count_max` to questions so funders' character limits are supported alongside existing word limits. A question can have any combination: word limits only, char limit only, both, or neither.

## Current State

- `QuestionSchema` has `word_count_min` and `word_count_max` — no char limit
- `ExtendedQuestionSchema` has `char_limit` (used in application form) — but not stored in `questions_sets`
- `FormField` already renders a char counter and applies `maxLength` when `char_limit` is set
- AI parser (`parse-questions.ts`) doesn't detect character limits
- `QuestionsPreview` (edit UI) has no char limit input

## Design

### 1. Schema Changes (`src/lib/schemas/criteria.ts`)

- Add `char_count_max: z.number().int().positive().optional()` to `QuestionSchema`
- Remove `char_limit` from `ExtendedQuestionSchema`, replace with inheritance from `QuestionSchema`
- Update `ExtendedQuestionSchema` to NOT re-declare `char_count_max` (it inherits)

### 2. AI Parser (`src/lib/ai/parse-questions.ts`)

Update system prompt to detect character limits. Add rules:
- Look for character limits in formats like: "max 3000 characters", "3000 character limit", "(3000 chars)", "Character limit: 3000"
- When a character limit is found, set `char_count_max`
- A question can have both word limits and character limits

### 3. QuestionsPreview (`src/components/QuestionsPreview.tsx`)

Add a `char_count_max` input field in the field type / word count row, after the word count inputs.

### 4. FormField (`src/components/FormField.tsx`)

- Rename `char_limit` references to `char_count_max`
- Add colour-coded warnings to the char counter (matching the word counter's red/amber/default thresholds)
- Continue showing both counters when both limits are set

### 5. Rename Migration

All references to `char_limit` become `char_count_max`:
- `ExtendedQuestionSchema` in `criteria.ts`
- `FormField.tsx` (interface + usage)
- Any existing `questions_sets` data in the DB that has `char_limit` keys will need a check — since `char_limit` was only on `ExtendedQuestionSchema` and not stored in `questions_sets`, no DB migration is needed

## Files to Change

1. `src/lib/schemas/criteria.ts` — add `char_count_max` to `QuestionSchema`, update `ExtendedQuestionSchema`
2. `src/lib/ai/parse-questions.ts` — update system prompt
3. `src/components/QuestionsPreview.tsx` — add char limit input
4. `src/components/FormField.tsx` — rename `char_limit` → `char_count_max`, add colour warnings
5. Tests for any of the above
