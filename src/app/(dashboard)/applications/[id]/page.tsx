import { createClient, createServiceClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ApplicationFormClient } from "./ApplicationFormClient";

export const dynamic = "force-dynamic";

export default async function ApplicationPage({
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

  // Fetch application (RLS enforced)
  const { data: application } = await supabase
    .from("applications")
    .select("id, user_id, fund_id, criteria_set_id, questions_set_id, title, status, review_count, created_at, updated_at")
    .eq("id", id)
    .single();

  if (!application) redirect("/dashboard");

  // Fetch answers
  const { data: answers } = await supabase
    .from("application_answers")
    .select("id, question_id, answer_text, field_type, selected_options, last_reviewed_text, is_disabled, updated_at")
    .eq("application_id", id)
    .order("created_at", { ascending: true });

  // Fetch related data
  const { data: rawFund } = await supabase
    .from("funds")
    .select("id, name, organisation_id, organisations(id, name)")
    .eq("id", application.fund_id)
    .single();

  const fund = rawFund
    ? { ...rawFund, organisation: (rawFund.organisations as unknown as { id: string; name: string } | null) ?? null }
    : null;

  const { data: questionsSet } = await supabase
    .from("questions_sets")
    .select("id, questions_json, overall_word_limit")
    .eq("id", application.questions_set_id)
    .single();

  // Fetch all approved questions sets for this fund (for swap UI)
  const serviceClient = createServiceClient();
  const { data: availableSetsRaw } = await serviceClient
    .from("questions_sets")
    .select("id, label, created_at, questions_json")
    .eq("fund_id", application.fund_id)
    .eq("approved", true)
    .order("created_at", { ascending: false });

  const availableQuestionsSets = (availableSetsRaw ?? []).map((s) => ({
    id: s.id,
    label: s.label,
    created_at: s.created_at,
    questionCount: Array.isArray(s.questions_json) ? s.questions_json.length : 0,
  }));

  return (
    <ApplicationFormClient
      application={application}
      answers={answers ?? []}
      fund={fund}
      questionsSet={questionsSet}
      availableQuestionsSets={availableQuestionsSets}
    />
  );
}
