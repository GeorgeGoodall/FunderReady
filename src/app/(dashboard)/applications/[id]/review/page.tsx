import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ApplicationReviewClient } from "./ApplicationReviewClient";

export const dynamic = "force-dynamic";

export default async function ApplicationReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Fetch application
  const { data: application } = await supabase
    .from("applications")
    .select("id, title, status, review_count, fund_id")
    .eq("id", id)
    .single();

  if (!application) redirect("/dashboard");

  // Fetch fund
  const { data: fund } = await supabase
    .from("funds")
    .select("id, name, funder_organisation")
    .eq("id", application.fund_id)
    .single();

  // Fetch questions set
  const { data: app_full } = await supabase
    .from("applications")
    .select("questions_set_id")
    .eq("id", id)
    .single();

  let questions: Array<{ id: string; question: string; guidance?: string; word_count_max?: number }> = [];
  if (app_full?.questions_set_id) {
    const { data: qs } = await supabase
      .from("questions_sets")
      .select("questions_json")
      .eq("id", app_full.questions_set_id)
      .single();
    if (qs?.questions_json && Array.isArray(qs.questions_json)) {
      questions = qs.questions_json as unknown as typeof questions;
    }
  }

  // Fetch answers for outdated detection
  const { data: answers } = await supabase
    .from("application_answers")
    .select("question_id, answer_text, last_reviewed_text")
    .eq("application_id", id);

  // Fetch latest review
  const { data: review } = await supabase
    .from("application_reviews")
    .select("id, review_number, status, progress, results, error_message, created_at")
    .eq("application_id", id)
    .order("review_number", { ascending: false })
    .limit(1)
    .single();

  return (
    <ApplicationReviewClient
      application={application}
      fund={fund}
      questions={questions}
      answers={(answers ?? []).map((a) => ({
        question_id: a.question_id,
        answer_text: a.answer_text,
        last_reviewed_text: a.last_reviewed_text,
      }))}
      review={review ? {
        id: review.id,
        review_number: review.review_number,
        status: review.status,
        progress: review.progress as Record<string, unknown> | null,
        results: review.results as Record<string, unknown> | null,
        error_message: review.error_message,
        created_at: review.created_at,
      } : null}
    />
  );
}
