import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { BreadcrumbLabels } from "@/components/Breadcrumbs";
import { ApplicationReviewClient } from "./ApplicationReviewClient";
import type { TabId } from "./types";

export const dynamic = "force-dynamic";

export default async function ApplicationReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ reviewNumber?: string; tab?: string }>;
}) {
  const { id } = await params;
  const { reviewNumber: reviewNumberParam, tab: tabParam } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Fetch application (single query for all needed columns)
  const { data: application } = await supabase
    .from("applications")
    .select("id, title, status, review_count, fund_id, questions_set_id, criteria_set_id")
    .eq("id", id)
    .single();

  if (!application) redirect("/dashboard");

  // Fetch fund
  const { data: rawFund } = await supabase
    .from("funds")
    .select("id, name, organisation_id, organisations(id, name), application_format")
    .eq("id", application.fund_id)
    .eq("rejected", false)
    .single();

  const fund = rawFund
    ? { ...rawFund, organisation: (rawFund.organisations as unknown as { id: string; name: string } | null) ?? null }
    : null;

  const applicationFormat = ((rawFund as { application_format?: string } | null)?.application_format ?? "question_form") as
    | "question_form"
    | "structured_doc"
    | "unstructured_doc";

  // Fetch answers for outdated detection
  const { data: answers } = await supabase
    .from("application_answers")
    .select("question_id, answer_text, last_reviewed_text")
    .eq("application_id", id);

  // Fetch specific review if reviewNumber param is provided, otherwise latest
  const requestedNumber = reviewNumberParam ? parseInt(reviewNumberParam, 10) : null;
  const isHistorical = requestedNumber !== null && requestedNumber < application.review_count;

  const reviewQuery = supabase
    .from("application_reviews")
    .select("id, review_number, status, progress, results, error_message, questions_set_id, created_at, is_draft, credits_charged")
    .eq("application_id", id);

  const { data: review } = requestedNumber
    ? await reviewQuery.eq("review_number", requestedNumber).single()
    : await reviewQuery.order("review_number", { ascending: false }).limit(1).single();

  // Use review's questions_set_id if available, otherwise fall back to application's
  const questionsSetId = review?.questions_set_id ?? application.questions_set_id;
  let questions: Array<{ id: string; question: string; guidance?: string; word_count_max?: number; priority?: number }> = [];
  if (questionsSetId) {
    const { data: qs } = await supabase
      .from("questions_sets")
      .select("questions_json")
      .eq("id", questionsSetId)
      .eq("rejected", false)
      .single();
    if (qs?.questions_json && Array.isArray(qs.questions_json)) {
      questions = qs.questions_json as unknown as typeof questions;
    }
  }

  // Fetch criteria for reference tags in cross-reference findings
  const criteriaSetId = application.criteria_set_id;
  let criteria: Array<{ id: string; criterion: string }> = [];
  if (criteriaSetId) {
    const { data: cs } = await supabase
      .from("criteria_sets")
      .select("criteria_json")
      .eq("id", criteriaSetId)
      .eq("rejected", false)
      .single();
    if (cs?.criteria_json && Array.isArray(cs.criteria_json)) {
      criteria = cs.criteria_json as unknown as typeof criteria;
    }
  }

  // Load user feedback for this review
  const initialFeedback: Record<string, "up" | "down"> = {};
  if (review) {
    const { data: feedbackRows } = await supabase
      .from("review_feedback")
      .select("item_path, sentiment")
      .eq("review_id", review.id)
      .eq("user_id", user.id);

    if (feedbackRows) {
      for (const row of feedbackRows) {
        if (row.sentiment === "up" || row.sentiment === "down") {
          initialFeedback[row.item_path] = row.sentiment;
        }
      }
    }
  }

  const validTabs: TabId[] = ["summary", "answers", "cross-ref"];
  const defaultTab: TabId = validTabs.includes(tabParam as TabId) ? (tabParam as TabId) : "summary";

  return (
    <>
      <BreadcrumbLabels labels={{ [id]: application.title || "Untitled" }} />
      <ApplicationReviewClient
        application={application}
        fund={fund}
        applicationFormat={applicationFormat}
        questions={questions}
        criteria={criteria}
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
          is_draft: review.is_draft ?? false,
          credits_charged: review.credits_charged ?? 0,
        } : null}
        isHistorical={isHistorical}
        defaultTab={defaultTab}
        initialFeedback={initialFeedback}
      />
    </>
  );
}
