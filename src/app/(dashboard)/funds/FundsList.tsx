"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Fund = {
  id: string;
  name: string;
  funder_organisation: string | null;
  url: string | null;
  published: boolean;
  created_at: string;
};

export function FundsList({ funds: initialFunds }: { funds: Fund[] }) {
  const router = useRouter();
  const [funds, setFunds] = useState(initialFunds);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/funds/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed");
      setFunds((prev) => prev.filter((f) => f.id !== id));
      setConfirmingId(null);
      router.refresh();
    } catch {
      alert("Failed to remove fund. Please try again.");
    } finally {
      setDeletingId(null);
    }
  }

  if (funds.length === 0) {
    return (
      <div className="mt-16 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800">
          <svg
            className="h-8 w-8 text-zinc-400"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008h-.008v-.008Zm0 3h.008v.008h-.008v-.008Zm0 3h.008v.008h-.008v-.008Z"
            />
          </svg>
        </div>
        <h2 className="text-lg font-semibold">No funds yet</h2>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Funds are created when you start a new application.
        </p>
      </div>
    );
  }

  return (
    <ul className="mt-6 divide-y divide-zinc-200 dark:divide-zinc-800">
      {funds.map((fund) => (
        <li key={fund.id} className="flex items-center justify-between gap-4 py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="truncate font-medium">{fund.name}</span>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                  fund.published
                    ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400"
                    : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                }`}
              >
                {fund.published ? "Published" : "Unpublished"}
              </span>
            </div>
            {fund.funder_organisation && (
              <p className="mt-0.5 truncate text-sm text-zinc-500 dark:text-zinc-400">
                {fund.funder_organisation}
              </p>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {confirmingId === fund.id ? (
              <>
                <span className="text-sm text-zinc-600 dark:text-zinc-400">Remove?</span>
                <button
                  onClick={() => handleDelete(fund.id)}
                  disabled={deletingId === fund.id}
                  className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
                >
                  {deletingId === fund.id ? "Removing…" : "Yes, remove"}
                </button>
                <button
                  onClick={() => setConfirmingId(null)}
                  className="rounded-md px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                >
                  Cancel
                </button>
              </>
            ) : (
              <button
                onClick={() => setConfirmingId(fund.id)}
                className="rounded-md px-3 py-1.5 text-xs font-medium text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-red-600 dark:hover:bg-zinc-800 dark:hover:text-red-400"
              >
                Remove
              </button>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
