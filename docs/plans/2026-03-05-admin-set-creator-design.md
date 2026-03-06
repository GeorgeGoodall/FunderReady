# Admin Set Creator — Design

## Goal

Replace the JSON-only admin creation forms for criteria sets and questions sets with a full-featured creation experience offering three input methods: AI parsing from raw text, manual entry, and raw JSON.

## Architecture

A new dedicated page at `/admin/orgs/[orgId]/funds/[fundId]/new-set/[type]` where `type` is `criteria` or `questions`. The page is a server component shell (auth + breadcrumb) with a client component `AdminSetCreator` that handles all interactive logic.

The "+ New Criteria Set" / "+ New Questions Set" buttons on the fund detail page become links to these pages. `AdminCreateForm` retains `org` and `fund` cases only.

## Component: AdminSetCreator

Single client component. Two-phase flow with three tabs in Phase 1.

### Phase 1 — Input

Three tabs:

- **Paste & Parse** — Textarea for raw text + "Parse with AI" button. For criteria only, includes URL scraping (reuses existing SSE logic from `CriteriaInput`). Calls `/api/parse-criteria` or `/api/parse-questions`.
- **Manual Entry** — Creates empty template set, jumps directly to Phase 2.
- **Raw JSON** — JSON textarea + "Load" button, validates and jumps to Phase 2.

### Phase 2 — Edit & Save

- `CriteriaPreview` or `QuestionsPreview` (full editable editors with drag-and-drop)
- Name field (criteria sets)
- "Create as approved" checkbox (default: checked)
- "Save" button → POSTs to `/api/admin/criteria-sets` or `/api/admin/questions-sets`
- "Back" link to discard and return to Phase 1
- On success → redirects to `/admin/orgs/[orgId]/funds/[fundId]/sets/[newId]`

## Data Flow

```
Tab → input method → CriteriaSet or QuestionsSet
  → editable preview
  → Save → POST /api/admin/{criteria-sets|questions-sets}
  → redirect to set detail page
```

## API Routes

No new routes. Reuses:
- `/api/parse-criteria`
- `/api/parse-questions`
- `/api/admin/scrape-criteria`
- `/api/admin/criteria-sets` (POST)
- `/api/admin/questions-sets` (POST)

## Changes to Existing Code

- **Fund detail page**: Replace `AdminCreateForm` for sets with `Link` to new pages.
- **AdminCreateForm**: Remove `criteria-set` and `questions-set` cases.
