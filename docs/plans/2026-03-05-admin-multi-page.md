# Admin Multi-Page Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Split the admin content management from a single 2094-line client component into separate server-component pages with nested routing, breadcrumbs, and client action islands.

**Architecture:** Next.js App Router nested routes under `(dashboard)/admin/`. Each page is a server component that queries Supabase directly via `createServiceClient()`. Interactive actions (approve, reject, edit, delete, create, amend) use small client-component islands that call the existing admin CRUD API routes and use `router.refresh()` to re-render. A shared admin layout provides auth guard, sub-nav, and breadcrumbs.

**Tech Stack:** Next.js 16 (React 19, App Router), Supabase, Tailwind CSS v4, TypeScript

---

### Task 1: Shared Admin Layout with Auth Guard and Sub-Nav

**Files:**
- Create: `src/app/(dashboard)/admin/layout.tsx`
- Modify: `src/app/(dashboard)/admin/page.tsx`

**Step 1: Create the admin layout**

Create `src/app/(dashboard)/admin/layout.tsx`:

```tsx
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();

  if (!profile?.is_admin) redirect("/dashboard");

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Admin Dashboard</h1>
        <nav className="flex gap-4">
          <Link
            href="/admin"
            className="text-sm font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            Organisations
          </Link>
          <Link
            href="/admin/metrics"
            className="text-sm font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            Metrics
          </Link>
        </nav>
      </div>
      <div className="mt-6">{children}</div>
    </div>
  );
}
```

**Step 2: Simplify page.tsx to just render a placeholder**

Strip `page.tsx` down to a minimal server component (remove `AdminTabs`, `AdminContentManagement` imports). Just render `<p>Loading org list...</p>` as a placeholder — we'll replace it in Task 3.

