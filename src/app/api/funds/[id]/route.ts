import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Fetch fund
  const { data: fund, error: fundError } = await supabase
    .from("funds")
    .select("id, name, funder_organisation, url, notes, created_by, created_at")
    .eq("id", id)
    .single();

  if (fundError || !fund) {
    return NextResponse.json({ error: "Fund not found" }, { status: 404 });
  }

  // Latest approved criteria set
  const { data: approvedCriteriaSet } = await supabase
    .from("criteria_sets")
    .select("id, label, name, description, criteria_json, approved, created_by, created_at")
    .eq("fund_id", id)
    .eq("approved", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // User's own latest unapproved criteria set (if any)
  const { data: userDraftCriteriaSet } = await supabase
    .from("criteria_sets")
    .select("id, label, name, description, criteria_json, approved, created_by, created_at")
    .eq("fund_id", id)
    .eq("created_by", user.id)
    .eq("approved", false)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Latest approved questions set
  const { data: approvedQuestionsSet } = await supabase
    .from("questions_sets")
    .select("id, label, questions_json, overall_word_limit, approved, created_by, created_at")
    .eq("fund_id", id)
    .eq("approved", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // User's own latest unapproved questions set (if any)
  const { data: userDraftQuestionsSet } = await supabase
    .from("questions_sets")
    .select("id, label, questions_json, overall_word_limit, approved, created_by, created_at")
    .eq("fund_id", id)
    .eq("created_by", user.id)
    .eq("approved", false)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return NextResponse.json({
    fund,
    criteriaSet: approvedCriteriaSet,
    userDraftCriteriaSet,
    questionsSet: approvedQuestionsSet,
    userDraftQuestionsSet,
  });
}
