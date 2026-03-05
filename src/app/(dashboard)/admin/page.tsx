import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { AdminContentManagement } from "./AdminContentManagement";
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

  return (
    <div>
      <h1 className="text-2xl font-bold">Admin Dashboard</h1>
      <p className="mt-1 text-sm text-zinc-500">Manage content, approve submissions, and view platform metrics.</p>
      <div className="mt-6">
        <AdminTabs
          contentTab={<AdminContentManagement />}
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
