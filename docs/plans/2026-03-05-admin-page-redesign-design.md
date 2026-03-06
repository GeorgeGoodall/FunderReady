# Admin Page Redesign — Design Document

**Date:** 2026-03-05
**Status:** Approved

## Summary

Redesign the admin page from a flat approval queue into a hierarchical content management system with two tabs (Content Management + Metrics), full CRUD operations, reject with optional reason, and amend-before-approve flows.

## Current State

The admin page has two sections on a single page:
- **AdminDashboard** — flat lists of pending criteria sets, organisations, and questions sets with only an "Approve" button each
- **AdminMetrics** — AI usage/cost dashboard with charts and tables

Key gaps: no reject action, no content inspection, no hierarchy, no error feedback, no edit/delete capabilities.

## Design

### Tab Layout

Two tabs at the top, state managed via URL search params (`?tab=content` / `?tab=metrics`):
1. **Content Management** (default) — hierarchical tree browser
2. **Metrics** — existing `AdminMetrics` component (unchanged)

### Hierarchical Tree Structure

**Top level** — two collapsible sections:
- **Approved Organisations (N)** — alphabetically sorted
- **Pending Organisations (N)** — sorted by creation date (oldest first)

Each org row shows: name, description snippet, URL, creation date, and a **pending badge** (total count of unapproved items nested within: pending funds + pending criteria sets + pending questions sets).

**Expanding an org** reveals:
- Org detail panel (full description, URL, created by, date)
- Action buttons: Approve/Reject (if pending), Edit, Delete
- Sub-sections: Approved Funds (N) / Pending Funds (N)

Each fund row shows: name, URL, notes snippet, pending badge (count of pending sets within).

**Expanding a fund** reveals:
- Fund detail panel (full details, editable fields)
- Action buttons: Publish/Unpublish toggle, Edit, Delete, Reassign Org
- Sub-sections: Criteria Sets (approved/pending) and Questions Sets (approved/pending)

Each set row shows: label/name, item count, word limit (questions), creation date, approval status badge. Expandable to show full criteria/questions content rendered as readable cards.

**"+ New" buttons** at each level for admin-created content (auto-approved).

### Actions

**Approve** (pending items only):
- Single click, no confirmation needed
- Sets `approved = true` (orgs, sets) or `published = true` (funds)
- Refreshes tree to move item from pending to approved

**Reject** (pending items only):
- Opens inline form with optional text field for rejection reason
- Soft-deletes: sets `rejected = true`, stores `rejection_reason` (nullable)
- Item disappears from admin view (filtered out)

**Amend** (pending criteria/questions sets only):
- Opens inline editor showing full content
- On save: creates new row with amended content (auto-approved), original gets auto-rejected with reason "Amended by admin"
- Preserves immutable versioning pattern

**Edit** (approved orgs and funds):
- Inline editable fields (name, URL, description/notes)
- Direct update on mutable entities

**Create** (at each level):
- Inline form matching entity type
- Auto-approved on save
- Criteria/questions sets reuse existing input components

**Delete** (confirmation dialog required):
- Orgs: must reassign or delete funds first
- Funds: cascades to sets (DB cascade exists)
- Sets: direct delete

### Database Changes

**New columns on existing tables:**
```sql
-- All four tables get these columns:
ALTER TABLE organisations ADD COLUMN rejected boolean NOT NULL DEFAULT false;
ALTER TABLE organisations ADD COLUMN rejection_reason text;

ALTER TABLE funds ADD COLUMN rejected boolean NOT NULL DEFAULT false;
ALTER TABLE funds ADD COLUMN rejection_reason text;

ALTER TABLE criteria_sets ADD COLUMN rejected boolean NOT NULL DEFAULT false;
ALTER TABLE criteria_sets ADD COLUMN rejection_reason text;

ALTER TABLE questions_sets ADD COLUMN rejected boolean NOT NULL DEFAULT false;
ALTER TABLE questions_sets ADD COLUMN rejection_reason text;
```

**Enforce organisation_id on funds:**
```sql
ALTER TABLE funds ALTER COLUMN organisation_id SET NOT NULL;
```
Prerequisite: check for and handle any existing funds with null `organisation_id`.

**Updated queries:** All queries fetching pending items must exclude `rejected = true` records.

### New API Routes

**Reject routes:**
- `PATCH /api/admin/organisations/[id]/reject`
- `PATCH /api/admin/funds/[id]/reject`
- `PATCH /api/admin/criteria-sets/[id]/reject`
- `PATCH /api/admin/questions-sets/[id]/reject`

**Edit routes:**
- `PATCH /api/admin/funds/[id]` — edit fund fields
- `PATCH /api/admin/organisations/[id]` — edit org fields (extends existing approve route)

**Delete routes:**
- `DELETE /api/admin/funds/[id]`
- `DELETE /api/admin/organisations/[id]` (only if no funds)
- `DELETE /api/admin/criteria-sets/[id]`
- `DELETE /api/admin/questions-sets/[id]`

**Create routes:**
- `POST /api/admin/funds` — auto-published
- `POST /api/admin/organisations` — auto-approved
- `POST /api/admin/criteria-sets` — auto-approved
- `POST /api/admin/questions-sets` — auto-approved

### Data Loading Strategy

**Server-side initial load** (page.tsx):
- Fetch all organisations with aggregated counts of pending sub-items
- Provides top-level view with pending badges immediately

**Client-side drill-down** (tree component):
- Expanding an org fetches its funds with pending set counts
- Expanding a fund fetches its criteria and questions sets
- Keeps initial load fast, avoids fetching entire content tree upfront

**Cache invalidation:** `router.refresh()` after mutations for server data; invalidate client-side cache entries after mutations.

## Decisions Made

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Orphan funds | Require organisation on all funds | Simplifies hierarchy, clean data model |
| Rejection model | Soft delete with optional reason | Preserves records, flexible for admin |
| Amend flow | New row + auto-reject original | Preserves immutable pattern, clean audit trail |
| Tab structure | Content Management + Metrics | Two clear concerns, simple navigation |
| Nav badge | Within admin page only | Keeps main nav clean |
| Admin scope | Review + Create | Allows bootstrapping content without submission flow |
| Fund management | Full management | Admins can edit, delete, reassign, toggle published |
| Approach | Hierarchical Tree Browser | Matches natural data model, progressive disclosure |
