# Admin Page Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Redesign the admin page into a hierarchical content management system with tabs, full CRUD, reject with reason, and amend-before-approve flows.

**Architecture:** Two-tab layout (Content Management + Metrics). Content Management uses a drill-down tree: Organisations → Funds → Criteria/Questions Sets. Server-side initial load with aggregated pending counts, client-side drill-down on expand. All admin API routes share an extracted auth helper. Reject uses soft-delete with optional reason. Amend creates new approved row + auto-rejects original.

**Tech Stack:** Next.js 16, React 19, Supabase (hosted), Tailwind CSS v4, TypeScript, Vitest

---

### Task 1: Database Migration — Rejected Columns + Enforce organisation_id

**Files:**
- Create: `supabase/migrations/20260307000000_admin_reject_columns.sql`

**Step 1: Check for orphan funds**

Run: `npm run --prefix app dev` (ensure dev server available), then query the Supabase project for funds with null organisation_id.

Use the Supabase MCP `execute_sql` tool:
```sql
SELECT id, name FROM funds WHERE organisation_id IS NULL;
```

If any exist, create or assign organisations for them before proceeding. If none exist, proceed.

**Step 2: Write the migration**

```sql
-- Add rejected + rejection_reason to all four tables
ALTER TABLE public.organisations
  ADD COLUMN IF NOT EXISTS rejected boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS rejection_reason text;

ALTER TABLE public.funds
  ADD COLUMN IF NOT EXISTS rejected boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS rejection_reason text;

ALTER TABLE public.criteria_sets
  ADD COLUMN IF NOT EXISTS rejected boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS rejection_reason text;

ALTER TABLE public.questions_sets
  ADD COLUMN IF NOT EXISTS rejected boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS rejection_reason text;

-- Enforce organisation_id NOT NULL on funds
ALTER TABLE public.funds ALTER COLUMN organisation_id SET NOT NULL;

-- Add admin DELETE policies (needed for delete routes)
CREATE POLICY "Admin can delete funds"
  ON public.funds FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND is_admin = true
    )
  );

CREATE POLICY "Admin can delete criteria sets"
  ON public.criteria_sets FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND is_admin = true
    )
  );

CREATE POLICY "Admin can delete questions sets"
  ON public.questions_sets FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND is_admin = true
    )
  );

-- Add admin policies for organisations (currently only creator can update, no delete)
CREATE POLICY "Admin can update organisations"
  ON public.organisations FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND is_admin = true
    )
  );

CREATE POLICY "Admin can delete organisations"
  ON public.organisations FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND is_admin = true
    )
  );

-- Update organisations SELECT to exclude rejected
DROP POLICY IF EXISTS "organisations_select" ON public.organisations;
CREATE POLICY "organisations_select"
  ON public.organisations FOR SELECT TO authenticated
  USING (
    rejected = false
    AND (approved = true OR created_by = auth.uid())
  );

-- Update funds SELECT to exclude rejected
DROP POLICY IF EXISTS "Visible funds readable by authenticated users" ON public.funds;
CREATE POLICY "Visible funds readable by authenticated users"
  ON public.funds FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND rejected = false
    AND (published = true OR created_by = auth.uid())
  );
```

**Step 3: Apply the migration**

Use the Supabase MCP `apply_migration` tool with project_id `pxvtcaqpithbjifpxnic`.

**Step 4: Commit**

```bash
cd app && git add supabase/migrations/20260307000000_admin_reject_columns.sql
git commit -m "feat(db): add rejected columns and admin delete policies"
```

---

### Task 2: Regenerate TypeScript Types

**Files:**
- Modify: `src/types/database.ts`

**Step 1: Generate types**

Use the Supabase MCP `generate_typescript_types` tool with project_id `pxvtcaqpithbjifpxnic`.

**Step 2: Replace the types file**

Overwrite `src/types/database.ts` with the generated output. Verify the new columns appear:
- `organisations.rejected: boolean`, `organisations.rejection_reason: string | null`
- `funds.rejected: boolean`, `funds.rejection_reason: string | null`
- `criteria_sets.rejected: boolean`, `criteria_sets.rejection_reason: string | null`
- `questions_sets.rejected: boolean`, `questions_sets.rejection_reason: string | null`
- `funds.organisation_id: string` (no longer nullable)

**Step 3: Run type check**

Run: `cd app && npx tsc --noEmit`
Expected: may have errors if existing code passes `null` for `organisation_id` — fix those.

**Step 4: Commit**

```bash
cd app && git add src/types/database.ts
git commit -m "chore: regenerate database types with rejected columns"
```

---

### Task 3: Extract Admin Auth Helper

