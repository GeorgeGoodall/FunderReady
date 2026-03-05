import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { CriteriaSetSchema } from "@/lib/schemas/criteria";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: fundId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Validate the criteria data shape
  const parsed = CriteriaSetSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? "Invalid criteria" },
      { status: 400 }
    );
  }

  // Check fund exists
  const { data: fund } = await supabase
    .from("funds")
    .select("id")
    .eq("id", fundId)
    .eq("rejected", false)
    .single();

  if (!fund) {
    return NextResponse.json({ error: "Fund not found" }, { status: 404 });
  }

  // Auto-approve if this is the first criteria set for this fund
  const { count } = await supabase
    .from("criteria_sets")
    .select("id", { count: "exact", head: true })
    .eq("fund_id", fundId)
    .eq("rejected", false);

  const isFirstSet = (count ?? 0) === 0;

  const { data: criteriaSet, error } = await supabase
    .from("criteria_sets")
    .insert({
      fund_id: fundId,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      criteria_json: parsed.data.criteria as unknown as Record<string, unknown>,
      approved: isFirstSet,
      created_by: user.id,
    })
    .select("id, name, description, criteria_json, approved, created_at")
    .single();

  if (error) {
    console.error("Criteria set create error:", error);
    return NextResponse.json({ error: "Failed to create criteria set" }, { status: 500 });
  }

  return NextResponse.json({ criteriaSet }, { status: 201 });
}
