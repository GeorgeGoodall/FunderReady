import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { CreateApplicationRequestSchema } from "@/lib/schemas/criteria";

export async function POST(request: Request) {
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

  const parsed = CreateApplicationRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? "Invalid request" },
      { status: 400 }
    );
  }

  const { fundId, criteriaSetId, questionsSetId, title } = parsed.data;
  const serviceClient = createServiceClient();

  // Validate that criteria set belongs to the fund
  const { data: criteriaSet } = await serviceClient
    .from("criteria_sets")
    .select("id, fund_id")
    .eq("id", criteriaSetId)
    .eq("rejected", false)
    .single();

  if (!criteriaSet || criteriaSet.fund_id !== fundId) {
    return NextResponse.json(
      { error: "Invalid criteria set for this fund" },
      { status: 400 }
    );
  }

  // Validate that questions set belongs to the fund
  const { data: questionsSet } = await serviceClient
    .from("questions_sets")
    .select("id, fund_id, questions_json")
    .eq("id", questionsSetId)
    .eq("rejected", false)
    .single();

  if (!questionsSet || questionsSet.fund_id !== fundId) {
    return NextResponse.json(
      { error: "Invalid questions set for this fund" },
      { status: 400 }
    );
  }

  // Create the application
  const { data: application, error: appError } = await supabase
    .from("applications")
    .insert({
      user_id: user.id,
      fund_id: fundId,
      criteria_set_id: criteriaSetId,
      questions_set_id: questionsSetId,
      title: title ?? null,
      status: "draft",
    })
    .select("id")
    .single();

  if (appError || !application) {
    console.error("application insert error:", appError);
    return NextResponse.json(
      { error: "Failed to create application" },
      { status: 500 }
    );
  }

  // Pre-populate answer rows from questions set
  const questions = Array.isArray(questionsSet.questions_json)
    ? (questionsSet.questions_json as Array<{ id: string; field_type?: string }>)
    : [];

  if (questions.length > 0) {
    const answerRows = questions.map((q) => ({
      application_id: application.id,
      question_id: q.id,
      answer_text: "",
      field_type: q.field_type ?? "text_long",
    }));

    const { error: answersError } = await serviceClient
      .from("application_answers")
      .insert(answerRows);

    if (answersError) {
      console.error("application_answers insert error:", answersError);
      // Non-fatal — application still created
    }
  }

  return NextResponse.json({ applicationId: application.id }, { status: 201 });
}
