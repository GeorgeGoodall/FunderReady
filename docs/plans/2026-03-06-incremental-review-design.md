# Incremental Review Optimisation — Design

## Goal

Reduce Anthropic token spend on re-reviews by reusing previous answer analyses for unchanged answers. Users still consume 1 review credit. The review output is identical regardless of whether analyses were reused or fresh.

## Approach

Pipeline-level reuse within the existing `answer-analyses` Inngest step. No new steps, no schema changes, no DB migrations, no API changes, no UI changes.

## Reuse Decision Logic

An answer analysis is reusable when ALL of:
1. A previous completed review exists for this application
2. The previous review's `criteria_set_id` matches the current application's `criteria_set_id`
3. The answer text is unchanged (`answerChanges[question_id] === false`)
4. The previous review's `results.answer_feedback[question_id]` exists and passes `AnswerAnalysisSchema` validation

If the criteria set changed between reviews, all answers are re-analysed regardless of text changes.

## Data Flow Changes

### load-application step

- Load `criteria_set_id` from the previous review record (already available on `application_reviews`)
- Compare against current `app.criteria_set_id` to determine `criteriaSetMatch: boolean`
- When `criteriaSetMatch` is true, pass full `answer_feedback` from previous results as `reusableAnalyses: Record<string, AnswerAnalysis>`
- Continue passing the existing trimmed `previousReview` for feedback evolution prompts on fresh analyses

### answer-analyses step

- If `reusableAnalyses` is available, split `answerContexts` into:
  - **reusable:** `answerChanges[qId] === false` AND `reusableAnalyses[qId]` exists and validates
  - **fresh:** everything else
- Call Claude only for fresh answers (same batched/retry logic)
- Merge reused + fresh into a single `analyses` array
- Only fresh analyses generate `stepUsage` entries

### Cross-reference and scoring steps

No changes. They consume the `answerAnalyses` array regardless of source.

### save-results step

No changes. Token/cost aggregates naturally reflect reduced spend. The `answer_snapshot` still captures current answer text for all enabled answers.

## Edge Cases

- **First review:** No previous review → all fresh. No behaviour change.
- **Criteria set changed:** `criteriaSetMatch` is false → all fresh. Safe default.
- **Answer added/removed:** New answers have no reusable entry → fresh. Disabled answers already filtered by existing logic.
- **Previous review failed:** Pipeline only loads `status: 'completed'` reviews → never reused.
- **Stale analysis shape:** Validate reusable analyses against `AnswerAnalysisSchema` before accepting. Validation failure → re-analyse fresh.

## Testing

### New unit tests
- Reuse decision logic: criteria set match + unchanged → reuse; mismatch → no reuse; no previous → no reuse
- Schema validation fallback: invalid previous analysis → falls back to fresh

### Modified integration tests
- Mock 15 answers, 1 changed → verify `callClaude` called once (not 15) in answer-analyses step
- Mock criteria set change → verify `callClaude` called for all answers
- Verify results JSONB structure identical whether analyses reused or fresh

## Expected Savings

| Scenario | Current calls | Optimised calls | Reduction |
|----------|--------------|-----------------|-----------|
| 1 of 15 changed | 17 | 3 | ~82% |
| 3 of 15 changed | 17 | 5 | ~71% |
| 1 of 25 changed | 27 | 3 | ~89% |
