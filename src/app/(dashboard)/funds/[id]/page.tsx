import { notFound, redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { FundDetailClient } from "./FundDetailClient";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function FundDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  if (!UUID_RE.test(id)) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const serviceClient = createServiceClient();

  // Fund + organisation (RLS scoped)
  const { data: fund, error: fundError } = await supabase
    .from("funds")
    .select(
      "id, name, organisation_id, organisations(id, name, url), url, notes, published, created_at"
    )
    .eq("id", id)
    .eq("rejected", false)
    .single();

  if (fundError || !fund) {
    notFound();
  }

  // Parallel fetch: criteria sets, questions sets, application count, review count
  const [
    { data: criteriaSets },
    { data: questionsSets },
    { count: applicationCount },
    { count: reviewCount },
  ] = await Promise.all([
    supabase
      .from("criteria_sets")
      .select("id, label, name, description, criteria_json, created_at")
      .eq("fund_id", id)
      .eq("approved", true)
      .eq("rejected", false)
      .order("created_at", { ascending: false }),
    supabase
      .from("questions_sets")
      .select("id, label, questions_json, overall_word_limit, created_at")
      .eq("fund_id", id)
      .eq("approved", true)
      .eq("rejected", false)
      .order("created_at", { ascending: false }),
    serviceClient
      .from("applications")
      .select("id", { count: "exact", head: true })
      .eq("fund_id", id),
    serviceClient
      .from("application_reviews")
      .select("id, applications!inner(fund_id)", { count: "exact", head: true })
      .eq("applications.fund_id", id),
  ]);

  const organisation = fund.organisations as unknown as {
    id: string;
    name: string;
    url: string | null;
  } | null;

  return (
    <FundDetailClient
      fund={{
        id: fund.id,
        name: fund.name,
        url: fund.url,
        notes: fund.notes,
        published: fund.published,
        created_at: fund.created_at,
      }}
      organisation={organisation}
      criteriaSets={criteriaSets ?? []}
      questionsSets={questionsSets ?? []}
      applicationCount={applicationCount ?? 0}
      reviewCount={reviewCount ?? 0}
    />
  );
}
