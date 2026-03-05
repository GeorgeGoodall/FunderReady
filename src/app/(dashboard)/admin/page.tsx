import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { AdminDashboard } from "./AdminDashboard";
import { AdminMetrics } from "./AdminMetrics";
import { AdminTabs } from "./AdminTabs";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();

  if (!profile?.is_admin) redirect("/dashboard");

  // Fetch unapproved criteria sets with fund info
  const { data: pendingCriteriaSets } = await supabase
    .from("criteria_sets")
    .select("id, name, description, criteria_json, created_at, fund_id, created_by, funds(name)")
    .eq("approved", false)
    .eq("rejected", false)
    .order("created_at", { ascending: false });

  // Fetch unapproved questions sets with fund info
  const { data: pendingQuestionsSets } = await supabase
    .from("questions_sets")
    .select("id, questions_json, overall_word_limit, created_at, fund_id, created_by, funds(name)")
    .eq("approved", false)
    .eq("rejected", false)
    .order("created_at", { ascending: false });

  // Fetch unapproved organisations
  const { data: pendingOrganisations } = await supabase
    .from("organisations")
    .select("id, name, url, description, created_at, created_by")
    .eq("approved", false)
    .eq("rejected", false)
    .order("created_at", { ascending: false });

  return (
    <div>
      <h1 className="text-2xl font-bold">Admin Dashboard</h1>
      <p className="mt-1 text-sm text-zinc-500">Manage content, approve submissions, and view platform metrics.</p>
      <div className="mt-6">
        <AdminTabs
          contentTab={
            <AdminDashboard
              pendingCriteriaSets={pendingCriteriaSets ?? []}
              pendingQuestionsSets={pendingQuestionsSets ?? []}
              pendingOrganisations={pendingOrganisations ?? []}
            />
          }
          metricsTab={
            <div>
              <h2 className="text-lg font-semibold">AI Usage Metrics</h2>
              <p className="mt-1 text-sm text-zinc-500">Token consumption, costs, and platform statistics.</p>
              <div className="mt-4">
                <AdminMetrics />
              </div>
            </div>
          }
        />
      </div>
    </div>
  );
}