**Files:**
- Create: `src/lib/auth/require-admin.ts`
- Create: `src/lib/auth/__tests__/require-admin.test.ts`
- Modify: `src/app/api/admin/criteria-sets/[id]/approve/route.ts`
- Modify: `src/app/api/admin/questions-sets/[id]/approve/route.ts`
- Modify: `src/app/api/admin/organisations/[id]/approve/route.ts`
- Modify: `src/app/api/admin/metrics/route.ts`

**Step 1: Write the failing test**

Create `src/lib/auth/__tests__/require-admin.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Supabase
const mockGetUser = vi.fn();
const mockFrom = vi.fn();
const mockServiceFrom = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() =>
    Promise.resolve({
      auth: { getUser: mockGetUser },
      from: mockFrom,
    })
  ),
  createServiceClient: vi.fn(() => ({
    from: mockServiceFrom,
  })),
}));

import { requireAdmin } from "../require-admin";

describe("requireAdmin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 response if no user", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const result = await requireAdmin();
    expect(result.error?.status).toBe(401);
  });

  it("returns 403 response if user is not admin", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    mockServiceFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { is_admin: false },
          }),
        }),
      }),
    });
    const result = await requireAdmin();
    expect(result.error?.status).toBe(403);
  });

  it("returns serviceClient and userId on success", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    mockServiceFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { is_admin: true },
          }),
        }),
      }),
    });
    const result = await requireAdmin();
    expect(result.error).toBeUndefined();
    expect(result.userId).toBe("u1");
    expect(result.serviceClient).toBeDefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd app && npx vitest run src/lib/auth/__tests__/require-admin.test.ts`
Expected: FAIL — module not found

**Step 3: Write the implementation**

Create `src/lib/auth/require-admin.ts`:

```ts
import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

type AdminResult =
  | { error: NextResponse; serviceClient?: undefined; userId?: undefined }
  | { error?: undefined; serviceClient: SupabaseClient; userId: string };

export async function requireAdmin(): Promise<AdminResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const serviceClient = createServiceClient();
  const { data: profile } = await serviceClient
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();

  if (!profile?.is_admin) {
    return {
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return { serviceClient, userId: user.id };
}
```

**Step 4: Run test to verify it passes**

Run: `cd app && npx vitest run src/lib/auth/__tests__/require-admin.test.ts`
Expected: PASS

**Step 5: Refactor existing approve routes to use the helper**

Update all three approve routes and the metrics route to use `requireAdmin()`. Example for `criteria-sets/[id]/approve/route.ts`:

```ts
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";

export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { error } = await auth.serviceClient
    .from("criteria_sets")
    .update({ approved: true })
    .eq("id", id);

  if (error) {
    console.error("Approve criteria set error:", error);
    return NextResponse.json({ error: "Failed to approve" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
```

Apply the same pattern to `questions-sets/[id]/approve/route.ts`, `organisations/[id]/approve/route.ts`, and `metrics/route.ts`.

**Step 6: Run existing tests**

Run: `cd app && npx vitest run src/app/api/__tests__/admin-and-ai.test.ts`
Expected: PASS — all existing admin tests still pass

**Step 7: Commit**

```bash
cd app && git add src/lib/auth/require-admin.ts src/lib/auth/__tests__/require-admin.test.ts \
  src/app/api/admin/criteria-sets/[id]/approve/route.ts \
  src/app/api/admin/questions-sets/[id]/approve/route.ts \
  src/app/api/admin/organisations/[id]/approve/route.ts \
  src/app/api/admin/metrics/route.ts
git commit -m "refactor: extract requireAdmin() helper, DRY admin routes"
```

---

### Task 4: Reject API Routes (All 4 Entities)

**Files:**
- Create: `src/app/api/admin/organisations/[id]/reject/route.ts`
- Create: `src/app/api/admin/funds/[id]/reject/route.ts`
- Create: `src/app/api/admin/criteria-sets/[id]/reject/route.ts`
- Create: `src/app/api/admin/questions-sets/[id]/reject/route.ts`
- Create: `src/app/api/__tests__/admin-reject.test.ts`

**Step 1: Write the failing tests**

