import { createServiceClient } from "@/lib/supabase/server";
import Link from "next/link";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

function formatDate(iso: string) {
  const d = new Date(iso);
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
}

function statusColour(status: string) {
  switch (status) {
    case "submitted": return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300";
    case "draft": return "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400";
    case "completed": return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300";
    default: return "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400";
  }
}

function reviewStatusColour(status: string) {
  switch (status) {
    case "completed": return "text-green-700 dark:text-green-400";
    case "failed": return "text-red-600 dark:text-red-400";
    case "pending": return "text-amber-600 dark:text-amber-400";
    default: return "text-zinc-500 dark:text-zinc-400";
  }
}

export default async function AdminBetaUserPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  const service = createServiceClient();

  // Fetch profile
  const { data: profile } = await service
    .from("profiles")
    .select("display_name, subscription_tier, created_at")
    .eq("id", userId)
    .single();

  if (!profile) redirect("/admin/beta");

  // Fetch email via auth admin
  const { data: authData } = await service.auth.admin.getUserById(userId);
  const email = authData.user?.email ?? "—";

  // Fetch applications with fund + organisation names
  const { data: rawApps } = await service
    .from("applications")
    .select("id, title, status, review_count, created_at, fund_id, funds(name, organisations(name))")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  const applications = rawApps ?? [];

  // Fetch reviews for all applications
  const appIds = applications.map((a) => a.id);
  let reviews: Array<{
    id: string;
    review_number: number;
    status: string;
    created_at: string;
    results: unknown;
    application_id: string;
  }> = [];

  if (appIds.length > 0) {
    const { data } = await service
      .from("application_reviews")
      .select("id, review_number, status, created_at, results, application_id")
      .in("application_id", appIds)
      .order("review_number", { ascending: false });
    reviews = data ?? [];
  }

  // Group reviews by application_id
  const reviewsByAppId = new Map<string, typeof reviews>();
  for (const r of reviews) {
    const existing = reviewsByAppId.get(r.application_id) ?? [];
    existing.push(r);
    reviewsByAppId.set(r.application_id, existing);
  }

  const userName = profile.display_name || "User";

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        href="/admin/beta"
        className="text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
      >
        ← Beta Users
      </Link>

      {/* User header */}
      <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <p className="font-semibold text-zinc-900 dark:text-zinc-100">{userName}</p>
            <p className="text-sm text-zinc-500">{email}</p>
          </div>
          <span
            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
              profile.subscription_tier === "pro"
                ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"
                : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
            }`}
          >
            {profile.subscription_tier}
          </span>
        </div>
        <p className="mt-1 text-xs text-zinc-400">Joined {formatDate(profile.created_at)}</p>
      </div>

      {/* Applications section */}
      <section>
        <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Applications ({applications.length})
        </h2>

        {applications.length === 0 ? (
          <p className="text-sm text-zinc-500">No applications yet.</p>
        ) : (
          <div className="space-y-3">
            {applications.map((app) => {
              const fund = app.funds as unknown as { name: string; organisations: { name: string } | null } | null;
              const orgName = (fund?.organisations as { name: string } | null)?.name;
              const appReviews = reviewsByAppId.get(app.id) ?? [];

              return (
                <div
                  key={app.id}
                  className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
                >
                  {/* Application header */}
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-zinc-900 dark:text-zinc-100">
                      {app.title || "Untitled"}
                    </p>
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusColour(app.status)}`}>
                      {app.status}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    {fund?.name ?? "Unknown fund"}
                    {orgName ? ` · ${orgName}` : ""}
                  </p>

                  {/* Reviews list */}
                  {appReviews.length === 0 ? (
                    <p className="mt-2 text-xs text-zinc-400">No reviews yet.</p>
                  ) : (
                    <div className="mt-2 divide-y divide-zinc-100 rounded border border-zinc-100 dark:divide-zinc-800 dark:border-zinc-800">
                      {appReviews.map((r) => {
                        const score = (r.results as { projected_score?: number } | null)?.projected_score;
                        return (
                          <Link
                            key={r.id}
                            href={`/admin/beta/${userId}/reviews/${r.id}`}
                            className="flex items-center gap-4 px-3 py-2 text-xs hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                          >
                            <span className="w-20 font-medium text-zinc-700 dark:text-zinc-300">
                              Review #{r.review_number}
                            </span>
                            <span className={`w-20 ${reviewStatusColour(r.status)}`}>
                              {r.status}
                            </span>
                            <span className="flex-1 text-zinc-500">{formatDate(r.created_at)}</span>
                            {score !== undefined && r.status === "completed" && (
                              <span className="font-medium text-zinc-700 dark:text-zinc-300">
                                {Math.round(score)}%
                              </span>
                            )}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
