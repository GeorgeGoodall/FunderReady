import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { BreadcrumbLabels } from "@/components/Breadcrumbs";
import { NewQuestionsSetClient } from "./NewQuestionsSetClient";

export const dynamic = "force-dynamic";

export default async function NewQuestionsSetPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string; returnTo?: string; applicationId?: string }>;
}) {
  const { id: fundId } = await params;
  const { from, returnTo, applicationId } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Fetch fund name
  const { data: fund } = await supabase
    .from("funds")
    .select("id, name")
    .eq("id", fundId)
    .eq("rejected", false)
    .single();

  if (!fund) redirect("/dashboard");

  // Fetch source questions set if `from` param provided
  let sourceQuestions: Array<Record<string, unknown>> = [];
  let sourceOverallWordLimit: number | undefined;

  if (from) {
    const { data: qs } = await supabase
      .from("questions_sets")
      .select("questions_json, overall_word_limit")
      .eq("id", from)
      .eq("rejected", false)
      .single();

    if (qs?.questions_json && Array.isArray(qs.questions_json)) {
      sourceQuestions = qs.questions_json as Array<Record<string, unknown>>;
    }
    if (qs?.overall_word_limit) {
      sourceOverallWordLimit = qs.overall_word_limit;
    }
  }

  return (
    <>
      <BreadcrumbLabels labels={{ [fundId]: fund.name }} />
      <NewQuestionsSetClient
        fundId={fund.id}
        fundName={fund.name}
        sourceQuestions={sourceQuestions}
        sourceOverallWordLimit={sourceOverallWordLimit}
        applicationId={applicationId}
        returnTo={returnTo}
      />
    </>
  );
}