Create `src/app/api/__tests__/admin-reject.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// Standard admin mock setup (same pattern as admin-and-ai.test.ts)
const mockGetUser = vi.fn();
const mockServiceFrom = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() =>
    Promise.resolve({
      auth: { getUser: mockGetUser },
    })
  ),
  createServiceClient: vi.fn(() => ({
    from: mockServiceFrom,
  })),
}));

function mockAdminAuth() {
  mockGetUser.mockResolvedValue({ data: { user: { id: "admin-1" } } });
  mockServiceFrom.mockImplementation((table: string) => {
    if (table === "profiles") {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { is_admin: true } }),
          }),
        }),
      };
    }
    // Default: return chainable mock for the target table
    return {
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          error: null,
        }),
      }),
    };
  });
}

// Test each reject route
const routes = [
  { name: "organisations", table: "organisations" },
  { name: "funds", table: "funds" },
  { name: "criteria-sets", table: "criteria_sets" },
  { name: "questions-sets", table: "questions_sets" },
];

for (const { name, table } of routes) {
  describe(`PATCH /api/admin/${name}/[id]/reject`, () => {
    let PATCH: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;

    beforeEach(async () => {
      vi.clearAllMocks();
      const mod = await import(`@/app/api/admin/${name}/[id]/reject/route`);
      PATCH = mod.PATCH;
    });

    it("returns 401 if not authenticated", async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } });
      const res = await PATCH(
        new Request("http://localhost", { method: "PATCH", body: JSON.stringify({}) }),
        { params: Promise.resolve({ id: "test-id" }) }
      );
      expect(res.status).toBe(401);
    });

    it("returns 403 if not admin", async () => {
      mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });
      mockServiceFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { is_admin: false } }),
          }),
        }),
      });
      const res = await PATCH(
        new Request("http://localhost", { method: "PATCH", body: JSON.stringify({}) }),
        { params: Promise.resolve({ id: "test-id" }) }
      );
      expect(res.status).toBe(403);
    });

    it("rejects with optional reason", async () => {
      mockAdminAuth();
      const updateMock = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({ error: null }),
      });
      mockServiceFrom.mockImplementation((t: string) => {
        if (t === "profiles") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: { is_admin: true } }),
              }),
            }),
          };
        }
        return { update: updateMock };
      });

      const res = await PATCH(
        new Request("http://localhost", {
          method: "PATCH",
          body: JSON.stringify({ reason: "Duplicate entry" }),
        }),
        { params: Promise.resolve({ id: "test-id" }) }
      );
      expect(res.status).toBe(200);
      expect(updateMock).toHaveBeenCalledWith({
        rejected: true,
        rejection_reason: "Duplicate entry",
      });
    });

    it("rejects without reason", async () => {
      mockAdminAuth();
      const updateMock = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({ error: null }),
      });
      mockServiceFrom.mockImplementation((t: string) => {
        if (t === "profiles") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: { is_admin: true } }),
              }),
            }),
          };
        }
        return { update: updateMock };
      });

      const res = await PATCH(
        new Request("http://localhost", {
          method: "PATCH",
          body: JSON.stringify({}),
        }),
        { params: Promise.resolve({ id: "test-id" }) }
      );
      expect(res.status).toBe(200);
      expect(updateMock).toHaveBeenCalledWith({
        rejected: true,
        rejection_reason: null,
      });
    });
  });
}
```

**Step 2: Run tests to verify they fail**

Run: `cd app && npx vitest run src/app/api/__tests__/admin-reject.test.ts`
Expected: FAIL — modules not found

**Step 3: Write all four reject route implementations**

Each route follows the same pattern. Example for `src/app/api/admin/organisations/[id]/reject/route.ts`:

```ts
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => ({}));
  const reason = typeof body.reason === "string" ? body.reason : null;

  const { error } = await auth.serviceClient
    .from("organisations")
    .update({ rejected: true, rejection_reason: reason })
    .eq("id", id);

  if (error) {
    console.error("Reject organisation error:", error);
    return NextResponse.json({ error: "Failed to reject" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
```

Create the same for `funds/[id]/reject`, `criteria-sets/[id]/reject`, `questions-sets/[id]/reject` — changing only the table name and error message.

**Step 4: Run tests to verify they pass**

Run: `cd app && npx vitest run src/app/api/__tests__/admin-reject.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
cd app && git add src/app/api/admin/*/[id]/reject/route.ts src/app/api/__tests__/admin-reject.test.ts
git commit -m "feat: add reject API routes for all entity types"
```

---

### Task 5: Edit API Routes (Organisations + Funds)

**Files:**
- Create: `src/app/api/admin/organisations/[id]/route.ts`
- Create: `src/app/api/admin/funds/[id]/route.ts`
- Create: `src/app/api/__tests__/admin-edit.test.ts`

**Step 1: Write the failing tests**

Create `src/app/api/__tests__/admin-edit.test.ts` with tests for:
- `PATCH /api/admin/organisations/[id]` — update name, url, description. Returns 401/403/200/500.
- `PATCH /api/admin/funds/[id]` — update name, url, notes, published, organisation_id. Returns 401/403/200/500.
- Validate that only allowed fields are passed through (no arbitrary field injection).

Each test follows the mock pattern from Task 4.

**Step 2: Run tests to verify they fail**

Run: `cd app && npx vitest run src/app/api/__tests__/admin-edit.test.ts`

**Step 3: Write the implementations**

