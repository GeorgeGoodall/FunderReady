import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { QuestionsSetSchema } from "@/lib/schemas/criteria";

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

  const parsed = QuestionsSetSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? "Invalid questions" },
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

  // Auto-approve if first questions set for this fund
  const { count } = await supabase
    .from("questions_sets")
    .select("id", { count: "exact", head: true })
    .eq("fund_id", fundId)
    .eq("rejected", false);

  const isFirstSet = (count ?? 0) === 0;

  const { data: questionsSet, error } = await supabase
    .from("questions_sets")
    .insert({
      fund_id: fundId,
      questions_json: parsed.data.questions as unknown as Record<string, unknown>[],
      overall_word_limit: parsed.data.overall_word_limit ?? null,
      approved: isFirstSet,
      created_by: user.id,
    })
    .select("id, questions_json, overall_word_limit, approved, created_at")
    .single();

  if (error) {
    console.error("Questions set create error:", error);
    return NextResponse.json({ error: "Failed to create questions set" }, { status: 500 });
  }

  return NextResponse.json({ questionsSet }, { status: 201 });
}
