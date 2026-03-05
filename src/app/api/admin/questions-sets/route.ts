import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => ({}));

  if (!body.fund_id || typeof body.fund_id !== "string") {
    return NextResponse.json(
      { error: "fund_id is required" },
      { status: 400 }
    );
  }

  if (!body.questions_json) {
    return NextResponse.json(
      { error: "questions_json is required" },
      { status: 400 }
    );
  }

  const record: Record<string, unknown> = {
    fund_id: body.fund_id,
    questions_json: body.questions_json,
    approved: true,
    created_by: auth.userId,
  };
  if (typeof body.label === "string") record.label = body.label;
  if (typeof body.overall_word_limit === "number")
    record.overall_word_limit = body.overall_word_limit;

  const { data, error } = await auth.serviceClient
    .from("questions_sets")
    .insert(record)
    .select()
    .single();

  if (error) {
    console.error("Create questions set error:", error);
    return NextResponse.json({ error: "Failed to create" }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
