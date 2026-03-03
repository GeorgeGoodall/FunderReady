import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string; reviewId: string }> }
) {
  const { id: applicationId, reviewId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Fetch source application — RLS enforces ownership
  const { data: sourceApp } = await supabase
    .from("applications")
    .select("id, fund_id, criteria_set_id, questions_set_id, title")
    .eq("id", applicationId)
    .single();

  if (!sourceApp) {
    return NextResponse.json({ error: "Application not found" }, { status: 404 });
  }

  // Fetch the review — must belong to this application and be completed
  const { data: review } = await supabase
    .from("application_reviews")
    .select("id, review_number, status, results, questions_set_id, criteria_set_id")
    .eq("id", reviewId)
    .eq("application_id", applicationId)
    .eq("status", "completed")
    .single();

  if (!review) {
    return NextResponse.json({ error: "Review not found" }, { status: 404 });
  }

  // Rate limit: max 5 drafts from a single review
  const { count } = await supabase
    .from("applications")
    .select("id", { count: "exact", head: true })
    .like("title", `%Review #${review.review_number} draft%`)
    .eq("fund_id", sourceApp.fund_id);

  if ((count ?? 0) >= 5) {
    return NextResponse.json(
      { error: "Maximum drafts from this review reached (5)" },
      { status: 429 }
    );
  }

  // Use the review's sets (which were the active sets at review time) with fallback to source app
  const questionsSetId = review.questions_set_id ?? sourceApp.questions_set_id;
  const criteriaSetId = review.criteria_set_id ?? sourceApp.criteria_set_id;

  const serviceClient = createServiceClient();

  // Load questions so we can create answer rows
  const { data: questionsSet } = await serviceClient
    .from("questions_sets")
    .select("questions_json")
    .eq("id", questionsSetId)
    .single();

  const questions = Array.isArray(questionsSet?.questions_json)
    ? (questionsSet.questions_json as Array<{ id: string; field_type?: string }>)
    : [];

  // Build a title for the new draft
  const baseTitle = sourceApp.title;
  const newTitle = baseTitle
    ? `${baseTitle} — Review #${review.review_number} draft`
    : `Review #${review.review_number} draft`;

  // Create the new application
  const { data: newApp, error: appError } = await supabase
    .from("applications")
    .insert({
      user_id: user.id,
      fund_id: sourceApp.fund_id,
      criteria_set_id: criteriaSetId,
      questions_set_id: questionsSetId,
      title: newTitle,
      status: "draft",
    })
    .select("id")
    .single();

  if (appError || !newApp) {
    console.error("new application insert error:", appError);
    return NextResponse.json({ error: "Failed to create draft" }, { status: 500 });
  }

  // Build answer map from review snapshot (stored since latest pipeline version)
  const results = review.results as Record<string, unknown> | null;
  const rawSnapshot = results?.answer_snapshot;
  const disabledAnswerIds = new Set(
    Array.isArray(results?.disabled_answer_ids)
      ? (results.disabled_answer_ids as string[])
      : []
  );
  const snapshotMap = new Map<string, { answer_text: string; selected_options: unknown }>();

  if (Array.isArray(rawSnapshot)) {
    for (const item of rawSnapshot as Array<{ question_id: string; answer_text: string; selected_options?: unknown }>) {
      if (item.question_id && typeof item.answer_text === "string") {
        snapshotMap.set(item.question_id, {
          answer_text: item.answer_text,
          selected_options: item.selected_options ?? null,
        });
      }
    }
  } else {
    // Fallback for reviews that predate snapshot storage: use current answers
    const { data: currentAnswers } = await supabase
      .from("application_answers")
      .select("question_id, answer_text, selected_options, is_disabled")
      .eq("application_id", applicationId);

    for (const a of currentAnswers ?? []) {
      snapshotMap.set(a.question_id, {
        answer_text: a.answer_text,
        selected_options: a.selected_options ?? null,
      });
      if (a.is_disabled) {
        disabledAnswerIds.add(a.question_id);
      }
    }
  }

  // Pre-populate answer rows from the snapshot
  if (questions.length > 0) {
    const answerRows = questions.map((q) => {
      const snapshot = snapshotMap.get(q.id);
      return {
        application_id: newApp.id,
        question_id: q.id,
        answer_text: snapshot?.answer_text ?? "",
        field_type: q.field_type ?? "text_long",
        selected_options: snapshot?.selected_options ?? null,
        is_disabled: disabledAnswerIds.has(q.id),
      };
    });

    const { error: answersError } = await serviceClient
      .from("application_answers")
      .insert(answerRows);

    if (answersError) {
      console.error("application_answers insert error:", answersError);
      // Non-fatal — application still created
    }
  }

  return NextResponse.json({ applicationId: newApp.id }, { status: 201 });
}