Remove the auth check from page.tsx (it's now in layout.tsx). Remove the `dynamic` export (layout handles it).

```tsx
export default function AdminPage() {
  return <p className="text-zinc-500">Organisation list coming next...</p>;
}
```

**Step 3: Verify the build**

Run: `cd C:/Users/eorge/Documents/workspace/projectBidReviewer/app && npm run build`
Expected: Build succeeds. `/admin` renders the layout with sub-nav and placeholder content.

**Step 4: Commit**

```bash
git add "src/app/(dashboard)/admin/layout.tsx" "src/app/(dashboard)/admin/page.tsx"
git commit -m "feat: add shared admin layout with auth guard and sub-nav"
```

---

### Task 2: Shared Client Action Components

**Files:**
- Create: `src/app/(dashboard)/admin/components/AdminActionBar.tsx`
- Create: `src/app/(dashboard)/admin/components/AdminCreateForm.tsx`
- Create: `src/app/(dashboard)/admin/components/AdminAmendForm.tsx`

These are the reusable client islands used across all admin pages.

**Step 1: Create AdminActionBar**

`src/app/(dashboard)/admin/components/AdminActionBar.tsx` — a client component that renders action buttons for any admin entity. Props:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface AdminActionBarProps {
  entityType: "organisations" | "funds" | "criteria-sets" | "questions-sets";
  entityId: string;
  approved: boolean; // or published for funds
  parentUrl: string; // Where to redirect after delete
  editFields?: EditField[];
  initialValues?: Record<string, string | boolean>;
}

interface EditField {
  name: string;
  label: string;
  type: "text" | "textarea" | "checkbox";
}
```

Actions:
- **Approve**: `PATCH /api/admin/{entityType}/{id}/approve` → `router.refresh()`
- **Reject**: Shows inline form with optional reason → `PATCH /api/admin/{entityType}/{id}/reject` → `router.refresh()`
- **Edit**: Shows inline form with the provided `editFields` → `PATCH /api/admin/{entityType}/{id}` → `router.refresh()`
- **Delete**: Shows confirmation → `DELETE /api/admin/{entityType}/{id}` → `router.push(parentUrl)`

Implementation notes:
- Single `actionInProgress` state to disable all buttons during an action
- Error state with auto-dismiss
- The component handles approve/reject for all entity types uniformly
- For funds, `approved` prop represents `published`

The full component should be ~250-300 lines. Port the action logic from `AdminContentManagement.tsx` (the `apiAction` helper, reject form, edit form, delete confirm).

**Step 2: Create AdminCreateForm**

`src/app/(dashboard)/admin/components/AdminCreateForm.tsx` — handles creation of all entity types:

```tsx
"use client";

interface AdminCreateFormProps {
  entityType: "org" | "fund" | "criteria-set" | "questions-set";
  parentId?: string; // org_id for fund, fund_id for sets
}
```

- For `org`: name, url, description fields → `POST /api/admin/organisations`
- For `fund`: name, url, notes fields → `POST /api/admin/funds` with `organisation_id: parentId`
- For `criteria-set`: name, raw JSON textarea → `POST /api/admin/criteria-sets` with `fund_id: parentId`
- For `questions-set`: raw JSON textarea, word limit → `POST /api/admin/questions-sets` with `fund_id: parentId`
- After create: `router.refresh()`

Port form logic from `AdminContentManagement.tsx` create handlers.

**Step 3: Create AdminAmendForm**

`src/app/(dashboard)/admin/components/AdminAmendForm.tsx` — amend flow for pending sets:

```tsx
"use client";

import { CriteriaPreview } from "@/components/CriteriaPreview";
import { QuestionsPreview } from "@/components/QuestionsPreview";
import type { CriteriaSet, QuestionsSet } from "@/lib/schemas/criteria";

interface AdminAmendFormProps {
  setType: "criteria" | "questions";
  setId: string;
  fundId: string;
  initialData: CriteriaSet | QuestionsSet;
}
```

- Renders editable `CriteriaPreview` or `QuestionsPreview`
- Save: POST new set (auto-approved) + PATCH reject original ("Amended by admin")
- After amend: `router.refresh()`

Port amend logic from `AdminContentManagement.tsx` amend handlers.

**Step 4: Verify the build**

Run: `cd C:/Users/eorge/Documents/workspace/projectBidReviewer/app && npm run build`

**Step 5: Commit**

```bash
git add "src/app/(dashboard)/admin/components/"
git commit -m "feat: add shared admin action components (ActionBar, CreateForm, AmendForm)"
```

---

### Task 3: Organisation List Page (`/admin`)

**Files:**
- Modify: `src/app/(dashboard)/admin/page.tsx`

**Step 1: Implement the server component org list**

Replace the placeholder with a full server component that queries orgs directly:

```tsx
import { createServiceClient } from "@/lib/supabase/server";
import Link from "next/link";
import { AdminCreateForm } from "./components/AdminCreateForm";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const serviceClient = createServiceClient();

  // Fetch all non-rejected orgs
  const { data: orgs } = await serviceClient
    .from("organisations")
    .select("id, name, url, description, approved, created_at")
    .eq("rejected", false)
    .order("name");

  // For each org, get pending counts (same logic as /api/admin/content)
  const orgsWithCounts = await Promise.all(
    (orgs ?? []).map(async (org) => {
      // ... count pending funds, pending sets
      // Return org with total_funds, pending_funds, pending_sets, pending_total
    })
  );

  const pendingOrgs = orgsWithCounts.filter((o) => !o.approved);
  const approvedOrgs = orgsWithCounts.filter((o) => o.approved);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <p className="text-sm text-zinc-500">Manage organisations, funds, and content sets.</p>
      </div>

      <AdminCreateForm entityType="org" />

      {pendingOrgs.length > 0 && (
        <section>
          <h2>Pending Organisations ({pendingOrgs.length})</h2>
          {/* Render org rows as Link cards to /admin/orgs/[id] */}
        </section>
      )}

      <section>
        <h2>Approved Organisations ({approvedOrgs.length})</h2>
        {/* Render org rows as Link cards to /admin/orgs/[id] */}
      </section>
    </div>
  );
}
```

Each org row should be a `<Link href={`/admin/orgs/${org.id}`}>` card showing:
- Name (bold)
- Description snippet (truncated)
- Pending badge if `pending_total > 0`
- Created date

Port the styling from the existing `renderOrgRow` function in `AdminContentManagement.tsx`, but replace the expand/collapse with a simple link.

**Step 2: Extract the counting logic into a helper**

Create `src/app/(dashboard)/admin/lib/admin-queries.ts` with reusable query functions:

```tsx
import { createServiceClient } from "@/lib/supabase/server";

