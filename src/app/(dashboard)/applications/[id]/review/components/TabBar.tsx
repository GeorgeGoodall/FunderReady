"use client";

import type { TabId } from "../types";

interface TabDef {
  id: TabId;
  label: string;
  badge?: number;
}

export function TabBar({
  tabs,
  activeTab,
  onTabChange,
}: {
  tabs: TabDef[];
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
}) {
  return (
    <div className="overflow-x-auto -mx-1">
      <div className="flex min-w-max border-b border-zinc-200 dark:border-zinc-800">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onTabChange(tab.id)}
              className={`relative shrink-0 px-4 py-2.5 text-sm font-medium transition-colors ${
                isActive
                  ? "text-blue-600 dark:text-blue-400"
                  : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300"
              }`}
            >
              <span className="flex items-center gap-1.5">
                {tab.label}
                {tab.badge !== undefined && tab.badge > 0 && (
                  <span className={`inline-flex items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-medium leading-none ${
                    isActive
                      ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                      : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                  }`}>
                    {tab.badge}
                  </span>
                )}
              </span>
              {isActive && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 dark:bg-blue-400" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
