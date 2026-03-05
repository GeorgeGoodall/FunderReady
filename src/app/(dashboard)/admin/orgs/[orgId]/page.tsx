import { createServiceClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getFundsForOrg } from "../../lib/admin-queries";
import { AdminActionBar } from "../../components/AdminActionBar";
import { AdminCreateForm } from "../../components/AdminCreateForm";

export const dynamic = "force-dynamic";

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
}

function truncate(text: string | null, max: number): string {
  if (!text) return "";
  return text.length > max ? text.slice(0, max) + "..." : text;
}

export default async function OrgDetailPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  const serviceClient = createServiceClient();

  const { data: org } = await serviceClient
    .from("organisations")
    .select("*")
    .eq("id", orgId)
    .eq("rejected", false)
    .single();

  if (!org) notFound();

  const funds = await getFundsForOrg(orgId);

  const pendingFunds = funds.filter((f) => !f.published);
  const publishedFunds = funds.filter((f) => f.published);

  return (
    <div className="space-y-8">
      {/* Breadcrumb */}
      <nav className="text-sm text-zinc-500">
        <Link href="/admin" className="hover:underline">
          Organisations
        </Link>
        <span className="mx-1">/</span>
        <span className="text-zinc-900 dark:text-zinc-100">{org.name}</span>
      </nav>

      {/* Org Header */}
      <div>
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-semibold">{org.name}</h2>
          <span
            className={`text-xs px-2 py-0.5 rounded-full ${
              org.approved
                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300"
                : "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
            }`}
          >
            {org.approved ? "Approved" : "Pending"}
          </span>
        </div>
        {org.description && (
          <p className="mt-1 text-sm text-zinc-500">{org.description}</p>
        )}
        {org.url && (
          <a
            href={org.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-indigo-600 hover:underline dark:text-indigo-400"
          >
            {org.url}
          </a>
        )}
      </div>

      {/* Action Bar */}
      <AdminActionBar
        entityType="organisations"
        entityId={orgId}
        approved={org.approved}
        parentUrl="/admin"
        editFields={[
          { name: "name", label: "Name", type: "text" },
          { name: "url", label: "URL", type: "text" },
          { name: "description", label: "Description", type: "textarea" },
        ]}
        initialValues={{
          name: org.name,
          url: org.url ?? "",
          description: org.description ?? "",
        }}
      />

      {/* Create Fund */}
      <AdminCreateForm entityType="fund" parentId={orgId} />

      {/* Pending Funds */}
      {pendingFunds.length > 0 && (
        <section>
          <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-2">
            Pending / Unpublished Funds ({pendingFunds.length})
          </h3>
          <div className="space-y-2">
            {pendingFunds.map((fund) => (
              <Link
                key={fund.id}
                href={`/admin/orgs/${orgId}/funds/${fund.id}`}
                className="block bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg p-3 hover:bg-zinc-50 dark:hover:bg-zinc-750"
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                    {fund.name}
                  </span>
                  {fund.pending_total > 0 && (
                    <span className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 text-xs px-2 py-0.5 rounded-full">
                      {fund.pending_total} pending
                    </span>
                  )}
                </div>
                {fund.notes && (
                  <p className="text-xs text-zinc-500 mt-0.5">
                    {truncate(fund.notes, 80)}
                  </p>
                )}
                <p className="text-xs text-zinc-400 mt-0.5">
                  {formatDate(fund.created_at)}
                </p>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Published Funds */}
      <section>
        <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-2">
          Published Funds ({publishedFunds.length})
        </h3>
        {publishedFunds.length === 0 ? (
          <p className="text-sm text-zinc-500">No published funds.</p>
        ) : (
          <div className="space-y-2">
            {publishedFunds.map((fund) => (
              <Link
                key={fund.id}
                href={`/admin/orgs/${orgId}/funds/${fund.id}`}
                className="block bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg p-3 hover:bg-zinc-50 dark:hover:bg-zinc-750"
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                    {fund.name}
                  </span>
                  {fund.pending_total > 0 && (
                    <span className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 text-xs px-2 py-0.5 rounded-full">
                      {fund.pending_total} pending
                    </span>
                  )}
                </div>
                {fund.url && (
                  <span className="text-xs text-blue-600 dark:text-blue-400">
                    {truncate(fund.url, 50)}
                  </span>
                )}
                {fund.notes && (
                  <p className="text-xs text-zinc-500 mt-0.5">
                    {truncate(fund.notes, 80)}
                  </p>
                )}
                <p className="text-xs text-zinc-400 mt-0.5">
                  {formatDate(fund.created_at)}
                </p>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
