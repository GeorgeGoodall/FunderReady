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

  // Load fund to get application_format
  const { data: fund } = await serviceClient
    .from("funds")
    .select("id, application_format")
    .eq("id", fundId)
    .single();

  if (!fund) {
    return NextResponse.json({ error: "Fund not found" }, { status: 400 });
  }

  const applicationFormat = (fund.application_format as string) ?? "question_form";

  // Validate criteria set belongs to this fund
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

  // Validate questions set (required for question_form and structured_doc, absent for unstructured_doc)
  let questionsJson: Array<{ id: string; field_type?: string }> = [];

  if (applicationFormat === "unstructured_doc") {
    if (questionsSetId) {
      return NextResponse.json(
        { error: "unstructured_doc funds do not use a questions set" },
        { status: 400 }
      );
    }
  } else {
    if (!questionsSetId) {
      return NextResponse.json(
        { error: "questionsSetId is required for this fund format" },
        { status: 400 }
      );
    }

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

    questionsJson = Array.isArray(questionsSet.questions_json)
      ? (questionsSet.questions_json as Array<{ id: string; field_type?: string }>)
      : [];
  }

  // Create the application
  const { data: application, error: appError } = await supabase
    .from("applications")
    .insert({
      user_id: user.id,
      fund_id: fundId,
      criteria_set_id: criteriaSetId,
      questions_set_id: questionsSetId ?? null,
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

  // Pre-populate answer rows
  let answerRows: Array<{
    application_id: string;
    question_id: string;
    answer_text: string;
    field_type: string;
  }>;

  if (applicationFormat === "unstructured_doc") {
    answerRows = [
      {
        application_id: application.id,
        question_id: "document_content",
        answer_text: "",
        field_type: "text_long",
      },
    ];
  } else {
    answerRows = questionsJson.map((q) => ({
      application_id: application.id,
      question_id: q.id,
      answer_text: "",
      field_type: q.field_type ?? "text_long",
    }));
  }

  if (answerRows.length > 0) {
    const { error: answersError } = await serviceClient
      .from("application_answers")
      .insert(answerRows);

    if (answersError) {
      console.error("application_answers insert error:", answersError);
      await serviceClient.from("applications").delete().eq("id", application.id);
      return NextResponse.json(
        { error: "Failed to create application answers" },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ applicationId: application.id }, { status: 201 });
}
