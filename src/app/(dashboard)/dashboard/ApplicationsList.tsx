"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface Application {
  id: string;
  title: string | null;
  status: string;
  review_count: number;
  updated_at: string;
  fund_id: string;
  funds: { name: string }[] | null;
}

export function ApplicationsList({ applications }: { applications: Application[] }) {
  const router = useRouter();
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const confirmApp = applications.find((a) => a.id === confirmId);

  const handleDelete = async () => {
    if (!confirmId) return;
    setDeleting(true);
    try {
      await fetch(`/api/applications/${confirmId}`, { method: "DELETE" });
      setConfirmId(null);
      router.refresh();
    } catch {
      // silently ignore — page will still show old data
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <div className="mt-6 space-y-3">
        {applications.map((app) => {
          const fundName = app.funds?.[0]?.name;
          return (
            <div
              key={app.id}
              className="group relative flex items-center rounded-lg border border-zinc-200 bg-white transition-colors hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700"
            >
              <Link
                href={`/applications/${app.id}`}
                className="flex-1 p-4"
              >
                <div className="flex items-center justify-between pr-8">
                  <span className="font-medium">
                    {app.title ?? fundName ?? "Untitled application"}
                  </span>
                  <ApplicationStatusBadge status={app.status} />
                </div>
                <div className="mt-1 flex items-center gap-3 text-xs text-zinc-500">
                  {fundName && <span>{fundName}</span>}
                  <span>
                    Updated{" "}
                    {new Date(app.updated_at).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </span>
                  {app.review_count > 0 && (
                    <span>
                      {app.review_count} review{app.review_count !== 1 ? "s" : ""}
                    </span>
                  )}
                </div>
              </Link>
              <button
                type="button"
                onClick={(e) => { e.preventDefault(); setConfirmId(app.id); }}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-zinc-400 opacity-0 transition-opacity hover:bg-red-50 hover:text-red-500 group-hover:opacity-100 dark:hover:bg-red-900/20 dark:hover:text-red-400"
                title="Delete application"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                </svg>
              </button>
            </div>
          );
        })}
      </div>

      {/* Delete confirmation modal */}
      {confirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl dark:bg-zinc-900">
            <h2 className="text-lg font-semibold">Delete application?</h2>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              This will permanently delete{" "}
              <span className="font-medium text-zinc-900 dark:text-zinc-100">
                {confirmApp?.title ?? confirmApp?.funds?.[0]?.name ?? "Untitled application"}
              </span>{" "}
              and all its answers and reviews. This cannot be undone.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfirmId(null)}
                disabled={deleting}
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {deleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ApplicationStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    draft: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
    submitted_for_review: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    reviewing: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    reviewed: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  };
  const labels: Record<string, string> = {
    draft: "Draft",
    submitted_for_review: "Submitted",
    reviewing: "Reviewing",
    reviewed: "Reviewed",
  };
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${styles[status] ?? styles.draft}`}>
      {labels[status] ?? status}
    </span>
  );
}
