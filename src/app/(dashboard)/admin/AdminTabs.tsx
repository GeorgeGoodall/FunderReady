"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { ReactNode, Suspense } from "react";

interface AdminTabsProps {
  contentTab: ReactNode;
  metricsTab: ReactNode;
}

function AdminTabsInner({ contentTab, metricsTab }: AdminTabsProps) {
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

export function AdminTabs(props: AdminTabsProps) {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <AdminTabsInner {...props} />
    </Suspense>
  );
}
