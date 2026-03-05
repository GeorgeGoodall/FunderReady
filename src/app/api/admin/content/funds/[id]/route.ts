import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const [criteriaResult, questionsResult] = await Promise.all([
    auth.serviceClient
      .from("criteria_sets")
      .select("id, name, label, description, criteria_json, approved, created_at, created_by")
      .eq("fund_id", id)
      .eq("rejected", false)
      .order("created_at", { ascending: false }),
    auth.serviceClient
      .from("questions_sets")
      .select("id, label, questions_json, overall_word_limit, approved, created_at, created_by")
      .eq("fund_id", id)
      .eq("rejected", false)
      .order("created_at", { ascending: false }),
  ]);

  return NextResponse.json({
    criteria_sets: criteriaResult.data ?? [],
    questions_sets: questionsResult.data ?? [],
  });
}
