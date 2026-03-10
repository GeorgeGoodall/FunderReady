import { createServiceClient } from "@/lib/supabase/server";
import { CopyButton } from "@/components/CopyButton";
import { GrantProButton } from "./GrantProButton";

export const dynamic = "force-dynamic";

function formatDate(iso: string) {
  const d = new Date(iso);
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
}

export default async function AdminBetaPage() {
  const service = createServiceClient();

  // Beta profiles
  const { data: betaProfiles } = await service
    .from("profiles")
    .select("id, display_name, subscription_tier, created_at")
    .eq("is_beta", true)
    .order("created_at", { ascending: false });

  const profiles = betaProfiles ?? [];
  const betaIds = profiles.map((p) => p.id);

  // Emails via auth admin
  const emailMap: Record<string, string> = {};
  if (betaIds.length > 0) {
    const { data: { users } } = await service.auth.admin.listUsers({ perPage: 1000 });
    for (const u of users) {
      if (betaIds.includes(u.id)) {
        emailMap[u.id] = u.email ?? "";
      }
    }
  }

  // Application counts per user
  const appCountMap: Record<string, number> = {};
  if (betaIds.length > 0) {
    const { data: apps } = await service
      .from("applications")
      .select("user_id")
      .in("user_id", betaIds);
    for (const app of apps ?? []) {
      appCountMap[app.user_id] = (appCountMap[app.user_id] ?? 0) + 1;
    }
  }

  // Completed review counts per user (via applications join)
  const reviewCountMap: Record<string, number> = {};
  if (betaIds.length > 0) {
    const { data: reviews } = await service
      .from("application_reviews")
      .select("application_id, applications!inner(user_id)")
      .eq("status", "completed")
      .in("applications.user_id", betaIds);
    for (const r of reviews ?? []) {
      const userId = (r.applications as { user_id: string } | null)?.user_id;
      if (userId) {
        reviewCountMap[userId] = (reviewCountMap[userId] ?? 0) + 1;
      }
    }
  }

  const totalBeta = profiles.length;
  const totalPro = profiles.filter((p) => p.subscription_tier === "pro").length;
  const totalActive = profiles.filter((p) => (reviewCountMap[p.id] ?? 0) > 0).length;
  const needsPro = profiles.filter((p) => p.subscription_tier !== "pro");

  const betaRef = process.env.NEXT_PUBLIC_BETA_REF;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const betaUrl = betaRef ? `${appUrl}/signup?ref=${betaRef}` : null;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Beta Users</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Users who signed up via the beta invite link.
        </p>
      </div>

      {/* Beta invite URL */}
      <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Beta Invite URL</p>
        {betaUrl ? (
          <div className="mt-1 flex items-center gap-2">
            <code className="flex-1 rounded bg-zinc-100 px-2 py-1 text-sm text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">
              {betaUrl}
            </code>
            <CopyButton text={betaUrl} />
          </div>
        ) : (
          <p className="mt-1 text-sm text-amber-600 dark:text-amber-400">
            NEXT_PUBLIC_BETA_REF is not set in environment variables.
          </p>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Beta signups</p>
          <p className="mt-1 text-2xl font-bold">{totalBeta}</p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Pro access granted</p>
          <p className="mt-1 text-2xl font-bold">{totalPro}</p>
          {needsPro.length > 0 && (
            <p className="mt-0.5 text-xs text-amber-600 dark:text-amber-400">
              {needsPro.length} still on free
            </p>
          )}
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Have reviewed</p>
          <p className="mt-1 text-2xl font-bold">{totalActive}</p>
          <p className="mt-0.5 text-xs text-zinc-500">completed at least 1 review</p>
        </div>
      </div>

      {/* User table */}
      {profiles.length === 0 ? (
        <p className="text-sm text-zinc-500">No beta users yet. Share the invite URL above.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-50 text-xs dark:bg-zinc-800/50">
              <tr>
                <th className="px-4 py-2 font-medium">User</th>
                <th className="px-4 py-2 font-medium">Signed up</th>
                <th className="px-4 py-2 font-medium">Plan</th>
                <th className="px-4 py-2 font-medium">Apps</th>
                <th className="px-4 py-2 font-medium">Reviews</th>
                <th className="px-4 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {profiles.map((p) => (
                <tr key={p.id} className="bg-white dark:bg-zinc-900">
                  <td className="px-4 py-3">
                    <p className="font-medium text-zinc-900 dark:text-zinc-100">
                      {p.display_name || "—"}
                    </p>
                    <p className="text-xs text-zinc-500">{emailMap[p.id] ?? "—"}</p>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-zinc-600 dark:text-zinc-400">
                    {formatDate(p.created_at)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                        p.subscription_tier === "pro"
                          ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"
                          : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                      }`}
                    >
                      {p.subscription_tier}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                    {appCountMap[p.id] ?? 0}
                  </td>
                  <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                    {reviewCountMap[p.id] ?? 0}
                  </td>
                  <td className="px-4 py-3">
                    {p.subscription_tier !== "pro" && <GrantProButton userId={p.id} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
