import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { checkUsage } from "@/lib/usage/check-usage";
import { PLANS } from "@/lib/stripe/plans";
import { BillingClient } from "./BillingClient";

export default async function BillingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("subscription_tier, subscription_status")
    .eq("id", user.id)
    .single();

  const tier = (profile?.subscription_tier ?? "free") as "free" | "basic" | "pro";
  const status = profile?.subscription_status as string | null;
  const usage = await checkUsage(supabase, user.id);
  const plan = PLANS[tier];

  const resetDate = usage.resetDate.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  // Fetch review history for credit usage table
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
        <h1 className="text-2xl font-bold">Billing</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Manage your subscription and usage
        </p>
      </div>

      {/* Current Plan */}
      <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Current plan</h2>
            <div className="mt-1 flex items-center gap-2">
              <span className="text-2xl font-bold">{plan.name}</span>
              <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium capitalize dark:bg-zinc-800">
                {tier}
              </span>
              {status === "past_due" && (
                <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/30 dark:text-red-400">
                  Payment issue
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              {tier === "pro" ? "£49/month" : tier === "basic" ? "£19/month" : "No active plan"}
            </p>
          </div>
        </div>

        {/* Features */}
        <ul className="mt-4 space-y-1">
          {plan.features.map((feature) => (
            <li
              key={feature}
              className="text-sm text-zinc-600 dark:text-zinc-400"
            >
              ✓ {feature}
            </li>
          ))}
          {plan.creditsPerMonth > 0 && (
            <li className="text-sm text-zinc-600 dark:text-zinc-400">
              ✓ {plan.creditsPerMonth} credits/month
            </li>
          )}
        </ul>
      </div>

      {/* Usage */}
      <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-lg font-semibold">Credits</h2>
        <div className="mt-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-2xl font-bold">{usage.remaining}</span>
            <span className="text-zinc-500 dark:text-zinc-400">
              Resets {resetDate}
            </span>
          </div>

          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
            <div
              className="h-full rounded-full bg-blue-600 transition-all"
              style={{
                width: `${usage.limit > 0 ? Math.min(100, (usage.used / usage.limit) * 100) : 0}%`,
              }}
            />
          </div>
          <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
            {usage.used} of {usage.limit} monthly credits used
          </p>
        </div>
      </div>

      {/* Review history */}
      <div className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="px-6 py-4 border-b border-zinc-200 dark:border-zinc-800">
          <h2 className="text-lg font-semibold">Credit usage</h2>
        </div>
        {reviews.length === 0 ? (
          <p className="px-6 py-4 text-sm text-zinc-500 dark:text-zinc-400">No reviews submitted yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-800 text-left text-xs text-zinc-500 dark:text-zinc-400">
                  <th className="px-6 py-3 font-medium">Date</th>
                  <th className="px-6 py-3 font-medium">Fund</th>
                  <th className="px-6 py-3 font-medium">Organisation</th>
                  <th className="px-6 py-3 font-medium">Application</th>
                  <th className="px-6 py-3 font-medium">Review #</th>
                  <th className="px-6 py-3 font-medium text-right">Credits</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {reviews.map((r) => {
                  const app = r.applications;
                  const fund = app?.funds;
                  const org = fund?.organisations;
                  return (
                    <tr key={r.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                      <td className="px-6 py-3 text-zinc-600 dark:text-zinc-400 whitespace-nowrap">
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

      {/* Actions */}
      <BillingClient tier={tier} />
    </div>
  );
}
