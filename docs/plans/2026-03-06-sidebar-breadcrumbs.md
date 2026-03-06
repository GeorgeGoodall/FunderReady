# Sidebar Navigation + Breadcrumbs Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a responsive sidebar for top-level navigation and automatic breadcrumbs for deep page hierarchy traversal.

**Architecture:** New `BreadcrumbProvider` context + `Breadcrumbs` client component for automatic path-based breadcrumbs with dynamic label registration. New `DashboardSidebar` client component for responsive sidebar (always visible on desktop, hamburger overlay on mobile). Layout restructured to flex container with sidebar + content area.

**Tech Stack:** React 19, Next.js 16 App Router, Tailwind CSS v4, `usePathname()` from `next/navigation`

---

### Task 1: Create Breadcrumb Context and Component

**Files:**
- Create: `src/components/Breadcrumbs.tsx`

**Step 1: Write the test file**

Create `src/components/__tests__/Breadcrumbs.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { BreadcrumbProvider, Breadcrumbs, BreadcrumbLabels } from "../Breadcrumbs";

// Mock next/navigation
const mockPathname = vi.fn(() => "/dashboard");
vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname(),
}));

describe("Breadcrumbs", () => {
  it("renders nothing on root dashboard page", () => {
    mockPathname.mockReturnValue("/dashboard");
    const { container } = render(
      <BreadcrumbProvider>
        <Breadcrumbs />
      </BreadcrumbProvider>
    );
    expect(container.querySelector("nav")).toBeNull();
  });

  it("renders static segments for /funds", () => {
    mockPathname.mockReturnValue("/funds");
    render(
      <BreadcrumbProvider>
        <Breadcrumbs />
      </BreadcrumbProvider>
    );
    expect(screen.getByText("Funds")).toBeInTheDocument();
  });

  it("renders breadcrumbs with dynamic label", () => {
    mockPathname.mockReturnValue("/applications/abc123/review");
    render(
      <BreadcrumbProvider>
        <BreadcrumbLabels labels={{ abc123: "My Grant App" }} />
        <Breadcrumbs />
      </BreadcrumbProvider>
    );
    expect(screen.getByText("Applications")).toBeInTheDocument();
    expect(screen.getByText("My Grant App")).toBeInTheDocument();
    expect(screen.getByText("Review")).toBeInTheDocument();
  });

  it("falls back to segment value when no label registered", () => {
    mockPathname.mockReturnValue("/applications/abc123");
    render(
      <BreadcrumbProvider>
        <Breadcrumbs />
      </BreadcrumbProvider>
    );
    expect(screen.getByText("Applications")).toBeInTheDocument();
    expect(screen.getByText("abc123")).toBeInTheDocument();
  });

  it("renders links for non-terminal segments", () => {
    mockPathname.mockReturnValue("/applications/abc123/review");
    render(
      <BreadcrumbProvider>
        <BreadcrumbLabels labels={{ abc123: "My Grant App" }} />
        <Breadcrumbs />
      </BreadcrumbProvider>
    );
    const appLink = screen.getByRole("link", { name: "Applications" });
    expect(appLink).toHaveAttribute("href", "/dashboard");
    const grantLink = screen.getByRole("link", { name: "My Grant App" });
    expect(grantLink).toHaveAttribute("href", "/applications/abc123");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd app && npx vitest run src/components/__tests__/Breadcrumbs.test.tsx`
Expected: FAIL — module not found

**Step 3: Write the implementation**

Create `src/components/Breadcrumbs.tsx`:

