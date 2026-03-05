import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";

/**
 * Atomic amend: creates a new set and rejects the original in one request.
 * If either operation fails, returns an error (the create may still persist
 * but we avoid the silent inconsistency of the two-request approach).
 */
export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => ({}));

  const { set_type, original_id, fund_id } = body;

  if (set_type !== "criteria" && set_type !== "questions") {
    return NextResponse.json({ error: "set_type must be 'criteria' or 'questions'" }, { status: 400 });
  }
  if (!original_id || typeof original_id !== "string") {
    return NextResponse.json({ error: "original_id is required" }, { status: 400 });
  }
  if (!fund_id || typeof fund_id !== "string") {
    return NextResponse.json({ error: "fund_id is required" }, { status: 400 });
  }

  const table = set_type === "criteria" ? "criteria_sets" : "questions_sets";

  // Build the insert record
  const record: Record<string, unknown> = {
    fund_id,
    approved: true,
    created_by: auth.userId,
  };

  if (set_type === "criteria") {
    if (!body.name || typeof body.name !== "string") {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }
    if (!Array.isArray(body.criteria_json)) {
      return NextResponse.json({ error: "criteria_json must be an array" }, { status: 400 });
    }
    record.name = body.name;
    record.criteria_json = body.criteria_json;
    if (typeof body.description === "string") record.description = body.description;
  } else {
    if (!Array.isArray(body.questions_json)) {
      return NextResponse.json({ error: "questions_json must be an array" }, { status: 400 });
    }
    record.questions_json = body.questions_json;
    if (typeof body.overall_word_limit === "number") record.overall_word_limit = body.overall_word_limit;
  }

  // Step 1: Create the new set
  const { data: created, error: createError } = await auth.serviceClient
    .from(table)
    .insert(record)
    .select()
    .single();

  if (createError) {
    console.error("Amend create error:", createError);
    return NextResponse.json({ error: "Failed to create amended set" }, { status: 500 });
  }

  // Step 2: Reject the original
  const { error: rejectError } = await auth.serviceClient
    .from(table)
    .update({ rejected: true, rejection_reason: "Amended by admin", approved: false })
    .eq("id", original_id)
    .select("id")
    .single();

  if (rejectError) {
    console.error("Amend reject error:", rejectError);
    return NextResponse.json(
      { error: "Amended set created but failed to reject original", id: created.id },
      { status: 500 }
    );
  }

  return NextResponse.json(created, { status: 201 });
}
