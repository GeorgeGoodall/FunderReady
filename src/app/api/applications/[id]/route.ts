import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

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

  const body = await request.json();
  const { title } = body;

  if (typeof title !== "string") {
    return NextResponse.json({ error: "Invalid title" }, { status: 400 });
  }

  const { error } = await supabase
    .from("applications")
    .update({ title: title.trim() || null })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(
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

  // RLS enforces ownership — will only delete if user owns it
  const { error } = await supabase
    .from("applications")
    .delete()
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

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

  // Fetch application (RLS enforces ownership)
  const { data: application, error } = await supabase
    .from("applications")
    .select("id, user_id, fund_id, criteria_set_id, questions_set_id, title, status, review_count, created_at, updated_at")
    .eq("id", id)
    .single();

  if (error || !application) {
    return NextResponse.json({ error: "Application not found" }, { status: 404 });
  }

  // Fetch answers (RLS enforced)
  const { data: answers } = await supabase
    .from("application_answers")
    .select("id, question_id, answer_text, field_type, selected_options, last_reviewed_text, updated_at")
    .eq("application_id", id)
    .order("created_at", { ascending: true });

  // Fetch fund, criteria set, questions set via service client (no RLS needed for read)
  const serviceClient = createServiceClient();

  const [fundRes, criteriaRes, questionsRes] = await Promise.all([
    serviceClient
      .from("funds")
      .select("id, name, funder_organisation")
      .eq("id", application.fund_id)
      .single(),
    serviceClient
      .from("criteria_sets")
      .select("id, name, description, criteria_json")
      .eq("id", application.criteria_set_id)
      .single(),
    serviceClient
      .from("questions_sets")
      .select("id, questions_json, overall_word_limit")
      .eq("id", application.questions_set_id)
      .single(),
  ]);

  return NextResponse.json({
    application,
    answers: answers ?? [],
    fund: fundRes.data,
    criteriaSet: criteriaRes.data,
    questionsSet: questionsRes.data,
  });
}