```tsx
"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

// --- Context ---

interface BreadcrumbContextValue {
  labels: Record<string, string>;
  registerLabels: (labels: Record<string, string>) => void;
}

const BreadcrumbContext = createContext<BreadcrumbContextValue>({
  labels: {},
  registerLabels: () => {},
});

export function BreadcrumbProvider({ children }: { children: ReactNode }) {
  const [labels, setLabels] = useState<Record<string, string>>({});
  const pathname = usePathname();

  // Clear labels on navigation
  useEffect(() => {
    setLabels({});
  }, [pathname]);

  const registerLabels = (newLabels: Record<string, string>) => {
    setLabels((prev) => ({ ...prev, ...newLabels }));
  };

  return (
    <BreadcrumbContext.Provider value={{ labels, registerLabels }}>
      {children}
    </BreadcrumbContext.Provider>
  );
}

// --- Label registration component (used by server pages) ---

export function BreadcrumbLabels({ labels }: { labels: Record<string, string> }) {
  const { registerLabels } = useContext(BreadcrumbContext);
  useEffect(() => {
    registerLabels(labels);
  }, [labels, registerLabels]);
  return null;
}

// --- Static segment labels ---

const SEGMENT_LABELS: Record<string, string> = {
  dashboard: "Applications",
  applications: "Applications",
  funds: "Funds",
  billing: "Billing",
  admin: "Admin",
  review: "Review",
  history: "History",
  new: "New",
  "questions-sets": "Question Sets",
  orgs: "Organisations",
  sets: "Sets",
  "new-set": "New Set",
  metrics: "Metrics",
};

// Map first-segment routes to their href (some differ from URL path)
const SEGMENT_HREFS: Record<string, string> = {
  applications: "/dashboard",
  dashboard: "/dashboard",
};

// --- Root pages that should not show breadcrumbs ---
const ROOT_PAGES = new Set(["/dashboard", "/funds", "/billing", "/admin", "/admin/metrics"]);

// --- Breadcrumbs display ---

export function Breadcrumbs() {
  const { labels } = useContext(BreadcrumbContext);
  const pathname = usePathname();

  if (ROOT_PAGES.has(pathname)) return null;

  const segments = pathname.split("/").filter(Boolean);
  if (segments.length <= 1) return null;

  // Build crumbs: each has a label and href
  const crumbs: Array<{ label: string; href: string }> = [];

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    const href = "/" + segments.slice(0, i + 1).join("/");

    // Use static label, then context label, then raw segment
    const label = SEGMENT_LABELS[segment] ?? labels[segment] ?? segment;

    // Override href for first segment if mapped
    const resolvedHref = i === 0 ? (SEGMENT_HREFS[segment] ?? href) : href;

    crumbs.push({ label, href: resolvedHref });
  }

  return (
    <nav aria-label="Breadcrumb" className="mb-4 flex items-center gap-1 text-sm text-zinc-500 dark:text-zinc-400">
      {crumbs.map((crumb, i) => {
        const isLast = i === crumbs.length - 1;
        return (
          <span key={crumb.href} className="flex items-center gap-1">
            {i > 0 && (
              <svg className="h-3.5 w-3.5 text-zinc-300 dark:text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            )}
            {isLast ? (
              <span className="text-zinc-900 dark:text-zinc-100">{crumb.label}</span>
            ) : (
              <Link href={crumb.href} className="hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors">
                {crumb.label}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
```

**Step 4: Run tests to verify they pass**

Run: `cd app && npx vitest run src/components/__tests__/Breadcrumbs.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add src/components/Breadcrumbs.tsx src/components/__tests__/Breadcrumbs.test.tsx
git commit -m "feat: add breadcrumb context, labels component, and display"
```

---

### Task 2: Create DashboardSidebar Component

**Files:**
- Create: `src/components/DashboardSidebar.tsx`

**Step 1: Write the test file**

Create `src/components/__tests__/DashboardSidebar.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { DashboardSidebar } from "../DashboardSidebar";

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
}));

describe("DashboardSidebar", () => {
  it("renders core navigation items", () => {
    render(<DashboardSidebar isAdmin={false} isOpen={false} onClose={() => {}} />);
    expect(screen.getByText("Applications")).toBeInTheDocument();
    expect(screen.getByText("Funds")).toBeInTheDocument();
    expect(screen.getByText("Billing")).toBeInTheDocument();
  });

  it("shows Admin link when isAdmin is true", () => {
    render(<DashboardSidebar isAdmin={true} isOpen={false} onClose={() => {}} />);
    expect(screen.getByText("Admin")).toBeInTheDocument();
  });

  it("hides Admin link when isAdmin is false", () => {
    render(<DashboardSidebar isAdmin={false} isOpen={false} onClose={() => {}} />);
    expect(screen.queryByText("Admin")).toBeNull();
  });

  it("highlights active item based on pathname", () => {
    render(<DashboardSidebar isAdmin={false} isOpen={false} onClose={() => {}} />);
    const appLink = screen.getByRole("link", { name: /Applications/ });
    expect(appLink.className).toContain("bg-zinc-100");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd app && npx vitest run src/components/__tests__/DashboardSidebar.test.tsx`
Expected: FAIL — module not found

**Step 3: Write the implementation**

Create `src/components/DashboardSidebar.tsx`:

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  matchPrefixes: string[];
}

const NAV_ITEMS: NavItem[] = [
  {
    label: "Applications",
    href: "/dashboard",
    matchPrefixes: ["/dashboard", "/applications"],
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
      </svg>
    ),
  },
  {
    label: "Funds",
    href: "/funds",
    matchPrefixes: ["/funds"],
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z" />
      </svg>
    ),
  },
  {
    label: "Billing",
    href: "/billing",
    matchPrefixes: ["/billing"],
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25v10.5A2.25 2.25 0 0 0 4.5 19.5Z" />
      </svg>
    ),
  },
];