`src/app/api/admin/organisations/[id]/route.ts`:
```ts
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";

const ALLOWED_FIELDS = ["name", "url", "description"] as const;

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => ({}));
  const updates: Record<string, unknown> = {};
  for (const field of ALLOWED_FIELDS) {
    if (field in body) updates[field] = body[field];
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const { error } = await auth.serviceClient
    .from("organisations")
    .update(updates)
    .eq("id", id);

  if (error) {
    console.error("Edit organisation error:", error);
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
```

`src/app/api/admin/funds/[id]/route.ts`:
Same pattern with `ALLOWED_FIELDS = ["name", "url", "notes", "published", "organisation_id"]`.

**Step 4: Run tests to verify they pass**

**Step 5: Commit**

```bash
cd app && git add src/app/api/admin/organisations/[id]/route.ts \
  src/app/api/admin/funds/[id]/route.ts \
  src/app/api/__tests__/admin-edit.test.ts
git commit -m "feat: add edit API routes for organisations and funds"
```

---

### Task 6: Delete API Routes (All 4 Entities)

**Files:**
- Add DELETE handler to: `src/app/api/admin/organisations/[id]/route.ts`
- Add DELETE handler to: `src/app/api/admin/funds/[id]/route.ts`
- Create: `src/app/api/admin/criteria-sets/[id]/route.ts`
- Create: `src/app/api/admin/questions-sets/[id]/route.ts`
- Create: `src/app/api/__tests__/admin-delete.test.ts`

**Step 1: Write the failing tests**

Tests for:
- `DELETE /api/admin/organisations/[id]` — returns 401/403/409 (has funds)/204
- `DELETE /api/admin/funds/[id]` — returns 401/403/204 (cascades to sets)
- `DELETE /api/admin/criteria-sets/[id]` — returns 401/403/204
- `DELETE /api/admin/questions-sets/[id]` — returns 401/403/204

For organisations delete, check fund count first:
```ts
// In the route handler:
const { count } = await auth.serviceClient
  .from("funds")
  .select("id", { count: "exact", head: true })
  .eq("organisation_id", id);

if (count && count > 0) {
  return NextResponse.json(
    { error: "Cannot delete organisation with existing funds" },
    { status: 409 }
  );
}
```

**Step 2: Run tests, verify fail**

**Step 3: Implement all DELETE handlers**

For criteria-sets and questions-sets, create new route files with just a DELETE export. For organisations and funds, add DELETE to the existing route files from Task 5.

Each DELETE handler: auth check → (org: fund count check) → delete → return 204.

**Step 4: Run tests, verify pass**

**Step 5: Commit**

```bash
cd app && git add src/app/api/admin/*/[id]/route.ts src/app/api/__tests__/admin-delete.test.ts
git commit -m "feat: add delete API routes for all entity types"
```

---

### Task 7: Create API Routes (All 4 Entities)

**Files:**
- Create: `src/app/api/admin/organisations/route.ts`
- Create: `src/app/api/admin/funds/route.ts`
- Create: `src/app/api/admin/criteria-sets/route.ts`
- Create: `src/app/api/admin/questions-sets/route.ts`
- Create: `src/app/api/__tests__/admin-create.test.ts`

**Step 1: Write the failing tests**

Tests for POST on each route:
- 401/403 auth checks
- 400 for missing required fields
- 200/201 on success with auto-approved/published flags set
- Verify `created_by` is set to the admin's user ID

**Step 2: Run tests, verify fail**

**Step 3: Implement all POST handlers**

Each route: auth check → validate required fields → insert with `approved: true` (orgs/sets) or `published: true` (funds) + `created_by: auth.userId` → return created record.

`src/app/api/admin/organisations/route.ts`:
```ts
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => ({}));

  if (!body.name?.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const { data, error } = await auth.serviceClient
    .from("organisations")
    .insert({
      name: body.name.trim(),
      url: body.url || null,
      description: body.description || null,
      approved: true,
      created_by: auth.userId,
    })
    .select()
    .single();

  if (error) {
    console.error("Create organisation error:", error);
    return NextResponse.json({ error: "Failed to create" }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
```

Same pattern for funds (requires `name` + `organisation_id`, sets `published: true`), criteria-sets (requires `fund_id` + `criteria_json` + `name`, sets `approved: true`), questions-sets (requires `fund_id` + `questions_json`, sets `approved: true`).

**Step 4: Run tests, verify pass**

**Step 5: Commit**

```bash
cd app && git add src/app/api/admin/*/route.ts src/app/api/__tests__/admin-create.test.ts
git commit -m "feat: add create API routes for admin content management"
```

---

### Task 8: Admin Page Tab Layout

**Files:**
- Modify: `src/app/(dashboard)/admin/page.tsx`
- Create: `src/app/(dashboard)/admin/AdminTabs.tsx`

**Step 1: Create the AdminTabs client component**

