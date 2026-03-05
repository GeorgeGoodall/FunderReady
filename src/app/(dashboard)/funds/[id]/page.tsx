import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/server";
import { FundDetailClient } from "./FundDetailClient";

export default async function FundDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
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

  // All approved criteria sets
  const { data: criteriaSets } = await supabase
    .from("criteria_sets")
    .select("id, label, name, description, criteria_json, created_at")
    .eq("fund_id", id)
    .eq("approved", true)
    .eq("rejected", false)
    .order("created_at", { ascending: false });

  // All approved questions sets
  const { data: questionsSets } = await supabase
    .from("questions_sets")
    .select("id, label, questions_json, overall_word_limit, created_at")
    .eq("fund_id", id)
    .eq("approved", true)
    .eq("rejected", false)
    .order("created_at", { ascending: false });

  // Application count (service client to bypass RLS)
  const { count: applicationCount } = await serviceClient
    .from("applications")
    .select("id", { count: "exact", head: true })
    .eq("fund_id", id);

  // Review count via application_reviews joined to applications
  const { count: reviewCount } = await serviceClient
    .from("application_reviews")
    .select("id, applications!inner(fund_id)", { count: "exact", head: true })
    .eq("applications.fund_id", id);

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
