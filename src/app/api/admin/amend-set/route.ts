import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { CriteriaSetSchema, QuestionsSetSchema } from "@/lib/schemas/criteria";

/**
 * Atomic amend: creates a new set and rejects the original in one request.
 * If either operation fails, returns an error (the create may still persist
 * but we avoid the silent inconsistency of the two-request approach).
 */
export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => ({}));

  const { set_type, original_id } = body;

  if (set_type !== "criteria" && set_type !== "questions") {
    return NextResponse.json({ error: "set_type must be 'criteria' or 'questions'" }, { status: 400 });
  }
  if (!original_id || typeof original_id !== "string") {
    return NextResponse.json({ error: "original_id is required" }, { status: 400 });
  }

  const table = set_type === "criteria" ? "criteria_sets" : "questions_sets";

  // Fetch the original set to get the authoritative fund_id (ignore client-supplied fund_id)
  const { data: originalSet, error: fetchError } = await auth.serviceClient
    .from(table)
    .select("fund_id")
    .eq("id", original_id)
    .single();

  if (fetchError || !originalSet) {
    return NextResponse.json({ error: "Original set not found" }, { status: 404 });
  }

  const dbFundId = originalSet.fund_id;

  // Build the insert record
  const record: Record<string, unknown> = {
    fund_id: dbFundId,
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
    // Validate criteria_json against CriteriaSetSchema
    const criteriaValidation = CriteriaSetSchema.safeParse({
      name: body.name,
      description: body.description,
      criteria: body.criteria_json,
    });
    if (!criteriaValidation.success) {
      return NextResponse.json(
        { error: criteriaValidation.error.errors[0]?.message ?? "Invalid criteria_json" },
        { status: 400 }
      );
    }
    record.name = criteriaValidation.data.name;
    record.criteria_json = criteriaValidation.data.criteria;
    if (criteriaValidation.data.description) record.description = criteriaValidation.data.description;
  } else {
    if (!Array.isArray(body.questions_json)) {
      return NextResponse.json({ error: "questions_json must be an array" }, { status: 400 });
    }
    // Validate questions_json against QuestionsSetSchema
    const questionsValidation = QuestionsSetSchema.safeParse({
      questions: body.questions_json,
      overall_word_limit: body.overall_word_limit,
    });
    if (!questionsValidation.success) {
      return NextResponse.json(
        { error: questionsValidation.error.errors[0]?.message ?? "Invalid questions_json" },
        { status: 400 }
      );
    }
    record.questions_json = questionsValidation.data.questions;
    if (questionsValidation.data.overall_word_limit != null) {
      record.overall_word_limit = questionsValidation.data.overall_word_limit;
    }
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