`src/app/(dashboard)/admin/AdminTabs.tsx`:
```tsx
"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { ReactNode } from "react";

interface AdminTabsProps {
  contentTab: ReactNode;
  metricsTab: ReactNode;
}

export function AdminTabs({ contentTab, metricsTab }: AdminTabsProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const activeTab = searchParams.get("tab") ?? "content";

  function setTab(tab: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);
    router.push(`?${params.toString()}`);
  }

  const tabs = [
    { id: "content", label: "Content Management" },
    { id: "metrics", label: "Metrics" },
  ];

  return (
    <div>
      <div className="flex gap-1 border-b border-zinc-200 dark:border-zinc-700">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setTab(tab.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.id
                ? "border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400"
                : "border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="mt-6">
        {activeTab === "content" ? contentTab : metricsTab}
      </div>
    </div>
  );
}
```

**Step 2: Update page.tsx to use tabs**

Refactor `page.tsx` to render `<AdminTabs>` with the content management component and `<AdminMetrics>` as the two tab panels. The existing `AdminDashboard` component stays for now — it will be replaced in later tasks.

```tsx
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { AdminTabs } from "./AdminTabs";
import { AdminDashboard } from "./AdminDashboard";
import { AdminMetrics } from "./AdminMetrics";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();
  if (!profile?.is_admin) redirect("/dashboard");

  // Existing pending queries (to be replaced in Task 9)
  const { data: pendingCriteriaSets } = await supabase
    .from("criteria_sets")
    .select("id, name, description, criteria_json, created_at, fund_id, created_by, funds(name)")
    .eq("approved", false)
    .eq("rejected", false)
    .order("created_at", { ascending: false });

  const { data: pendingQuestionsSets } = await supabase
    .from("questions_sets")
    .select("id, questions_json, overall_word_limit, created_at, fund_id, created_by, funds(name)")
    .eq("approved", false)
    .eq("rejected", false)
    .order("created_at", { ascending: false });

  const { data: pendingOrganisations } = await supabase
    .from("organisations")
    .select("id, name, url, description, created_at, created_by")
    .eq("approved", false)
    .eq("rejected", false)
    .order("created_at", { ascending: false });

  return (
    <div>
      <h1 className="text-2xl font-bold">Admin Dashboard</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Manage content and review pending submissions.
      </p>
      <div className="mt-6">
        <AdminTabs
          contentTab={
            <AdminDashboard
              pendingCriteriaSets={pendingCriteriaSets ?? []}
              pendingQuestionsSets={pendingQuestionsSets ?? []}
              pendingOrganisations={pendingOrganisations ?? []}
            />
          }
          metricsTab={
            <div>
              <h2 className="text-lg font-semibold">AI Usage Metrics</h2>
              <p className="mt-1 text-sm text-zinc-500">
                Token consumption, costs, and platform statistics.
              </p>
              <div className="mt-4">
                <AdminMetrics />
              </div>
            </div>
          }
        />
      </div>
    </div>
  );
}
```

**Step 3: Verify the build**

Run: `cd app && npm run build`
Expected: Build succeeds. Tabs render, switching between Content and Metrics works.

**Step 4: Commit**

```bash
cd app && git add src/app/\(dashboard\)/admin/page.tsx src/app/\(dashboard\)/admin/AdminTabs.tsx
git commit -m "feat: add tab layout to admin page"
```

---

### Task 9: Content Management Data Loading

**Files:**
- Modify: `src/app/(dashboard)/admin/page.tsx`
- Create: `src/app/api/admin/content/route.ts`
- Create: `src/app/api/admin/content/orgs/[id]/route.ts`
- Create: `src/app/api/admin/content/funds/[id]/route.ts`

These API routes serve the hierarchical drill-down data.

**Step 1: Write the org list API**

`src/app/api/admin/content/route.ts` — returns all organisations with pending sub-item counts:

```ts
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";

export async function GET() {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  // Fetch all non-rejected organisations
  const { data: orgs, error } = await auth.serviceClient
    .from("organisations")
    .select("id, name, url, description, approved, created_at, created_by")
    .eq("rejected", false)
    .order("name");

  if (error) {
    return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
  }

  // For each org, get pending counts
  const orgsWithCounts = await Promise.all(
    (orgs ?? []).map(async (org) => {
      const [fundsResult, pendingFundsResult] = await Promise.all([
        auth.serviceClient
          .from("funds")
          .select("id", { count: "exact", head: true })
          .eq("organisation_id", org.id)
          .eq("rejected", false),
        auth.serviceClient
          .from("funds")
          .select("id", { count: "exact", head: true })
          .eq("organisation_id", org.id)
          .eq("published", false)
          .eq("rejected", false),
      ]);

      // Get pending criteria/questions counts across all funds in this org
      const { data: orgFunds } = await auth.serviceClient
        .from("funds")
        .select("id")
        .eq("organisation_id", org.id)
        .eq("rejected", false);

      const fundIds = (orgFunds ?? []).map((f) => f.id);
      let pendingSetsCount = 0;

      if (fundIds.length > 0) {
        const [cResult, qResult] = await Promise.all([
          auth.serviceClient
            .from("criteria_sets")
            .select("id", { count: "exact", head: true })
            .in("fund_id", fundIds)
            .eq("approved", false)
            .eq("rejected", false),
          auth.serviceClient
            .from("questions_sets")
            .select("id", { count: "exact", head: true })
            .in("fund_id", fundIds)
            .eq("approved", false)
            .eq("rejected", false),
        ]);
        pendingSetsCount = (cResult.count ?? 0) + (qResult.count ?? 0);
      }

      return {
        ...org,
        total_funds: fundsResult.count ?? 0,
        pending_funds: pendingFundsResult.count ?? 0,
        pending_sets: pendingSetsCount,
        pending_total: (pendingFundsResult.count ?? 0) + pendingSetsCount,
      };
    })
  );

  return NextResponse.json(orgsWithCounts);
}
```

