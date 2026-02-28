import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient, createServiceClient } from "@/lib/supabase/server";

const SwapQuestionsSetSchema = z.object({
  questionsSetId: z.string().uuid(),
});

export async function PATCH(
  request: Request,
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

  // Verify ownership (RLS enforced)
  const { data: application } = await supabase
    .from("applications")
    .select("id, status, fund_id, questions_set_id")
    .eq("id", id)
    .single();

  if (!application) {
    return NextResponse.json({ error: "Application not found" }, { status: 404 });
  }

  // Only allow swap in draft or reviewed status
  if (application.status !== "draft" && application.status !== "reviewed") {
    return NextResponse.json(
      { error: "Cannot change questions set while review is in progress" },
      { status: 409 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = SwapQuestionsSetSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? "Invalid request" },
      { status: 400 }
    );
  }

  const { questionsSetId } = parsed.data;

  // No-op check
  if (questionsSetId === application.questions_set_id) {
    return NextResponse.json(
      { error: "Already using this questions set" },
      { status: 400 }
    );
  }

  const serviceClient = createServiceClient();

  // Validate new questions set: exists, same fund, approved
  const { data: newSet } = await serviceClient
    .from("questions_sets")
    .select("id, fund_id, approved, questions_json")
    .eq("id", questionsSetId)
    .single();

  if (!newSet) {
    return NextResponse.json({ error: "Questions set not found" }, { status: 404 });
  }

  if (newSet.fund_id !== application.fund_id) {
    return NextResponse.json(
      { error: "Questions set belongs to a different fund" },
      { status: 400 }
    );
  }

  if (!newSet.approved) {
    return NextResponse.json(
      { error: "Questions set is not approved" },
      { status: 400 }
    );
  }

  // Parse new question IDs
  const newQuestions = Array.isArray(newSet.questions_json)
    ? (newSet.questions_json as Array<{ id: string; field_type?: string }>)
    : [];
  const newQuestionIds = new Set(newQuestions.map((q) => q.id));

  // Fetch current answers
  const { data: currentAnswers } = await serviceClient
    .from("application_answers")
    .select("id, question_id")
    .eq("application_id", id);

  const existingIds = new Set((currentAnswers ?? []).map((a) => a.question_id));

  // Compute sets
  const keptIds = [...existingIds].filter((qid) => newQuestionIds.has(qid));
  const addedIds = [...newQuestionIds].filter((qid) => !existingIds.has(qid));
  const removedIds = [...existingIds].filter((qid) => !newQuestionIds.has(qid));

  // Delete removed answers
  if (removedIds.length > 0) {
    await serviceClient
      .from("application_answers")
      .delete()
      .eq("application_id", id)
      .in("question_id", removedIds);
  }

  // Insert blank answers for added questions
  if (addedIds.length > 0) {
    const fieldTypeMap = new Map(
      newQuestions.map((q) => [q.id, q.field_type ?? "textarea"])
    );
    const newRows = addedIds.map((qid) => ({
      application_id: id,
      question_id: qid,
      answer_text: "",
      field_type: fieldTypeMap.get(qid) ?? "textarea",
    }));

    await serviceClient.from("application_answers").insert(newRows);
  }

  // Update application's questions_set_id
  await serviceClient
    .from("applications")
    .update({
      questions_set_id: questionsSetId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  return NextResponse.json({
    added: addedIds.length,
    removed: removedIds.length,
    kept: keptIds.length,
  });
}
