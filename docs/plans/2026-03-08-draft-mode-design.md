# Draft Mode Design

**Date:** 2026-03-08
**Status:** Approved

## Overview

Add a per-review "draft mode" toggle to the submit confirmation dialog. When enabled, the AI pipeline is informed the submission is a draft — placeholders are not penalised, feedback is framed as forward-looking suggestions, and the review display reflects the draft status.

## Decisions

- **Credits:** Same cost as a final review (calculated from actual token usage)
- **Toggle location:** Submit confirmation dialog (per-review, not per-application)
- **Implementation:** Simple `is_draft` boolean (not an enum)

## Section 1: Data Layer

New column on `application_reviews`:

```sql
ALTER TABLE application_reviews
  ADD COLUMN is_draft boolean NOT NULL DEFAULT false;
```

The existing `submit_review` atomic RPC gains a `p_is_draft boolean` parameter so the flag is stored in the same atomic operation as review creation.

The Inngest event payload gains `isDraft: boolean` alongside existing fields.

## Section 2: API & Inngest

**submit-for-review route:**
- Reads `is_draft: boolean` from request body (defaults to `false`)
- Passes `p_is_draft` to `submit_review` RPC
- Includes `isDraft` in the Inngest event payload

**Inngest pipeline (`application-review.ts`):**
- Reads `isDraft` from `event.data`
- Passes it to all prompt-builder calls (answer analysis, cross-reference, scoring)
- No other pipeline logic changes

**TypeScript types:**
- Regenerate `database.ts` after migration
- Prompt builder functions gain optional `isDraft?: boolean` parameter

## Section 3: Prompt Changes

Each affected prompt builder prepends a draft-mode instruction block when `isDraft` is true.

**Answer analysis (`buildAnswerAnalysisPrompt`):**
> "This answer is from a draft application. It may contain placeholders (e.g. 'TBC', '£X,XXX', '[partner name]'). Do not penalise placeholders — assume they will be completed with strong content. Score leniently on the assumption that placeholders represent intent. Do not comment on word count. Frame all inline comments as forward-looking suggestions ('Consider including...', 'This section could strengthen by...') rather than evaluations of failure."

**Cross-reference (`buildApplicationCrossReferencePrompt`):**
> "This is a draft application. Placeholders may cause apparent gaps or inconsistencies — do not flag these as contradictions or unresolved references unless the substantive content on both sides conflicts."

**Scoring (`buildApplicationScoringPrompt`):**
> "This is a draft application containing placeholders. Score leniently — assume placeholders will be completed with competent content. Produce scores and quality dimensions as normal, but reflect the draft status in your overall framing."

## Section 4: UI Changes

**Submit confirmation dialog:**
- Checkbox: **"This is a draft review"**
- Subtext: *"Placeholders won't be penalised. Feedback will be framed as suggestions to help you develop your answers."*
- Unchecked by default

**Review results page (`/applications/[id]/review`):**
- Banner when `is_draft = true`: *"Draft review — scores assume placeholders will be completed with strong content. Take scores as directional, not definitive."*
- `submission_readiness` label replaced with: *"Draft — submission readiness not assessed"*

**Review history (`/applications/[id]/history`):**
- "Draft" badge on each draft review entry