**Step 2: Write the org detail / funds list API**

`src/app/api/admin/content/orgs/[id]/route.ts` — returns funds for an org with pending set counts:

```ts
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { data: funds, error } = await auth.serviceClient
    .from("funds")
    .select("id, name, url, notes, published, created_at, created_by, organisation_id")
    .eq("organisation_id", id)
    .eq("rejected", false)
    .order("name");

  if (error) {
    return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
  }

  const fundsWithCounts = await Promise.all(
    (funds ?? []).map(async (fund) => {
      const [cResult, qResult] = await Promise.all([
        auth.serviceClient
          .from("criteria_sets")
          .select("id", { count: "exact", head: true })
          .eq("fund_id", fund.id)
          .eq("approved", false)
          .eq("rejected", false),
        auth.serviceClient
          .from("questions_sets")
          .select("id", { count: "exact", head: true })
          .eq("fund_id", fund.id)
          .eq("approved", false)
          .eq("rejected", false),
      ]);
      return {
        ...fund,
        pending_criteria: cResult.count ?? 0,
        pending_questions: qResult.count ?? 0,
        pending_total: (cResult.count ?? 0) + (qResult.count ?? 0),
      };
    })
  );

  return NextResponse.json(fundsWithCounts);
}
```

**Step 3: Write the fund detail / sets list API**

`src/app/api/admin/content/funds/[id]/route.ts` — returns criteria and questions sets for a fund:

```ts
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const [criteriaResult, questionsResult] = await Promise.all([
    auth.serviceClient
      .from("criteria_sets")
      .select("id, name, label, description, criteria_json, approved, created_at, created_by")
      .eq("fund_id", id)
      .eq("rejected", false)
      .order("created_at", { ascending: false }),
    auth.serviceClient
      .from("questions_sets")
      .select("id, label, questions_json, overall_word_limit, approved, created_at, created_by")
      .eq("fund_id", id)
      .eq("rejected", false)
      .order("created_at", { ascending: false }),
  ]);

  return NextResponse.json({
    criteria_sets: criteriaResult.data ?? [],
    questions_sets: questionsResult.data ?? [],
  });
}
```

**Step 4: Run build to verify**

Run: `cd app && npm run build`

**Step 5: Commit**

```bash
cd app && git add src/app/api/admin/content/
git commit -m "feat: add content management data loading APIs"
```

---

### Task 10: Organisation Tree Level Component

**Files:**
- Create: `src/app/(dashboard)/admin/AdminContentManagement.tsx`

This is the main Content Management client component that replaces `AdminDashboard` in the content tab.

**Step 1: Build the organisation list component**

`src/app/(dashboard)/admin/AdminContentManagement.tsx`:

A client component that:
1. Fetches `GET /api/admin/content` on mount → list of orgs with pending counts
2. Renders two sections: "Pending Organisations" and "Approved Organisations"
3. Each org row is clickable → expands to show detail panel + funds (fetched on expand)
4. Pending badge shows `pending_total` count (pending funds + pending sets)
5. Action buttons: Approve (pending only), Reject (pending only), Edit, Delete
6. "+ New Organisation" button at top

Key UI patterns:
- Collapsible sections using `useState` for expanded org IDs
- Loading state when fetching funds on expand
- `router.refresh()` + refetch after mutations
- Error toast on failed actions (simple state-based alert, not a library)

This is a large component (~300-400 lines). Structure:
- `OrgRow` sub-component for each org
- `OrgDetail` sub-component for expanded view
- `RejectForm` inline component (text input + confirm/cancel)
- `EditOrgForm` inline component (name, url, description inputs)
- `CreateOrgForm` inline component

**Step 2: Wire into page.tsx**

Replace the `AdminDashboard` usage in the content tab with `AdminContentManagement`.

