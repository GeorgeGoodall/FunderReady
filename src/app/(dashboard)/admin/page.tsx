import { getOrgsWithCounts } from "./lib/admin-queries";
import { formatDate, truncate } from "./lib/format";
import Link from "next/link";
import { AdminCreateForm } from "./components/AdminCreateForm";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const orgs = await getOrgsWithCounts();

  const pendingOrgs = orgs.filter((o) => !o.approved);
  const approvedOrgs = orgs.filter((o) => o.approved);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <p className="text-sm text-zinc-500">
          Manage organisations, funds, and content sets.
        </p>
        <AdminCreateForm entityType="org" />
      </div>

      {pendingOrgs.length > 0 && (
        <section>
          <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-2">
            Pending Organisations ({pendingOrgs.length})
          </h2>
          <div className="space-y-2">
            {pendingOrgs.map((org) => (
              <Link
                key={org.id}
                href={`/admin/orgs/${org.id}`}
                className="block bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg p-4 hover:bg-zinc-50 dark:hover:bg-zinc-750"
              >
                <div className="flex items-center gap-2">
                  <span className="font-medium text-zinc-900 dark:text-zinc-100">
                    {org.name}
                  </span>
                  <span className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 text-xs px-2 py-0.5 rounded-full">
                    pending
                  </span>
                  {org.pending_total > 0 && (
                    <span className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 text-xs px-2 py-0.5 rounded-full">
                      {org.pending_total} pending items
                    </span>
                  )}
                </div>
                {org.description && (
                  <p className="text-sm text-zinc-500 mt-0.5">
                    {truncate(org.description, 100)}
                  </p>
                )}
                <p className="text-xs text-zinc-400 mt-0.5">
                  {org.total_funds} fund{org.total_funds !== 1 ? "s" : ""} &middot;{" "}
                  {formatDate(org.created_at)}
                </p>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-2">
          Approved Organisations ({approvedOrgs.length})
        </h2>
        {approvedOrgs.length === 0 ? (
          <p className="text-sm text-zinc-500">No approved organisations yet.</p>
        ) : (
          <div className="space-y-2">
            {approvedOrgs.map((org) => (
              <Link
                key={org.id}
                href={`/admin/orgs/${org.id}`}
                className="block bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg p-4 hover:bg-zinc-50 dark:hover:bg-zinc-750"
              >
                <div className="flex items-center gap-2">
                  <span className="font-medium text-zinc-900 dark:text-zinc-100">
                    {org.name}
                  </span>
                  {org.pending_total > 0 && (
                    <span className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 text-xs px-2 py-0.5 rounded-full">
                      {org.pending_total} pending
                    </span>
                  )}
                </div>
                {org.description && (
                  <p className="text-sm text-zinc-500 mt-0.5">
                    {truncate(org.description, 100)}
                  </p>
                )}
                <p className="text-xs text-zinc-400 mt-0.5">
                  {org.total_funds} fund{org.total_funds !== 1 ? "s" : ""} &middot;{" "}
                  {formatDate(org.created_at)}
                </p>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
