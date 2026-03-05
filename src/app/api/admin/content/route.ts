import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";

export async function GET() {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  // Fetch all non-rejected organisations
  const { data: orgs, error } = await auth.serviceClient
    .from("organisations")
    .select("id, name, url, description, approved, created_at, created_by")
    .eq("rejected", false)
    .order("name");

  if (error) {
    return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
  }

  // For each org, get pending counts
  const orgsWithCounts = await Promise.all(
    (orgs ?? []).map(async (org) => {
      const [fundsResult, pendingFundsResult] = await Promise.all([
        auth.serviceClient
          .from("funds")
          .select("id", { count: "exact", head: true })
          .eq("organisation_id", org.id)
          .eq("rejected", false),
        auth.serviceClient
          .from("funds")
          .select("id", { count: "exact", head: true })
          .eq("organisation_id", org.id)
          .eq("published", false)
          .eq("rejected", false),
      ]);

      // Get fund IDs for this org to count pending sets
      const { data: orgFunds } = await auth.serviceClient
        .from("funds")
        .select("id")
        .eq("organisation_id", org.id)
        .eq("rejected", false);

      const fundIds = (orgFunds ?? []).map((f) => f.id);
      let pendingSetsCount = 0;

      if (fundIds.length > 0) {
        const [cResult, qResult] = await Promise.all([
          auth.serviceClient
            .from("criteria_sets")
            .select("id", { count: "exact", head: true })
            .in("fund_id", fundIds)
            .eq("approved", false)
            .eq("rejected", false),
          auth.serviceClient
            .from("questions_sets")
            .select("id", { count: "exact", head: true })
            .in("fund_id", fundIds)
            .eq("approved", false)
            .eq("rejected", false),
        ]);
        pendingSetsCount = (cResult.count ?? 0) + (qResult.count ?? 0);
      }

      return {
        ...org,
        total_funds: fundsResult.count ?? 0,
        pending_funds: pendingFundsResult.count ?? 0,
        pending_sets: pendingSetsCount,
        pending_total: (pendingFundsResult.count ?? 0) + pendingSetsCount,
      };
    })
  );

  return NextResponse.json(orgsWithCounts);
}
