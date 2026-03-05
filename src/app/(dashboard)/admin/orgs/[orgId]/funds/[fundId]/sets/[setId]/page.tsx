import { createServiceClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { AdminActionBar } from "../../../../../../components/AdminActionBar";
import { AdminAmendForm } from "../../../../../../components/AdminAmendForm";
import { SetContentDisplay } from "../../../../../../components/SetContentDisplay";
import type { CriteriaSet, QuestionsSet } from "@/lib/schemas/criteria";
import type { Json } from "@/types/database";

export const dynamic = "force-dynamic";

function parseCriteriaSet(row: {
  name: string;
  description: string | null;
  criteria_json: Json;
}): CriteriaSet {
  const criteria = Array.isArray(row.criteria_json) ? row.criteria_json : [];
  return {
    name: row.name || "Criteria",
    description: row.description ?? undefined,
    criteria: criteria.map((c: Json, i: number) => {
      const obj =
        c && typeof c === "object" && !Array.isArray(c)
          ? (c as Record<string, Json | undefined>)
          : {};
      return {
        id: (obj.id as string) ?? `c${i + 1}`,
        criterion: (obj.criterion as string) ?? "",
        weight: typeof obj.weight === "string" ? obj.weight : undefined,
        sub_questions: Array.isArray(obj.sub_questions)
          ? (obj.sub_questions as Json[]).map((sq: Json) => {
              if (typeof sq === "string") return { text: sq, required: true };
              if (sq && typeof sq === "object" && !Array.isArray(sq)) {
                const sqObj = sq as Record<string, Json | undefined>;
                return {
                  text: (sqObj.text as string) ?? "",
                  required: sqObj.required !== false,
                };
              }
              return { text: "", required: true };
            })
          : [],
      };
    }),
  };
}

function parseQuestionsSet(row: {
  questions_json: Json;
  overall_word_limit: number | null;
}): QuestionsSet {
  const questions = Array.isArray(row.questions_json)
    ? row.questions_json
    : [];
  return {
    questions: questions.map((q: Json, i: number) => {
      const obj =
        q && typeof q === "object" && !Array.isArray(q)
          ? (q as Record<string, Json | undefined>)
          : {};
      return {
        id: (obj.id as string) ?? `q${i + 1}`,
        question: (obj.question as string) ?? "",
        word_count_min:
          typeof obj.word_count_min === "number"
            ? obj.word_count_min
            : undefined,
        word_count_max:
          typeof obj.word_count_max === "number"
            ? obj.word_count_max
            : undefined,
        guidance:
          typeof obj.guidance === "string" ? obj.guidance : undefined,
        priority:
          typeof obj.priority === "number" ? obj.priority : undefined,
        field_type:
          typeof obj.field_type === "string"
            ? (obj.field_type as "text_long")
            : undefined,
        options: Array.isArray(obj.options)
          ? (obj.options as string[])
          : undefined,
      };
    }),
    overall_word_limit: row.overall_word_limit ?? undefined,
  };
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
}

export default async function SetDetailPage({
  params,
}: {
  params: Promise<{ orgId: string; fundId: string; setId: string }>;
}) {
  const { orgId, fundId, setId } = await params;
  const serviceClient = createServiceClient();

  // Try criteria_sets first
  let setType: "criteria" | "questions" = "criteria";
  let parsedData: CriteriaSet | QuestionsSet;
  let approved = false;
  let createdAt = "";
  let setName = "";

  const { data: criteriaSet } = await serviceClient
    .from("criteria_sets")
    .select("*")
    .eq("id", setId)
    .eq("rejected", false)
    .single();

  if (criteriaSet) {
    setType = "criteria";
    parsedData = parseCriteriaSet(criteriaSet);
    approved = criteriaSet.approved;
    createdAt = criteriaSet.created_at;
    setName = criteriaSet.name || criteriaSet.label || "Criteria Set";
  } else {
    // Try questions_sets
    const { data: questionsSet } = await serviceClient
      .from("questions_sets")
      .select("*")
      .eq("id", setId)
      .eq("rejected", false)
      .single();

    if (!questionsSet) notFound();

    setType = "questions";
    parsedData = parseQuestionsSet(questionsSet);
    approved = questionsSet.approved;
    createdAt = questionsSet.created_at;
    setName = questionsSet.label || "Questions Set";
  }

  // Fetch org and fund for breadcrumb
  const [{ data: org }, { data: fund }] = await Promise.all([
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

  if (!org || !fund) notFound();

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

      {/* Amend Form (only for pending sets) */}
      {!approved && (
        <AdminAmendForm
          setType={setType}
          setId={setId}
          fundId={fundId}
          initialData={parsedData}
        />
      )}

      {/* Content Display */}
      <section>
        <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-3">
          Content
        </h3>
        <SetContentDisplay type={setType} data={parsedData} />
      </section>
    </div>
  );
}
