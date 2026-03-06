# Admin Multi-Page Redesign — Design Document

**Date:** 2026-03-05
**Status:** Approved

## Summary

Split the admin content management from a single 2094-line client component into separate server-component pages with nested routing, breadcrumbs, and client action islands.

## Route Structure

```
/admin                                              → Org list (pending + approved)
/admin/metrics                                      → Metrics dashboard
/admin/orgs/[orgId]                                 → Org detail + fund list
/admin/orgs/[orgId]/funds/[fundId]                  → Fund detail + sets list
/admin/orgs/[orgId]/funds/[fundId]/sets/[setId]     → Set detail (criteria or questions)
```

## Shared Admin Layout

`admin/layout.tsx`:
- Auth guard: check `is_admin`, redirect non-admins
- Sub-nav: "Organisations" | "Metrics" links
- Breadcrumb navigation (auto-generated from route segments)
- Server component using `createClient()` for auth check

## Pages

### `/admin` — Organisation List

Server component. Queries all non-rejected orgs with pending sub-item counts via `createServiceClient()`.

- Two sections: "Pending Organisations" and "Approved Organisations"
- Each row: name, description snippet, pending badge, link to `/admin/orgs/[id]`
- "+ New Organisation" button (client island with inline form)

### `/admin/orgs/[orgId]` — Organisation Detail

Server component. Queries org + its funds with pending set counts.

- Header: org name, description, URL, approval status
- Action bar (client island): Approve/Reject (if pending), Edit, Delete
- Fund list: "Pending Funds" and "Published Funds" sections
- Each fund row links to `/admin/orgs/[orgId]/funds/[fundId]`
- "+ New Fund" button (client island)

### `/admin/orgs/[orgId]/funds/[fundId]` — Fund Detail

Server component. Queries fund + its criteria and questions sets.

- Header: fund name, URL, notes, published status
- Action bar: Publish/Unpublish, Edit, Delete, Reassign Org
- Two sections: "Criteria Sets" and "Questions Sets"
- Each set row: name/label, item count, approval badge, link to `.../sets/[setId]`
- "+ New Criteria Set" / "+ New Questions Set" buttons (client islands)

### `/admin/orgs/[orgId]/funds/[fundId]/sets/[setId]` — Set Detail

Server component. Queries the set (checks both criteria_sets and questions_sets tables).

- Full content display using existing `CriteriaPreview` / `QuestionsPreview` components (wrapped in client boundary)
- Actions: Approve, Reject (with reason), Amend (inline editor), Delete

### `/admin/metrics` — Metrics Dashboard

Existing `AdminMetrics` component (unchanged). Wrapped in a simple server page.

## Client Action Components

Three reusable client components replace the inline actions from the monolithic component:

### `AdminActionBar.tsx`

Client component. Props: entity type, id, current status, entity-specific fields.

- Approve button → PATCH approve API → `router.refresh()`
- Reject button → inline form with optional reason → PATCH reject API → `router.refresh()`
- Edit button → inline form with editable fields → PATCH edit API → `router.refresh()`
- Delete button → confirmation dialog → DELETE API → redirect to parent page

### `AdminCreateForm.tsx`

Client component. Variants for org, fund, criteria set, questions set.

- Org: name, url, description fields
- Fund: name, url, notes fields (org_id from context)
- Criteria set: reuses `CriteriaInput` + `CriteriaPreview` (fund_id from context)
- Questions set: reuses `QuestionsInput` + `QuestionsPreview` (fund_id from context)
- POST to admin create API → `router.refresh()`

### `AdminAmendForm.tsx`

Client component. For pending criteria/questions sets only.

- Renders editable `CriteriaPreview` / `QuestionsPreview`
- Save: POST new set (auto-approved) + PATCH reject original ("Amended by admin") → `router.refresh()`

## What Gets Deleted

- `AdminContentManagement.tsx` (2094 lines) — replaced by the page hierarchy
- `AdminTabs.tsx` — tabs replaced by sub-nav links in layout
- Content data loading APIs (`/api/admin/content/*`) — replaced by direct server-side queries

## What Stays

- All CRUD API routes (`/api/admin/*/[id]/approve`, `reject`, etc.) — still used by client action components
- `AdminMetrics.tsx` — moved to `/admin/metrics` page
- All database tables, migrations, RLS policies — unchanged

## Decisions

| Decision | Choice |
|----------|--------|
| Page depth | Three levels (org → fund → set) |
| URL structure | Nested (/admin/orgs/[id]/funds/[id]/sets/[id]) |
| Set routes | Shared page for criteria and questions sets |
| Metrics | Separate /admin/metrics route |
| Approach | Server components with client islands |
