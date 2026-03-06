# Sidebar Navigation + Breadcrumbs Design

## Problem

1. Dashboard has no sidebar or tabs — just a flat list of applications. Switching between views (Applications, Funds, Billing) requires the user dropdown.
2. Deep pages like `/applications/[id]/review` have no breadcrumb trail to navigate back up the hierarchy.

## Design

### 1. Sidebar (`DashboardSidebar`)

**Layout change:** Dashboard layout shifts from `<DashboardNav> + <main>` to a top nav + left sidebar + content area.

**Top nav (`DashboardNav`):**
- Keeps brand, "New Application" CTA, user dropdown
- Removes Funds/Billing links from dropdown (moved to sidebar)
- Adds hamburger button for mobile sidebar toggle

**Sidebar (`DashboardSidebar`):**
- New client component, ~240px fixed left column on desktop
- Items (top to bottom):
  1. Applications (`/dashboard`)
  2. Funds (`/funds`)
  3. Billing (`/billing`)
  4. Admin (`/admin`) — conditional on `is_admin`
- Active state highlights based on `usePathname()`
- Each item has an icon + label

**Responsive behaviour:**
- Desktop: full sidebar always visible, content area shifts right
- Mobile/tablet: sidebar hidden by default, slides in as overlay with backdrop when hamburger is tapped. Closes on link click or backdrop click.

**Layout structure:**
```tsx
<div className="min-h-screen">
  <DashboardNav />                    {/* full width top bar */}
  <div className="flex">
    <DashboardSidebar />              {/* fixed left on desktop, overlay on mobile */}
    <main className="flex-1">
      <Breadcrumbs />
      {children}
    </main>
  </div>
</div>
```

### 2. Breadcrumbs

**`BreadcrumbProvider` + `Breadcrumbs` component:**

- `BreadcrumbProvider` — React context in the dashboard layout. Holds a `labels` map (`Record<string, string>`) for dynamic segment display names.
- `useBreadcrumbLabels(labels)` — Hook that pages call to register labels for dynamic segments. E.g. the application form page calls `useBreadcrumbLabels({ [id]: application.title })`.
- `Breadcrumbs` — Client component rendered at the top of the content area. Parses `usePathname()`, splits into segments, maps static segments via a lookup table, resolves dynamic segments from context.

**Static segment map:**
```ts
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
};
```

**Example breadcrumbs:**
- `/dashboard` → (no breadcrumbs, it's the root)
- `/applications/abc123` → `Applications / My Grant App`
- `/applications/abc123/review` → `Applications / My Grant App / Review`
- `/funds/def456/questions-sets/new` → `Funds / UKRI Grant / Question Sets / New`

**Label registration:** Each page that has dynamic segments wraps content in a client component that calls `useBreadcrumbLabels`. Pages already fetch application/fund data, so no extra queries needed.

## Props/Data Flow

- `DashboardLayout` passes `is_admin` to `DashboardSidebar`
- `BreadcrumbProvider` wraps `{children}` in the layout
- Individual pages use a client wrapper to call `useBreadcrumbLabels({ [dynamicId]: displayName })`
- `Breadcrumbs` reads from context + pathname to render the trail

## Files to Create/Modify

### New files:
- `src/components/DashboardSidebar.tsx` — sidebar component
- `src/components/Breadcrumbs.tsx` — breadcrumb provider, hook, and display component

### Modified files:
- `src/app/(dashboard)/layout.tsx` — add sidebar + breadcrumb provider to layout
- `src/components/DashboardNav.tsx` — remove Funds/Billing from dropdown, add mobile hamburger
- `src/app/(dashboard)/applications/[id]/page.tsx` — register breadcrumb label
- `src/app/(dashboard)/applications/[id]/review/page.tsx` — register breadcrumb label
- `src/app/(dashboard)/applications/[id]/history/page.tsx` — register breadcrumb label
- `src/app/(dashboard)/funds/[id]/page.tsx` — register breadcrumb label
- `src/app/(dashboard)/funds/[id]/questions-sets/new/page.tsx` — register breadcrumb label
- `src/app/(dashboard)/admin/orgs/[orgId]/page.tsx` — register breadcrumb label
- `src/app/(dashboard)/admin/orgs/[orgId]/funds/[fundId]/page.tsx` — register breadcrumb labels
- `src/app/(dashboard)/admin/orgs/[orgId]/funds/[fundId]/new-set/[type]/page.tsx` — register breadcrumb labels
- `src/app/(dashboard)/admin/orgs/[orgId]/funds/[fundId]/sets/[setId]/page.tsx` — register breadcrumb labels
