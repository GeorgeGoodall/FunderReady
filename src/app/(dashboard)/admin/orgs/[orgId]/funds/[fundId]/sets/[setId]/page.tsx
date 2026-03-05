import { createServiceClient, createClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { AdminActionBar } from "../../../../../../components/AdminActionBar";
import { AdminAmendForm } from "../../../../../../components/AdminAmendForm";
import { SetContentDisplay } from "../../../../../../components/SetContentDisplay";
import { formatDate } from "../../../../../../lib/format";
import { CriteriaSetSchema, QuestionsSetSchema } from "@/lib/schemas/criteria";
import type { CriteriaSet, QuestionsSet } from "@/lib/schemas/criteria";

export const dynamic = "force-dynamic";

function parseCriteriaSet(row: {
  name: string;
  description: string | null;
  criteria_json: unknown;
}): CriteriaSet {
  const result = CriteriaSetSchema.safeParse({
    name: row.name || "Criteria",
    description: row.description ?? undefined,
    criteria: row.criteria_json,
  });
  if (result.success) return result.data;
  // Fallback: return minimal valid shape
  return { name: row.name || "Criteria", criteria: [] };
}

function parseQuestionsSet(row: {
  questions_json: unknown;
  overall_word_limit: number | null;
}): QuestionsSet {
  const result = QuestionsSetSchema.safeParse({
    questions: row.questions_json,
    overall_word_limit: row.overall_word_limit ?? undefined,
  });
  if (result.success) return result.data;
  return { questions: [] };
}

export default async function SetDetailPage({
  params,
}: {
  params: Promise<{ orgId: string; fundId: string; setId: string }>;
}) {
  const { orgId, fundId, setId } = await params;

  // Auth guard — defense in depth (layout also checks)
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const serviceClient = createServiceClient();
  const { data: profile } = await serviceClient
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();
  if (!profile?.is_admin) redirect("/dashboard");

  // Query both set types and org/fund in parallel
  const [{ data: criteriaSet }, { data: questionsSet }, { data: org, error: orgError }, { data: fund, error: fundError }] = await Promise.all([
    serviceClient
      .from("criteria_sets")
      .select("*")
      .eq("id", setId)
      .eq("rejected", false)
      .maybeSingle(),
    serviceClient
      .from("questions_sets")
      .select("*")
      .eq("id", setId)
      .eq("rejected", false)
      .maybeSingle(),
    serviceClient
      .from("organisations")
      .select("id, name")
      .eq("id", orgId)
      .eq("rejected", false)
      .single(),
    serviceClient
      .from("funds")
      .select("id, name")
      .eq("id", fundId)
      .eq("rejected", false)
      .single(),
  ]);

  if (orgError || fundError || !org || !fund) notFound();

  let setType: "criteria" | "questions";
  let parsedData: CriteriaSet | QuestionsSet;
  let approved: boolean;
  let createdAt: string;
  let setName: string;

  if (criteriaSet) {
    setType = "criteria";
    parsedData = parseCriteriaSet(criteriaSet);
    approved = criteriaSet.approved;
    createdAt = criteriaSet.created_at;
    setName = criteriaSet.name || criteriaSet.label || "Criteria Set";
  } else if (questionsSet) {
    setType = "questions";
    parsedData = parseQuestionsSet(questionsSet);
    approved = questionsSet.approved;
    createdAt = questionsSet.created_at;
    setName = questionsSet.label || "Questions Set";
  } else {
    notFound();
  }

  const entityType =
    setType === "criteria" ? "criteria-sets" : "questions-sets";

  return (
    <div className="space-y-8">
      {/* Breadcrumb */}
      <nav className="text-sm text-zinc-500">
        <Link href="/admin" className="hover:underline">
          Organisations
        </Link>
        <span className="mx-1">/</span>
        <Link href={`/admin/orgs/${orgId}`} className="hover:underline">
          {org.name}
        </Link>
        <span className="mx-1">/</span>
        <Link
          href={`/admin/orgs/${orgId}/funds/${fundId}`}
          className="hover:underline"
        >
          {fund.name}
        </Link>
        <span className="mx-1">/</span>
        <span className="text-zinc-900 dark:text-zinc-100">{setName}</span>
      </nav>

      {/* Set Header */}
      <div>
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-semibold">{setName}</h2>
          <span
            className={`text-xs px-2 py-0.5 rounded-full ${
              approved
                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300"
                : "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
            }`}
          >
            {approved ? "Approved" : "Pending"}
          </span>
          <span className="text-xs text-zinc-500">
            {setType === "criteria" ? "Criteria Set" : "Questions Set"}
          </span>
        </div>
        <p className="text-xs text-zinc-400 mt-1">{formatDate(createdAt)}</p>
      </div>

      {/* Action Bar */}
      <AdminActionBar
        entityType={entityType}
        entityId={setId}
        approved={approved}
        parentUrl={`/admin/orgs/${orgId}/funds/${fundId}`}
      />

      {/* Amend Form — creates a new version (sets are immutable).
           Content display is passed as children so it hides when editing. */}
      <AdminAmendForm
        setType={setType}
        setId={setId}
        fundId={fundId}
        orgId={orgId}
        initialData={parsedData}
      >
        <section className="mt-8">
          <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-3">
            Content
          </h3>
          <SetContentDisplay type={setType} data={parsedData} />
        </section>
      </AdminAmendForm>
    </div>
  );
}