const ADMIN_ITEM: NavItem = {
  label: "Admin",
  href: "/admin",
  matchPrefixes: ["/admin"],
  icon: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
    </svg>
  ),
};

export function DashboardSidebar({
  isAdmin,
  isOpen,
  onClose,
}: {
  isAdmin: boolean;
  isOpen: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();

  const items = isAdmin ? [...NAV_ITEMS, ADMIN_ITEM] : NAV_ITEMS;

  function isActive(item: NavItem) {
    return item.matchPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(prefix + "/"));
  }

  const navContent = (
    <nav className="flex flex-col gap-1 px-3 py-4">
      {items.map((item) => {
        const active = isActive(item);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onClose}
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              active
                ? "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
                : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800/50 dark:hover:text-zinc-100"
            }`}
          >
            {item.icon}
            {item.label}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <>
      {/* Desktop sidebar — always visible */}
      <aside className="hidden md:block w-60 shrink-0 border-r border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 min-h-[calc(100vh-57px)]">
        {navContent}
      </aside>

      {/* Mobile overlay */}
      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/30 md:hidden"
            onClick={onClose}
          />
          <aside className="fixed inset-y-0 left-0 z-50 w-60 bg-white dark:bg-zinc-900 shadow-xl md:hidden pt-14">
            {navContent}
          </aside>
        </>
      )}
    </>
  );
}
```

**Step 4: Run tests to verify they pass**

Run: `cd app && npx vitest run src/components/__tests__/DashboardSidebar.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add src/components/DashboardSidebar.tsx src/components/__tests__/DashboardSidebar.test.tsx
git commit -m "feat: add responsive sidebar navigation component"
```

---

### Task 3: Update DashboardNav — Remove Sidebar Links, Add Hamburger

**Files:**
- Modify: `src/components/DashboardNav.tsx`

**Step 1: Update the component**

Changes to `DashboardNav.tsx`:
- Add `onMenuToggle` prop for mobile hamburger
- Remove the "Manage Funds" and "Billing" links from the dropdown (they're now in the sidebar)
- Add a hamburger button before the brand on mobile

The updated component should accept these new props:

```tsx
export function DashboardNav({
  displayName,
  tier,
  onMenuToggle,
}: {
  displayName: string;
  tier: string;
  onMenuToggle?: () => void;
})
```

Add hamburger button inside the nav, before the brand link:

```tsx
{/* Mobile hamburger */}
{onMenuToggle && (
  <button
    onClick={onMenuToggle}
    className="mr-2 rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100 md:hidden dark:text-zinc-400 dark:hover:bg-zinc-800"
    aria-label="Toggle menu"
  >
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
    </svg>
  </button>
)}
```

Remove the "Manage Funds" `<Link>` (lines 104-110) and "Billing" `<Link>` (lines 111-117) from the dropdown.

**Step 2: Run existing tests (if any) + build check**

Run: `cd app && npx vitest run src/components/__tests__/DashboardNav` (may not exist — that's fine)
Run: `cd app && npx tsc --noEmit` to verify types

**Step 3: Commit**

```bash
git add src/components/DashboardNav.tsx
git commit -m "feat: add hamburger button to nav, remove sidebar-duplicated links"
```

---

### Task 4: Wire Sidebar + Breadcrumbs into Dashboard Layout

**Files:**
- Modify: `src/app/(dashboard)/layout.tsx`

**Step 1: Update the layout**

The layout needs to:
1. Fetch `is_admin` from the profile
2. Wrap children in `BreadcrumbProvider`
3. Add a client wrapper for sidebar state (since layout is a server component)

Create a client layout wrapper `src/components/DashboardShell.tsx`:

```tsx
"use client";

import { useState } from "react";
import { DashboardNav } from "@/components/DashboardNav";
import { DashboardSidebar } from "@/components/DashboardSidebar";
import { BreadcrumbProvider, Breadcrumbs } from "@/components/Breadcrumbs";

export function DashboardShell({
  displayName,
  tier,
  isAdmin,
  children,
}: {
  displayName: string;
  tier: string;
  isAdmin: boolean;
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <DashboardNav
        displayName={displayName}
        tier={tier}
        onMenuToggle={() => setSidebarOpen((v) => !v)}
      />
      <div className="flex">
        <DashboardSidebar
          isAdmin={isAdmin}
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />
        <main className="flex-1 min-w-0 px-4 py-8 sm:px-6 lg:px-8 max-w-5xl">
          <BreadcrumbProvider>
            <Breadcrumbs />
            {children}
          </BreadcrumbProvider>
        </main>
      </div>
    </div>
  );
}
```

Update `src/app/(dashboard)/layout.tsx` to:

```tsx
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/DashboardShell";

export default async function DashboardLayout({
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
    .select("display_name, subscription_tier, is_admin")
    .eq("id", user.id)
    .single();

  return (
    <DashboardShell
      displayName={profile?.display_name ?? user.email ?? "User"}
      tier={profile?.subscription_tier ?? "free"}
      isAdmin={profile?.is_admin ?? false}
    >
      {children}
    </DashboardShell>
  );
}
```

**Step 2: Verify build compiles**

Run: `cd app && npx tsc --noEmit`
Expected: no errors

**Step 3: Commit**

```bash
git add src/components/DashboardShell.tsx src/app/\(dashboard\)/layout.tsx
git commit -m "feat: wire sidebar and breadcrumbs into dashboard layout"
```

---

### Task 5: Add Breadcrumb Labels to Application Pages

**Files:**
- Modify: `src/app/(dashboard)/applications/[id]/page.tsx`
- Modify: `src/app/(dashboard)/applications/[id]/review/page.tsx`
- Modify: `src/app/(dashboard)/applications/[id]/history/page.tsx`

**Step 1: Add BreadcrumbLabels to application form page**

In `src/app/(dashboard)/applications/[id]/page.tsx`, add at the top of the return, before `<ApplicationFormClient>`:

```tsx
import { BreadcrumbLabels } from "@/components/Breadcrumbs";

// ... in the return:
return (
  <>
    <BreadcrumbLabels labels={{ [id]: application.title || "Untitled" }} />
    <ApplicationFormClient ... />
  </>
);
```

**Step 2: Add BreadcrumbLabels to review page**

In `src/app/(dashboard)/applications/[id]/review/page.tsx`, add before `<ApplicationReviewClient>`:

```tsx
import { BreadcrumbLabels } from "@/components/Breadcrumbs";

// ... in the return:
return (
  <>
    <BreadcrumbLabels labels={{ [id]: application.title || "Untitled" }} />
    <ApplicationReviewClient ... />
  </>
);
```

**Step 3: Add BreadcrumbLabels to history page**

In `src/app/(dashboard)/applications/[id]/history/page.tsx`, add before `<HistoryClient>`:

```tsx
import { BreadcrumbLabels } from "@/components/Breadcrumbs";

// ... in the return:
return (
  <>
    <BreadcrumbLabels labels={{ [id]: application.title || "Untitled" }} />
    <HistoryClient ... />
  </>
);
```

**Step 4: Verify build**

Run: `cd app && npx tsc --noEmit`
Expected: no errors

**Step 5: Commit**

```bash
git add src/app/\(dashboard\)/applications/
git commit -m "feat: add breadcrumb labels to application pages"
```

---

### Task 6: Add Breadcrumb Labels to Fund Pages

**Files:**
- Modify: `src/app/(dashboard)/funds/[id]/page.tsx`
- Modify: `src/app/(dashboard)/funds/[id]/questions-sets/new/page.tsx`

**Step 1: Add BreadcrumbLabels to fund detail page**

In `src/app/(dashboard)/funds/[id]/page.tsx`, add before `<FundDetailClient>`:

```tsx
import { BreadcrumbLabels } from "@/components/Breadcrumbs";

// ... in the return:
return (
  <>
    <BreadcrumbLabels labels={{ [id]: fund.name }} />
    <FundDetailClient ... />
  </>
);
```

**Step 2: Add BreadcrumbLabels to new questions set page**

In `src/app/(dashboard)/funds/[id]/questions-sets/new/page.tsx`, the dynamic segment is `id` (fundId). Add:

```tsx
import { BreadcrumbLabels } from "@/components/Breadcrumbs";

// ... in the return (fundId from params, fund.name already fetched):
return (
  <>
    <BreadcrumbLabels labels={{ [fundId]: fund.name }} />
    <NewQuestionsSetClient ... />
  </>
);
```

Note: the param is destructured as `id` but renamed to `fundId`. Use the original `id` value since that's what appears in the URL path.

Actually, looking at the code: `const { id: fundId } = await params;` — the URL segment is `id` but the variable is `fundId`. The breadcrumb context matches URL segments, so use the value of `fundId` (which equals the `[id]` URL segment):

```tsx
<BreadcrumbLabels labels={{ [fundId]: fund.name }} />
```

This works because `fundId` holds the actual UUID from the URL.

**Step 3: Verify build**

Run: `cd app && npx tsc --noEmit`
Expected: no errors

**Step 4: Commit**

```bash
git add src/app/\(dashboard\)/funds/
git commit -m "feat: add breadcrumb labels to fund pages"
```

---

### Task 7: Add Breadcrumb Labels to Admin Pages + Remove Hand-Rolled Breadcrumbs

**Files:**
- Modify: `src/app/(dashboard)/admin/orgs/[orgId]/page.tsx`
- Modify: `src/app/(dashboard)/admin/orgs/[orgId]/funds/[fundId]/page.tsx`
- Modify: `src/app/(dashboard)/admin/orgs/[orgId]/funds/[fundId]/new-set/[type]/page.tsx`
- Modify: `src/app/(dashboard)/admin/orgs/[orgId]/funds/[fundId]/sets/[setId]/page.tsx`

These admin pages already have hand-rolled `<nav>` breadcrumbs that should be **removed** and replaced with `<BreadcrumbLabels>`.

**Step 1: Update org detail page (`admin/orgs/[orgId]/page.tsx`)**

- Remove the hand-rolled breadcrumb `<nav>` block (lines 36-42)
- Add `BreadcrumbLabels`:

```tsx
import { BreadcrumbLabels } from "@/components/Breadcrumbs";

// ... in the return, before the space-y-8 div contents:
return (
  <>
    <BreadcrumbLabels labels={{ [orgId]: org.name }} />
    <div className="space-y-8">
      {/* Remove the old <nav> breadcrumb block */}
      {/* Org Header */}
      ...
    </div>
  </>
);
```

**Step 2: Update fund detail page (`admin/orgs/[orgId]/funds/[fundId]/page.tsx`)**

- Remove hand-rolled breadcrumb `<nav>` block (lines 256-262)
- Add:

```tsx
import { BreadcrumbLabels } from "@/components/Breadcrumbs";

return (
  <>
    <BreadcrumbLabels labels={{ [orgId]: org.name, [fundId]: fund.name }} />
    <div className="space-y-8">
      {/* Remove old breadcrumb nav */}
      ...
    </div>
  </>
);
```

**Step 3: Update new-set page (`admin/orgs/[orgId]/funds/[fundId]/new-set/[type]/page.tsx`)**

- Remove hand-rolled breadcrumb `<nav>` block (lines 50-58)
- Add:

```tsx
import { BreadcrumbLabels } from "@/components/Breadcrumbs";

return (
  <>
    <BreadcrumbLabels labels={{ [orgId]: org.name, [fundId]: fund.name, [type]: `New ${label}` }} />
    <div className="space-y-8">
      {/* Remove old breadcrumb nav */}
      ...
    </div>
  </>
);
```

**Step 4: Update set detail page (`admin/orgs/[orgId]/funds/[fundId]/sets/[setId]/page.tsx`)**

- Remove hand-rolled breadcrumb `<nav>` block (lines 117-134)
- Add:

```tsx
import { BreadcrumbLabels } from "@/components/Breadcrumbs";

return (
  <>
    <BreadcrumbLabels labels={{ [orgId]: org.name, [fundId]: fund.name, [setId]: setName }} />
    <div className="space-y-8">
      {/* Remove old breadcrumb nav */}
      ...
    </div>
  </>
);
```

**Step 5: Verify build**

Run: `cd app && npx tsc --noEmit`
Expected: no errors

**Step 6: Commit**

```bash
git add src/app/\(dashboard\)/admin/
git commit -m "feat: replace hand-rolled admin breadcrumbs with BreadcrumbLabels"
```

---

### Task 8: Run Full Test Suite + Build Verification

**Step 1: Run all tests**

Run: `cd app && npm test`
Expected: all tests pass

**Step 2: Run production build**

Run: `cd app && npm run build`
Expected: build succeeds

**Step 3: Manual smoke test**

Run: `cd app && npm run dev`

Verify:
- Sidebar visible on desktop with Applications, Funds, Billing items
- Active item highlighted based on current page
- Clicking sidebar items navigates correctly
- On mobile viewport: sidebar hidden, hamburger shows, tapping opens overlay
- Breadcrumbs appear on deep pages (e.g. `/applications/[id]/review`)
- Breadcrumbs show correct labels (application title, fund name)
- Breadcrumb links navigate correctly
- No breadcrumbs on root pages (`/dashboard`, `/funds`, `/billing`)
- Admin pages show breadcrumbs (no more hand-rolled ones)
- "Manage Funds" and "Billing" removed from user dropdown

**Step 4: Commit any fixes if needed**
