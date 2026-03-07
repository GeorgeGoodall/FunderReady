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
  approved: boolean;
  shared: boolean;
  created_at: string;
  organisation_id: string;
  pending_criteria: number;
  pending_questions: number;
  pending_total: number;
}

export async function getOrgsWithCounts(): Promise<OrgWithCounts[]> {
  const serviceClient = createServiceClient();

  // Single query to get all orgs
  const { data: orgs, error: orgsError } = await serviceClient
    .from("organisations")
    .select("id, name, url, description, approved, created_at")
    .eq("rejected", false)
    .order("name");

  if (orgsError) throw new Error(`Failed to fetch organisations: ${orgsError.message}`);
  if (!orgs || orgs.length === 0) return [];

  const orgIds = orgs.map((o) => o.id);

  // Batch: get all non-rejected funds for these orgs
  const { data: allFunds, error: fundsError } = await serviceClient
    .from("funds")
    .select("id, organisation_id, approved, shared")
    .in("organisation_id", orgIds)
    .eq("rejected", false);

  if (fundsError) throw new Error(`Failed to fetch funds: ${fundsError.message}`);

  const funds = allFunds ?? [];
  const fundIds = funds.map((f) => f.id);

  // Batch: get pending criteria and questions counts (only if there are funds)
  let pendingCriteria: { fund_id: string }[] = [];
  let pendingQuestions: { fund_id: string }[] = [];

  if (fundIds.length > 0) {
    const [cResult, qResult] = await Promise.all([
      serviceClient
        .from("criteria_sets")
        .select("fund_id")
        .in("fund_id", fundIds)
        .eq("approved", false)
        .eq("rejected", false),
      serviceClient
        .from("questions_sets")
        .select("fund_id")
        .in("fund_id", fundIds)
        .eq("approved", false)
        .eq("rejected", false),
    ]);
    pendingCriteria = cResult.data ?? [];
    pendingQuestions = qResult.data ?? [];
  }

  // Build lookup maps
  const fundsByOrg = new Map<string, typeof funds>();
  for (const f of funds) {
    const list = fundsByOrg.get(f.organisation_id) ?? [];
    list.push(f);
    fundsByOrg.set(f.organisation_id, list);
  }

  // Map fund_id -> org_id
  const fundToOrg = new Map<string, string>();
  for (const f of funds) {
    fundToOrg.set(f.id, f.organisation_id);
  }

  // Count pending sets per org
  const pendingSetsPerOrg = new Map<string, number>();
  for (const c of pendingCriteria) {
    const orgId = fundToOrg.get(c.fund_id);
    if (orgId) pendingSetsPerOrg.set(orgId, (pendingSetsPerOrg.get(orgId) ?? 0) + 1);
  }
  for (const q of pendingQuestions) {
    const orgId = fundToOrg.get(q.fund_id);
    if (orgId) pendingSetsPerOrg.set(orgId, (pendingSetsPerOrg.get(orgId) ?? 0) + 1);
  }

  return orgs.map((org) => {
    const orgFunds = fundsByOrg.get(org.id) ?? [];
    const pendingFundsCount = orgFunds.filter((f) => f.shared && !f.approved).length;
    const pendingSets = pendingSetsPerOrg.get(org.id) ?? 0;

    return {
      ...org,
      total_funds: orgFunds.length,
      pending_funds: pendingFundsCount,
      pending_sets: pendingSets,
      pending_total: pendingFundsCount + pendingSets,
    };
  });
}

export async function getFundsForOrg(orgId: string): Promise<FundWithCounts[]> {
  const serviceClient = createServiceClient();

  const { data: funds, error: fundsError } = await serviceClient
    .from("funds")
    .select("id, name, url, notes, approved, shared, created_at, organisation_id")
    .eq("organisation_id", orgId)
    .eq("rejected", false)
    .order("name");

  if (fundsError) throw new Error(`Failed to fetch funds: ${fundsError.message}`);
  if (!funds || funds.length === 0) return [];

  const fundIds = funds.map((f) => f.id);

  // Batch: get pending counts for all funds at once
  const [cResult, qResult] = await Promise.all([
    serviceClient
      .from("criteria_sets")
      .select("fund_id")
      .in("fund_id", fundIds)
      .eq("approved", false)
      .eq("rejected", false),
    serviceClient
      .from("questions_sets")
      .select("fund_id")
      .in("fund_id", fundIds)
      .eq("approved", false)
      .eq("rejected", false),
  ]);

  // Count per fund
  const pendingCriteriaByFund = new Map<string, number>();
  for (const c of cResult.data ?? []) {
    pendingCriteriaByFund.set(c.fund_id, (pendingCriteriaByFund.get(c.fund_id) ?? 0) + 1);
  }
  const pendingQuestionsByFund = new Map<string, number>();
  for (const q of qResult.data ?? []) {
    pendingQuestionsByFund.set(q.fund_id, (pendingQuestionsByFund.get(q.fund_id) ?? 0) + 1);
  }

  return funds.map((fund) => {
    const pc = pendingCriteriaByFund.get(fund.id) ?? 0;
    const pq = pendingQuestionsByFund.get(fund.id) ?? 0;
    return {
      ...fund,
      pending_criteria: pc,
      pending_questions: pq,
      pending_total: pc + pq,
    };
  });
}
