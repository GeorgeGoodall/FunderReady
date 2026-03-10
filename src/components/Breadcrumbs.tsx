"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
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
  const [labelsPerPath, setLabelsPerPath] = useState<Record<string, Record<string, string>>>({});
  const pathname = usePathname();

  // Labels are scoped to the current pathname — stale labels from previous paths are ignored automatically
  const labels = useMemo(() => labelsPerPath[pathname] ?? {}, [labelsPerPath, pathname]);

  const registerLabels = useCallback((newLabels: Record<string, string>) => {
    setLabelsPerPath((prev) => ({
      ...prev,
      [pathname]: { ...(prev[pathname] ?? {}), ...newLabels },
    }));
  }, [pathname]);

  return (
    <BreadcrumbContext.Provider value={{ labels, registerLabels }}>
      {children}
    </BreadcrumbContext.Provider>
  );
}

// --- Label registration component (used by server pages) ---

export function BreadcrumbLabels({ labels }: { labels: Record<string, string> }) {
  const { registerLabels } = useContext(BreadcrumbContext);
  const serialized = useMemo(() => JSON.stringify(labels), [labels]);
  useEffect(() => {
    registerLabels(JSON.parse(serialized));
  }, [registerLabels, serialized]);
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