Update `page.tsx` — the content tab no longer needs server-side pending data (the component fetches its own). Simplify the server component to just do auth + admin check.

**Step 3: Verify it renders**

Run: `cd app && npm run dev`
Navigate to `/admin` and verify the org list loads with pending badges.

**Step 4: Commit**

```bash
cd app && git add src/app/\(dashboard\)/admin/AdminContentManagement.tsx \
  src/app/\(dashboard\)/admin/page.tsx
git commit -m "feat: add organisation tree level to content management"
```

---

### Task 11: Fund Tree Level (Nested Under Org)

**Files:**
- Modify: `src/app/(dashboard)/admin/AdminContentManagement.tsx`

**Step 1: Add fund expansion within OrgDetail**

When an org is expanded and its funds are loaded (from `GET /api/admin/content/orgs/[id]`), render:
- Two sub-sections: "Pending Funds" and "Published Funds"
- Each fund row shows: name, URL, notes snippet, pending_total badge
- Fund rows are clickable → expand to show fund detail + sets (fetched from `GET /api/admin/content/funds/[id]`)
- Fund action buttons: Publish/Unpublish toggle, Edit, Delete, Reassign Org
- "+ New Fund" button within the org

Key additions:
- `FundRow` sub-component
- `FundDetail` sub-component (expanded view with sets)
- `EditFundForm` inline component (name, url, notes, published toggle, org reassignment via `OrganisationSelector`)
- `CreateFundForm` inline component

**Step 2: Verify it renders**

Navigate to `/admin`, expand an org, verify funds load with pending badges.

**Step 3: Commit**

```bash
cd app && git add src/app/\(dashboard\)/admin/AdminContentManagement.tsx
git commit -m "feat: add fund tree level to content management"
```

---

### Task 12: Criteria/Questions Set Tree Level

**Files:**
- Modify: `src/app/(dashboard)/admin/AdminContentManagement.tsx`

**Step 1: Add set display within FundDetail**

When a fund is expanded and its sets are loaded, render:
- "Criteria Sets" section: list of criteria sets (pending first, then approved)
  - Each shows: name, criteria count, approval status badge, date
  - Expandable to show full criteria as rendered cards (reuse `CriteriaPreview` in read-only mode, or render a simpler card list)
  - Actions: Approve (pending), Reject (pending), Amend (pending), Delete
- "Questions Sets" section: same pattern
  - Each shows: label, question count, word limit, approval status badge, date
  - Expandable to show full questions list
  - Actions: Approve (pending), Reject (pending), Amend (pending), Delete
- "+ New Criteria Set" / "+ New Questions Set" buttons

For content display, render criteria/questions JSON as readable cards:
- Criteria: name, weight, sub-questions
- Questions: question text, type, word limits, guidance

**Step 2: Verify it renders end-to-end**

Navigate to `/admin` → expand org → expand fund → verify criteria and questions sets display with full content and action buttons.

**Step 3: Commit**

```bash
cd app && git add src/app/\(dashboard\)/admin/AdminContentManagement.tsx
git commit -m "feat: add criteria/questions set display to content management"
```

---

### Task 13: Amend Flow for Sets

**Files:**
- Modify: `src/app/(dashboard)/admin/AdminContentManagement.tsx`

**Step 1: Add amend action for pending criteria/questions sets**

When "Amend" is clicked on a pending set:
1. Open an inline editor showing the full content
2. For criteria sets: render editable criteria cards (reuse `CriteriaPreview` component with `onChange` handler)
3. For questions sets: render editable questions list (reuse `QuestionsPreview` component with `onChange` handler)
4. "Save Amended" button:
   - POST to `/api/admin/criteria-sets` (or `questions-sets`) with the edited content + `fund_id` from original → creates new auto-approved row
   - PATCH to `/api/admin/criteria-sets/[originalId]/reject` with reason "Amended by admin" → auto-rejects original
   - Refresh the tree
5. "Cancel" button: close editor

**Step 2: Verify the amend flow**

Test: click Amend on a pending criteria set → edit a criterion → save → verify new approved set appears and original is rejected.

**Step 3: Commit**

```bash
cd app && git add src/app/\(dashboard\)/admin/AdminContentManagement.tsx
git commit -m "feat: add amend flow for pending criteria/questions sets"
```

---

### Task 14: Create Forms (All Levels)

**Files:**
- Modify: `src/app/(dashboard)/admin/AdminContentManagement.tsx`

**Step 1: Add create forms at each level**

1. **Create Organisation**: inline form (name required, url optional, description optional). POST to `/api/admin/organisations`.

2. **Create Fund** (within an org): inline form (name required, url optional, notes optional). POST to `/api/admin/funds` with `organisation_id` from parent org.

