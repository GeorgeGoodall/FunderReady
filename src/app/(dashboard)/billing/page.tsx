import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { checkUsage } from "@/lib/usage/check-usage";

export default async function UsagePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const usage = await checkUsage(supabase, user.id);

  const resetDate = usage.resetDate.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  // Fetch review history
  const { data: reviewRows } = await supabase
    .from("application_reviews")
    .select(`
      id,
      review_number,
      created_at,
      credits_charged,
      applications!inner(
        id,
        title,
        funds(
          id,
          name,
          organisations(id, name)
        )
      )
    `)
    .eq("applications.user_id", user.id)
    .eq("status", "completed")
    .order("created_at", { ascending: false });

  type ReviewRow = {
    id: string;
    review_number: number;
    created_at: string;
    credits_charged: number;
    applications: {
      id: string;
      title: string | null;
      funds: {
        id: string;
        name: string;
        organisations: { id: string; name: string } | null;
      } | null;
    };
  };

  const reviews = (reviewRows ?? []) as unknown as ReviewRow[];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Usage</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Your credit balance and review history.
        </p>
      </div>

      {/* Credit balance */}
      <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-lg font-semibold">Credits remaining</h2>
        <div className="mt-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-3xl font-bold">{usage.remaining}</span>
            <span className="text-zinc-500 dark:text-zinc-400">
              Resets {resetDate}
            </span>
          </div>
          {usage.limit > 0 && (
            <>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                <div
                  className="h-full rounded-full bg-blue-600 transition-all"
                  style={{
                    width: `${Math.min(100, (usage.used / usage.limit) * 100)}%`,
                  }}
                />
              </div>
              <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
                {usage.used} of {usage.limit} monthly credits used
                {usage.bonus > 0 && ` · ${usage.bonus} bonus credits`}
              </p>
            </>
          )}
        </div>
        <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">
          Need more credits? Contact the site owner.
        </p>
      </div>

      {/* Review history */}
      <div className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
          <h2 className="text-lg font-semibold">Review history</h2>
        </div>
        {reviews.length === 0 ? (
          <p className="px-6 py-4 text-sm text-zinc-500 dark:text-zinc-400">
            No reviews submitted yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                  <th className="px-6 py-3 font-medium">Date</th>
                  <th className="px-6 py-3 font-medium">Fund</th>
                  <th className="px-6 py-3 font-medium">Organisation</th>
                  <th className="px-6 py-3 font-medium">Application</th>
                  <th className="px-6 py-3 font-medium">Review #</th>
                  <th className="px-6 py-3 font-medium text-right">Credits used</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {reviews.map((r) => {
                  const app = r.applications;
                  const fund = app?.funds;
                  const org = fund?.organisations;
                  return (
                    <tr key={r.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                      <td className="whitespace-nowrap px-6 py-3 text-zinc-600 dark:text-zinc-400">
                        {new Date(r.created_at).toLocaleDateString("en-GB", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </td>
                      <td className="px-6 py-3 text-zinc-700 dark:text-zinc-300">
                        {fund?.name ?? "—"}
                      </td>
                      <td className="px-6 py-3 text-zinc-600 dark:text-zinc-400">
                        {org?.name ?? "—"}
                      </td>
                      <td className="px-6 py-3 text-zinc-700 dark:text-zinc-300">
                        <a
                          href={`/applications/${app?.id}/review?reviewNumber=${r.review_number}`}
                          className="hover:underline"
                        >
                          {app?.title || fund?.name || "Untitled"}
                        </a>
                      </td>
                      <td className="px-6 py-3 text-zinc-500 dark:text-zinc-400">
                        #{r.review_number}
                      </td>
                      <td className="px-6 py-3 text-right text-zinc-600 dark:text-zinc-400">
                        {r.credits_charged}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
