import { createServiceClient } from "@/lib/supabase/server";

export interface OrgWithCounts {
  id: string;
  name: string;
  url: string | null;
  description: string | null;
  approved: boolean;
  created_at: string;
  total_funds: number;
  pending_funds: number;
  pending_sets: number;
  pending_total: number;
}

export interface FundWithCounts {
  id: string;
  name: string;
  url: string | null;
  notes: string | null;
  published: boolean;
  created_at: string;
  organisation_id: string;
  pending_criteria: number;
  pending_questions: number;
  pending_total: number;
}

export async function getOrgsWithCounts(): Promise<OrgWithCounts[]> {
  const serviceClient = createServiceClient();

  const { data: orgs } = await serviceClient
    .from("organisations")
    .select("id, name, url, description, approved, created_at")
    .eq("rejected", false)
    .order("name");

  return Promise.all(
    (orgs ?? []).map(async (org) => {
      const [fundsResult, pendingFundsResult] = await Promise.all([
        serviceClient
          .from("funds")
          .select("id", { count: "exact", head: true })
          .eq("organisation_id", org.id)
          .eq("rejected", false),
        serviceClient
          .from("funds")
          .select("id", { count: "exact", head: true })
          .eq("organisation_id", org.id)
          .eq("published", false)
          .eq("rejected", false),
      ]);

      const { data: orgFunds } = await serviceClient
        .from("funds")
        .select("id")
        .eq("organisation_id", org.id)
        .eq("rejected", false);

      const fundIds = (orgFunds ?? []).map((f) => f.id);
      let pendingSetsCount = 0;

      if (fundIds.length > 0) {
        const [cResult, qResult] = await Promise.all([
          serviceClient
            .from("criteria_sets")
            .select("id", { count: "exact", head: true })
            .in("fund_id", fundIds)
            .eq("approved", false)
            .eq("rejected", false),
          serviceClient
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
}

export async function getFundsForOrg(orgId: string): Promise<FundWithCounts[]> {
  const serviceClient = createServiceClient();

  const { data: funds } = await serviceClient
    .from("funds")
    .select("id, name, url, notes, published, created_at, organisation_id")
    .eq("organisation_id", orgId)
    .eq("rejected", false)
    .order("name");

  return Promise.all(
    (funds ?? []).map(async (fund) => {
      const [cResult, qResult] = await Promise.all([
        serviceClient
          .from("criteria_sets")
          .select("id", { count: "exact", head: true })
          .eq("fund_id", fund.id)
          .eq("approved", false)
          .eq("rejected", false),
        serviceClient
          .from("questions_sets")
          .select("id", { count: "exact", head: true })
          .eq("fund_id", fund.id)
          .eq("approved", false)
          .eq("rejected", false),
      ]);

      return {
        ...fund,
        pending_criteria: cResult.count ?? 0,
        pending_questions: qResult.count ?? 0,
        pending_total: (cResult.count ?? 0) + (qResult.count ?? 0),
      };
    })
  );
}