export async function getOrgsWithCounts() { ... }
export async function getOrgWithFunds(orgId: string) { ... }
export async function getFundWithSets(fundId: string) { ... }
```

This keeps the server component pages clean and avoids duplicating query logic.

**Step 3: Verify**

Run: `cd C:/Users/eorge/Documents/workspace/projectBidReviewer/app && npm run build`

**Step 4: Commit**

```bash
git add "src/app/(dashboard)/admin/page.tsx" "src/app/(dashboard)/admin/lib/"
git commit -m "feat: add org list page with server-side data loading"
```

---

### Task 4: Organisation Detail Page (`/admin/orgs/[orgId]`)

**Files:**
- Create: `src/app/(dashboard)/admin/orgs/[orgId]/page.tsx`

**Step 1: Create the org detail page**

Server component that:
1. Queries the org by ID (404 if not found or rejected)
2. Queries its funds with pending set counts
3. Renders org header, action bar, and fund list

```tsx
import { createServiceClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { AdminActionBar } from "../../components/AdminActionBar";
import { AdminCreateForm } from "../../components/AdminCreateForm";

export const dynamic = "force-dynamic";

export default async function OrgDetailPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  const serviceClient = createServiceClient();

  const { data: org } = await serviceClient
    .from("organisations")
    .select("*")
    .eq("id", orgId)
    .eq("rejected", false)
    .single();

  if (!org) notFound();

  // Fetch funds with counts using helper from admin-queries.ts
  const funds = await getFundsForOrg(serviceClient, orgId);

  const pendingFunds = funds.filter((f) => !f.published);
  const publishedFunds = funds.filter((f) => f.published);

  return (
    <div className="space-y-8">
      {/* Breadcrumb: Organisations > Org Name */}
      <nav className="text-sm text-zinc-500">
        <Link href="/admin" className="hover:underline">Organisations</Link>
        <span className="mx-1">/</span>
        <span>{org.name}</span>
      </nav>

      {/* Org Header */}
      <div>
        <h2 className="text-xl font-semibold">{org.name}</h2>
        {org.description && <p className="mt-1 text-sm text-zinc-500">{org.description}</p>}
        {org.url && <a href={org.url} className="text-sm text-indigo-600">{org.url}</a>}
        <span className={`ml-2 text-xs px-2 py-0.5 rounded-full ${org.approved ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}>
          {org.approved ? "Approved" : "Pending"}
        </span>
      </div>

      {/* Action Bar */}
      <AdminActionBar
        entityType="organisations"
        entityId={orgId}
        approved={org.approved}
        parentUrl="/admin"
        editFields={[
          { name: "name", label: "Name", type: "text" },
          { name: "url", label: "URL", type: "text" },
          { name: "description", label: "Description", type: "textarea" },
        ]}
        initialValues={{ name: org.name, url: org.url ?? "", description: org.description ?? "" }}
      />

      {/* Create Fund */}
      <AdminCreateForm entityType="fund" parentId={orgId} />

      {/* Pending Funds */}
      {pendingFunds.length > 0 && (
        <section>
          <h3>Pending Funds ({pendingFunds.length})</h3>
          {/* Fund rows as Links to /admin/orgs/{orgId}/funds/{fundId} */}
        </section>
      )}

      {/* Published Funds */}
      <section>
        <h3>Published Funds ({publishedFunds.length})</h3>
        {/* Fund rows as Links */}
      </section>
    </div>
  );
}
```

**Step 2: Verify**

Run: `cd C:/Users/eorge/Documents/workspace/projectBidReviewer/app && npm run build`

**Step 3: Commit**

```bash
git add "src/app/(dashboard)/admin/orgs/"
git commit -m "feat: add org detail page with fund list"
```

---

### Task 5: Fund Detail Page (`/admin/orgs/[orgId]/funds/[fundId]`)

**Files:**
- Create: `src/app/(dashboard)/admin/orgs/[orgId]/funds/[fundId]/page.tsx`

**Step 1: Create the fund detail page**

Server component that:
1. Queries the fund (404 if not found or rejected)
2. Queries its criteria sets and questions sets
3. Queries parent org for breadcrumb
4. Renders fund header, action bar, and sets list

```tsx
export default async function FundDetailPage({
  params,
}: {
  params: Promise<{ orgId: string; fundId: string }>;
}) {
  const { orgId, fundId } = await params;
  // ... fetch fund, org, criteria_sets, questions_sets
}
```

Layout:
- Breadcrumb: Organisations > [Org Name] > [Fund Name]
- Fund header with name, URL, notes, published status
- `AdminActionBar` with fund-specific edit fields (name, url, notes, published checkbox, organisation_id)
- "Criteria Sets" section — each row links to `.../sets/[setId]`
- "Questions Sets" section — each row links to `.../sets/[setId]`
- `AdminCreateForm` buttons for criteria-set and questions-set

Each set row shows: name/label, item count (`criteria_json` array length or `questions_json` array length), approval badge, created date.

**Step 2: Verify**

Run: `cd C:/Users/eorge/Documents/workspace/projectBidReviewer/app && npm run build`

**Step 3: Commit**

```bash
git add "src/app/(dashboard)/admin/orgs/[orgId]/funds/"
git commit -m "feat: add fund detail page with criteria and questions sets"
```

---

### Task 6: Set Detail Page (`/admin/orgs/[orgId]/funds/[fundId]/sets/[setId]`)

**Files:**
- Create: `src/app/(dashboard)/admin/orgs/[orgId]/funds/[fundId]/sets/[setId]/page.tsx`
- Create: `src/app/(dashboard)/admin/components/SetContentDisplay.tsx`

**Step 1: Create SetContentDisplay client component**

A thin client wrapper around `CriteriaPreview` / `QuestionsPreview` for read-only display:

```tsx
"use client";

import { CriteriaPreview } from "@/components/CriteriaPreview";
import { QuestionsPreview } from "@/components/QuestionsPreview";
import type { CriteriaSet, QuestionsSet } from "@/lib/schemas/criteria";

interface SetContentDisplayProps {
  type: "criteria" | "questions";
  data: CriteriaSet | QuestionsSet;
}

export function SetContentDisplay({ type, data }: SetContentDisplayProps) {
  if (type === "criteria") {
    return <CriteriaPreview criteriaSet={data as CriteriaSet} onChange={() => {}} />;
  }
  return <QuestionsPreview questionsSet={data as QuestionsSet} onChange={() => {}} />;
}
```

**Step 2: Create the set detail page**

Server component that:
1. Tries to find the set in `criteria_sets` first, then `questions_sets`
2. Fetches parent fund and org for breadcrumb
3. Renders full content + actions

```tsx
export default async function SetDetailPage({
  params,
}: {
  params: Promise<{ orgId: string; fundId: string; setId: string }>;
}) {
  const { orgId, fundId, setId } = await params;
  const serviceClient = createServiceClient();

  // Try criteria_sets first
  let setType: "criteria" | "questions" = "criteria";
  let { data: criteriaSet } = await serviceClient
    .from("criteria_sets")
    .select("*")
    .eq("id", setId)
    .eq("rejected", false)
    .single();

  let set = criteriaSet;

  if (!set) {
    setType = "questions";
    const { data: questionsSet } = await serviceClient
      .from("questions_sets")
      .select("*")
      .eq("id", setId)
      .eq("rejected", false)
      .single();
    set = questionsSet;
  }

  if (!set) notFound();

  // Fetch org + fund for breadcrumb
  // ...

  // Parse JSON into CriteriaSet or QuestionsSet shape for preview components
  // ...

  return (
    <div className="space-y-8">
      {/* Breadcrumb: Orgs > [Org] > [Fund] > [Set Name] */}
      {/* Set header with name/label, approval status, date */}
      {/* AdminActionBar for approve/reject/delete */}
      {/* AdminAmendForm for pending sets */}
      {/* SetContentDisplay for read-only view */}
    </div>
  );
}
```

**Step 3: Verify**

Run: `cd C:/Users/eorge/Documents/workspace/projectBidReviewer/app && npm run build`

**Step 4: Commit**

```bash
git add "src/app/(dashboard)/admin/orgs/[orgId]/funds/[fundId]/sets/" \
  "src/app/(dashboard)/admin/components/SetContentDisplay.tsx"
git commit -m "feat: add set detail page with content display and amend flow"
```

---

### Task 7: Metrics Page (`/admin/metrics`)

**Files:**
- Create: `src/app/(dashboard)/admin/metrics/page.tsx`

**Step 1: Create the metrics page**

Simple server page that wraps the existing `AdminMetrics` client component:

```tsx
import { AdminMetrics } from "../AdminMetrics";

export const dynamic = "force-dynamic";

export default function AdminMetricsPage() {
  return (
    <div>
      <h2 className="text-lg font-semibold">AI Usage Metrics</h2>
      <p className="mt-1 text-sm text-zinc-500">
        Token consumption, costs, and platform statistics.
      </p>
      <div className="mt-4">
        <AdminMetrics />
      </div>
    </div>
  );
}
```

**Step 2: Verify**

Run: `cd C:/Users/eorge/Documents/workspace/projectBidReviewer/app && npm run build`

**Step 3: Commit**

```bash
git add "src/app/(dashboard)/admin/metrics/"
git commit -m "feat: add admin metrics page at /admin/metrics"
```

---

### Task 8: Clean Up Old Components

**Files:**
- Delete: `src/app/(dashboard)/admin/AdminContentManagement.tsx`
- Delete: `src/app/(dashboard)/admin/AdminTabs.tsx`
- Delete: `src/app/api/admin/content/route.ts`
- Delete: `src/app/api/admin/content/orgs/[id]/route.ts`
- Delete: `src/app/api/admin/content/funds/[id]/route.ts`

**Step 1: Delete old files**

Remove the files listed above. They are fully replaced by:
- `AdminContentManagement.tsx` → the 5 page components
- `AdminTabs.tsx` → the layout sub-nav
- `/api/admin/content/*` → direct server-side queries in page components

**Step 2: Verify no remaining imports**

Search for any remaining imports of the deleted components:

```bash
cd C:/Users/eorge/Documents/workspace/projectBidReviewer/app
grep -r "AdminContentManagement\|AdminTabs\|api/admin/content" src/ --include="*.tsx" --include="*.ts"
```

Fix any remaining references.

**Step 3: Run tests + build**

```bash
cd C:/Users/eorge/Documents/workspace/projectBidReviewer/app
npx vitest run && npm run build
```

**Step 4: Commit**

```bash
git add -u
git commit -m "chore: remove old single-page admin components and content APIs"
```

---

### Task 9: Final Verification

**Step 1: Run full test suite**

```bash
cd C:/Users/eorge/Documents/workspace/projectBidReviewer/app && npx vitest run
```

**Step 2: Run production build**

```bash
cd C:/Users/eorge/Documents/workspace/projectBidReviewer/app && npm run build
```

**Step 3: Run linter on new files**

```bash
cd C:/Users/eorge/Documents/workspace/projectBidReviewer/app && npm run lint
```

**Step 4: Verify all routes appear in build output**

Expected routes:
```
ƒ /admin
ƒ /admin/metrics
ƒ /admin/orgs/[orgId]
ƒ /admin/orgs/[orgId]/funds/[fundId]
ƒ /admin/orgs/[orgId]/funds/[fundId]/sets/[setId]
```

**Step 5: Requirements checklist**

- [ ] /admin shows org list with pending/approved sections and pending badges
- [ ] /admin/orgs/[id] shows org detail with fund list
- [ ] /admin/orgs/[id]/funds/[id] shows fund detail with sets list
- [ ] /admin/orgs/[id]/funds/[id]/sets/[id] shows full set content
- [ ] /admin/metrics shows the metrics dashboard
- [ ] Approve action works on all entity types
- [ ] Reject action works with optional reason
- [ ] Edit action works for orgs and funds
- [ ] Delete action works with confirmation
- [ ] Create forms work at all levels
- [ ] Amend flow works for pending sets
- [ ] Breadcrumb navigation works
- [ ] Sub-nav links work (Organisations | Metrics)
- [ ] Old files deleted (AdminContentManagement, AdminTabs, content APIs)
- [ ] All existing tests still pass
- [ ] Build succeeds
