import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { SaveAnswersRequestSchema } from "@/lib/schemas/criteria";

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
    .select("id, status, questions_set_id")
    .eq("id", id)
    .single();

  if (!application) {
    return NextResponse.json({ error: "Application not found" }, { status: 404 });
  }

  if (application.status === "submitted_for_review") {
    return NextResponse.json(
      { error: "Cannot edit answers while review is in progress" },
      { status: 409 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = SaveAnswersRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? "Invalid request" },
      { status: 400 }
    );
  }

  const serviceClient = createServiceClient();

  // Validate question_ids against the application's questions set
  const { data: questionsSet } = await serviceClient
    .from("questions_sets")
    .select("questions_json")
    .eq("id", application.questions_set_id)
    .single();

  if (questionsSet) {
    const validIds = new Set<string>(
      (questionsSet.questions_json as Array<{ id: string }>).map((q) => q.id)
    );
    const invalid = parsed.data.answers.find((a) => !validIds.has(a.question_id));
    if (invalid) {
      return NextResponse.json({ error: "Invalid question_id in answers" }, { status: 400 });
    }
  }

  // Upsert each answer (service client to bypass RLS for atomic update)
  const upsertRows = parsed.data.answers.map((a) => ({
    application_id: id,
    question_id: a.question_id,
    answer_text: a.answer_text,
    is_disabled: a.is_disabled ?? false,
    ...(a.selected_options && { selected_options: a.selected_options }),
  }));

  const { error: upsertError } = await serviceClient
    .from("application_answers")
    .upsert(upsertRows, { onConflict: "application_id,question_id" });

  if (upsertError) {
    console.error("answers upsert error:", upsertError);
    return NextResponse.json(
      { error: "Failed to save answers" },
      { status: 500 }
    );
  }

  // Update application updated_at
  await supabase
    .from("applications")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", id);

  return NextResponse.json({ saved: parsed.data.answers.length });
}
