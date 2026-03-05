import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { data: funds, error } = await auth.serviceClient
    .from("funds")
    .select("id, name, url, notes, published, created_at, created_by, organisation_id")
    .eq("organisation_id", id)
    .eq("rejected", false)
    .order("name");

  if (error) {
    return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
  }

  const fundsWithCounts = await Promise.all(
    (funds ?? []).map(async (fund) => {
      const [cResult, qResult] = await Promise.all([
        auth.serviceClient
          .from("criteria_sets")
          .select("id", { count: "exact", head: true })
          .eq("fund_id", fund.id)
          .eq("approved", false)
          .eq("rejected", false),
        auth.serviceClient
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

  return NextResponse.json(fundsWithCounts);
}