3. **Create Criteria Set** (within a fund): two options:
   - Paste raw text + AI parse (reuse `CriteriaInput` with `isAdmin=true`)
   - Then preview/edit with `CriteriaPreview`
   - POST to `/api/admin/criteria-sets` with `fund_id` from parent fund

4. **Create Questions Set** (within a fund): same pattern:
   - Paste raw text + AI parse (reuse `QuestionsInput`)
   - Then preview/edit with `QuestionsPreview`
   - POST to `/api/admin/questions-sets` with `fund_id` from parent fund

**Step 2: Verify all create flows**

Test each create form: fill in → submit → verify new item appears in the tree as approved/published.

**Step 3: Commit**

```bash
cd app && git add src/app/\(dashboard\)/admin/AdminContentManagement.tsx
git commit -m "feat: add inline create forms for all entity types"
```

---

### Task 15: Update Existing Queries to Exclude Rejected

**Files:**
- Modify: `src/app/(dashboard)/admin/page.tsx` (if still fetching pending items)
- Modify: `src/app/api/funds/route.ts`
- Modify: `src/app/api/funds/[id]/route.ts`
- Modify: `src/app/api/organisations/route.ts`
- Modify: `src/app/api/funds/my/route.ts`
- Modify: `src/app/(dashboard)/applications/new/` (step components that query funds/sets)

**Step 1: Audit all queries touching the four tables**

Search for `.from("organisations")`, `.from("funds")`, `.from("criteria_sets")`, `.from("questions_sets")` across all API routes and components.

**Step 2: Add `.eq("rejected", false)` where missing**

Note: RLS policies already exclude rejected items for non-admin users (updated in Task 1 migration). However, any queries using the service client (which bypasses RLS) need explicit rejection filtering. Also add the filter to any queries that should not show rejected items even through the cookie client (belt and suspenders).

**Step 3: Run all tests**

Run: `cd app && npm test`
Expected: All tests pass

**Step 4: Commit**

```bash
cd app && git add -u
git commit -m "fix: exclude rejected items from all content queries"
```

---

### Task 16: Clean Up Old AdminDashboard

**Files:**
- Delete: `src/app/(dashboard)/admin/AdminDashboard.tsx`
- Modify: `src/app/(dashboard)/admin/page.tsx` (remove AdminDashboard import)

**Step 1: Remove the old component**

Once `AdminContentManagement` is fully working and replaces all functionality, delete the old `AdminDashboard.tsx`.

**Step 2: Clean up page.tsx**

Remove the old pending data queries from `page.tsx` (they were only needed for `AdminDashboard`). The content tab now uses `AdminContentManagement` which fetches its own data.

Final `page.tsx` should be minimal:
```tsx
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { AdminTabs } from "./AdminTabs";
import { AdminContentManagement } from "./AdminContentManagement";
import { AdminMetrics } from "./AdminMetrics";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();
  if (!profile?.is_admin) redirect("/dashboard");

  return (
    <div>
      <h1 className="text-2xl font-bold">Admin Dashboard</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Manage content and review pending submissions.
      </p>
      <div className="mt-6">
        <AdminTabs
          contentTab={<AdminContentManagement />}
          metricsTab={
            <div>
              <h2 className="text-lg font-semibold">AI Usage Metrics</h2>
              <p className="mt-1 text-sm text-zinc-500">
                Token consumption, costs, and platform statistics.
              </p>
              <div className="mt-4">
                <AdminMetrics />
              </div>
            </div>
          }
        />
      </div>
    </div>
  );
}
```

**Step 3: Run build + tests**

Run: `cd app && npm run build && npm test`
Expected: Build succeeds, all tests pass

**Step 4: Commit**

```bash
cd app && git add -u
git commit -m "chore: remove old AdminDashboard, clean up admin page"
```

---

### Task 17: Final Verification & Cleanup

**Step 1: Run full test suite**

Run: `cd app && npm test`
Expected: All tests pass

**Step 2: Run production build**

Run: `cd app && npm run build`
Expected: Build succeeds

**Step 3: Run linter**

Run: `cd app && npm run lint`
Expected: No errors

**Step 4: Manual smoke test**

Start dev server and verify:
- Tab switching works (Content Management ↔ Metrics)
- Orgs display in approved/pending sections with correct counts
- Expanding org shows funds with pending badges
- Expanding fund shows criteria and questions sets with full content
- Approve action works (item moves from pending to approved)
- Reject action works with optional reason (item disappears)
- Edit action works for orgs and funds
- Delete action works with confirmation (org blocked if has funds)
- Amend action works (new approved set created, original rejected)
- Create forms work at all levels (org, fund, criteria set, questions set)
- Metrics tab unchanged and functional
- Existing user-facing flows unaffected (fund search, application creation)

**Step 5: Commit any final fixes**

```bash
cd app && git add -u
git commit -m "chore: final cleanup and verification"
```
