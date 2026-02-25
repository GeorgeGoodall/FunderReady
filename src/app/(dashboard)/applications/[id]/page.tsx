import { createClient } from "@/lib/supabase/server";
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
    .select("id, question_id, answer_text, field_type, selected_options, last_reviewed_text, updated_at")
    .eq("application_id", id)
    .order("created_at", { ascending: true });

  // Fetch related data
  const { data: fund } = await supabase
    .from("funds")
    .select("id, name, funder_organisation")
    .eq("id", application.fund_id)
    .single();

  const { data: questionsSet } = await supabase
    .from("questions_sets")
    .select("id, questions_json, overall_word_limit")
    .eq("id", application.questions_set_id)
    .single();

  return (
    <ApplicationFormClient
      application={application}
      answers={answers ?? []}
      fund={fund}
      questionsSet={questionsSet}
    />
  );
}
