import { createServiceClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import type { TabId } from "@/app/(dashboard)/applications/[id]/review/types";
import { ApplicationReviewClient } from "@/app/(dashboard)/applications/[id]/review/ApplicationReviewClient";
import { BreadcrumbLabels } from "@/components/Breadcrumbs";

export const dynamic = "force-dynamic";

export default async function AdminReviewDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ userId: string; reviewId: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { userId, reviewId } = await params;
  const { tab: tabParam } = await searchParams;
  const service = createServiceClient();

  // Fetch profile for back link label
  const { data: profile } = await service
    .from("profiles")
    .select("display_name")
    .eq("id", userId)
    .single();

  const userName = profile?.display_name || "User";

  // Fetch the review directly by ID
  const { data: review } = await service
    .from("application_reviews")
    .select("id, review_number, status, progress, results, error_message, questions_set_id, created_at, is_draft, application_id, credits_charged")
    .eq("id", reviewId)
    .single();

  if (!review) redirect(`/admin/beta/${userId}`);

  // Fetch application
  const { data: application } = await service
    .from("applications")
    .select("id, title, status, review_count, fund_id, questions_set_id, criteria_set_id")
    .eq("id", review.application_id)
    .single();

  if (!application) redirect(`/admin/beta/${userId}`);

  // Fetch fund + organisation
  // No rejected filter — admin service client intentionally fetches regardless of fund state
  const { data: rawFund } = await service
    .from("funds")
    .select("id, name, organisation_id, organisations(id, name), application_format")
    .eq("id", application.fund_id)
    .single();

  const fund = rawFund
    ? {
        ...rawFund,
        organisation:
          (rawFund.organisations as unknown as { id: string; name: string } | null) ?? null,
      }
    : null;

  const applicationFormat = (
    (rawFund as { application_format?: string } | null)?.application_format ?? "question_form"
  ) as "question_form" | "structured_doc" | "unstructured_doc";

  // Fetch answers
  const { data: answers } = await service
    .from("application_answers")
    .select("question_id, answer_text, last_reviewed_text, is_disabled")
    .eq("application_id", application.id);

  // Fetch questions (use review's questions_set_id if available, else application's)
  const questionsSetId = review.questions_set_id ?? application.questions_set_id;
  let questions: Array<{
    id: string;
    question: string;
    guidance?: string;
    word_count_max?: number;
    priority?: number;
  }> = [];
  if (questionsSetId) {
    // No rejected filter — admin should see questions as used at time of review
    const { data: qs } = await service
      .from("questions_sets")
      .select("questions_json")
      .eq("id", questionsSetId)
      .single();
    if (qs?.questions_json && Array.isArray(qs.questions_json)) {
      questions = qs.questions_json as unknown as typeof questions;
    }
  }

  // Fetch criteria
  const criteriaSetId = application.criteria_set_id;
  let criteria: Array<{ id: string; criterion: string }> = [];
  if (criteriaSetId) {
    // No rejected filter — admin should see criteria as used at time of review
    const { data: cs } = await service
      .from("criteria_sets")
      .select("criteria_json")
      .eq("id", criteriaSetId)
      .single();
    if (cs?.criteria_json && Array.isArray(cs.criteria_json)) {
      criteria = cs.criteria_json as unknown as typeof criteria;
    }
  }

  // isHistorical: admin always fetches a specific review by ID (no reviewNumber URL param),
  // so we compare directly rather than checking requestedNumber !== null like the user-facing page.
  const isHistorical = review.review_number < application.review_count;

  const validTabs: TabId[] = ["summary", "answers", "cross-ref"];
  const defaultTab: TabId = validTabs.includes(tabParam as TabId)
    ? (tabParam as TabId)
    : "summary";

  return (
    <>
      <BreadcrumbLabels labels={{ [userId]: userName, [reviewId]: application.title || "Untitled" }} />
      <div className="space-y-4">
        {/* Admin nav */}
        <div className="flex items-center gap-3">
          <Link
            href={`/admin/beta/${userId}`}
            className="text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
          >
            ← {userName}
          </Link>
          <span className="inline-flex rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">
            Admin view
          </span>
        </div>

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
            is_disabled: a.is_disabled,
          }))}
          review={{
            id: review.id,
            review_number: review.review_number,
            status: review.status,
            progress: review.progress as Record<string, unknown> | null,
            results: review.results as Record<string, unknown> | null,
            error_message: review.error_message,
            created_at: review.created_at,
            is_draft: review.is_draft ?? false,
            credits_charged: review.credits_charged ?? 0,
          }}
          isHistorical={isHistorical}
          defaultTab={defaultTab}
          initialFeedback={{}}
          isAdminView={true}
        />
      </div>
    </>
  );
}
