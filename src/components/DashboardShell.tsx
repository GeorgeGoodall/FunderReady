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
  tier: "free" | "pro";
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
