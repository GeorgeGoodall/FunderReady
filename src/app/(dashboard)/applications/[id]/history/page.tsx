import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { BreadcrumbLabels } from "@/components/Breadcrumbs";
import { HistoryClient } from "./HistoryClient";

export const dynamic = "force-dynamic";

export default async function ApplicationHistoryPage({
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

  const { data: application } = await supabase
    .from("applications")
    .select("id, title, review_count, fund_id")
    .eq("id", id)
    .single();

  if (!application) redirect("/dashboard");

  const { data: rawFund } = await supabase
    .from("funds")
    .select("name, organisation_id, organisations(id, name)")
    .eq("id", application.fund_id)
    .eq("rejected", false)
    .single();

  const fund = rawFund
    ? { ...rawFund, organisation: (rawFund.organisations as unknown as { id: string; name: string } | null) ?? null }
    : null;

  // Fetch all reviews with results (to extract overall_score server-side)
  const { data: rawReviews } = await supabase
    .from("application_reviews")
    .select("id, review_number, status, results, error_message, created_at, is_draft")
    .eq("application_id", id)
    .order("review_number", { ascending: true });

  const reviews = (rawReviews ?? []).map((r) => {
    const scoring = (r.results as Record<string, unknown> | null)?.scoring as Record<string, unknown> | undefined;
    return {
      id: r.id,
      review_number: r.review_number,
      status: r.status,
      overall_score: typeof scoring?.overall_score === "number" ? scoring.overall_score : null,
      submission_readiness: typeof scoring?.submission_readiness === "string" ? scoring.submission_readiness : null,
      error_message: r.error_message,
      created_at: r.created_at,
      is_draft: r.is_draft ?? false,
    };
  });

  return (
    <>
      <BreadcrumbLabels labels={{ [id]: application.title || "Untitled" }} />
      <HistoryClient
        application={{
          id: application.id,
          title: application.title,
          review_count: application.review_count,
        }}
        fund={fund ?? null}
        reviews={reviews}
      />
    </>
  );
}
