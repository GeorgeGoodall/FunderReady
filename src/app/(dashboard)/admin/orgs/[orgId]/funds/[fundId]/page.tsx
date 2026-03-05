import { createServiceClient, createClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { AdminActionBar } from "../../../../components/AdminActionBar";
import { HistoricalSets } from "../../../../components/HistoricalSets";
import { formatDate } from "../../../../lib/format";
import type { Json } from "@/types/database";

export const dynamic = "force-dynamic";

function countJson(json: Json): number {
  return Array.isArray(json) ? json.length : 0;
}

interface CriteriaSetRow {
  id: string;
  name: string;
  label: string | null;
  description: string | null;
  criteria_json: Json;
  approved: boolean;
  created_at: string;
}

interface QuestionsSetRow {
  id: string;
  label: string | null;
  questions_json: Json;
  overall_word_limit: number | null;
  approved: boolean;
  created_at: string;
}

function CriteriaSetCard({ cs, orgId, fundId }: { cs: CriteriaSetRow; orgId: string; fundId: string }) {
  return (
    <Link
      href={`/admin/orgs/${orgId}/funds/${fundId}/sets/${cs.id}`}
      className="block bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg p-3 hover:bg-zinc-50 dark:hover:bg-zinc-750"
    >
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
          {cs.name || cs.label || "Untitled"}
        </span>
        <span className="text-xs text-zinc-500">
          {countJson(cs.criteria_json)} criteria
        </span>
        <span className={`text-xs px-2 py-0.5 rounded-full ${
          cs.approved
            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300"
            : "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
        }`}>
          {cs.approved ? "approved" : "pending"}
        </span>
      </div>
      <p className="text-xs text-zinc-400 mt-0.5">{formatDate(cs.created_at)}</p>
    </Link>
  );
}

function QuestionsSetCard({ qs, orgId, fundId }: { qs: QuestionsSetRow; orgId: string; fundId: string }) {
  return (
    <Link
      href={`/admin/orgs/${orgId}/funds/${fundId}/sets/${qs.id}`}
      className="block bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg p-3 hover:bg-zinc-50 dark:hover:bg-zinc-750"
    >
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
          {qs.label || "Untitled"}
        </span>
        <span className="text-xs text-zinc-500">
          {countJson(qs.questions_json)} questions
        </span>
        {qs.overall_word_limit && (
          <span className="text-xs text-zinc-500">
            ({qs.overall_word_limit} word limit)
          </span>
        )}
        <span className={`text-xs px-2 py-0.5 rounded-full ${
          qs.approved
            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300"
            : "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
        }`}>
          {qs.approved ? "approved" : "pending"}
        </span>
      </div>
      <p className="text-xs text-zinc-400 mt-0.5">{formatDate(qs.created_at)}</p>
    </Link>
  );
}

function CriteriaSetsSection({ criteriaSets, orgId, fundId }: { criteriaSets: CriteriaSetRow[]; orgId: string; fundId: string }) {
  // Latest approved set is "active", pending sets need action, rest are historical
  const latestApproved = criteriaSets.find((cs) => cs.approved);
  const pending = criteriaSets.filter((cs) => !cs.approved);
  const historical = criteriaSets.filter((cs) => cs.approved && cs !== latestApproved);

  return (
    <section>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
          Criteria Sets
        </h3>
        <Link
          href={`/admin/orgs/${orgId}/funds/${fundId}/new-set/criteria`}
          className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
        >
          + New Criteria Set
        </Link>
      </div>

      {criteriaSets.length === 0 ? (
        <p className="text-sm text-zinc-500">No criteria sets.</p>
      ) : (
        <div>
          {/* Active (latest approved) */}
          {latestApproved && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400 uppercase tracking-wide">Active</p>
              <CriteriaSetCard cs={latestApproved} orgId={orgId} fundId={fundId} />
            </div>
          )}

          {/* Pending (need admin action) */}
          {pending.length > 0 && (
            <div className="mt-3 space-y-2">
              <p className="text-xs font-medium text-amber-600 dark:text-amber-400 uppercase tracking-wide">Pending ({pending.length})</p>
              {pending.map((cs) => (
                <CriteriaSetCard key={cs.id} cs={cs} orgId={orgId} fundId={fundId} />
              ))}
            </div>
          )}

          {/* Historical */}
          <HistoricalSets count={historical.length}>
            {historical.map((cs) => (
              <CriteriaSetCard key={cs.id} cs={cs} orgId={orgId} fundId={fundId} />
            ))}
          </HistoricalSets>
        </div>
      )}
    </section>
  );
}

function QuestionsSetsSection({ questionsSets, orgId, fundId }: { questionsSets: QuestionsSetRow[]; orgId: string; fundId: string }) {
  const latestApproved = questionsSets.find((qs) => qs.approved);
  const pending = questionsSets.filter((qs) => !qs.approved);
  const historical = questionsSets.filter((qs) => qs.approved && qs !== latestApproved);

  return (
    <section>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
          Questions Sets
        </h3>
        <Link
          href={`/admin/orgs/${orgId}/funds/${fundId}/new-set/questions`}
          className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
        >
          + New Questions Set
        </Link>
      </div>

      {questionsSets.length === 0 ? (
        <p className="text-sm text-zinc-500">No questions sets.</p>
      ) : (
        <div>
          {/* Active (latest approved) */}
          {latestApproved && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400 uppercase tracking-wide">Active</p>
              <QuestionsSetCard qs={latestApproved} orgId={orgId} fundId={fundId} />
            </div>
          )}

          {/* Pending (need admin action) */}
          {pending.length > 0 && (
            <div className="mt-3 space-y-2">
              <p className="text-xs font-medium text-amber-600 dark:text-amber-400 uppercase tracking-wide">Pending ({pending.length})</p>
              {pending.map((qs) => (
                <QuestionsSetCard key={qs.id} qs={qs} orgId={orgId} fundId={fundId} />
              ))}
            </div>
          )}

          {/* Historical */}
          <HistoricalSets count={historical.length}>
            {historical.map((qs) => (
              <QuestionsSetCard key={qs.id} qs={qs} orgId={orgId} fundId={fundId} />
            ))}
          </HistoricalSets>
        </div>
      )}
    </section>
  );
}

export default async function FundDetailPage({
  params,
}: {
  params: Promise<{ orgId: string; fundId: string }>;
}) {
  const { orgId, fundId } = await params;

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

  // Fetch fund
  const { data: fund } = await serviceClient
    .from("funds")
    .select("*")
    .eq("id", fundId)
    .eq("rejected", false)
    .single();

  if (!fund) notFound();

  // Fetch parent org for breadcrumb
  const { data: org } = await serviceClient
    .from("organisations")
    .select("id, name")
    .eq("id", orgId)
    .eq("rejected", false)
    .single();

  if (!org) notFound();

  // Fetch criteria sets and questions sets
  const [{ data: criteriaSets }, { data: questionsSets }] = await Promise.all([
    serviceClient
      .from("criteria_sets")
      .select("id, name, label, description, criteria_json, approved, created_at")
      .eq("fund_id", fundId)
      .eq("rejected", false)
      .order("created_at", { ascending: false }),
    serviceClient
      .from("questions_sets")
      .select("id, label, questions_json, overall_word_limit, approved, created_at")
      .eq("fund_id", fundId)
      .eq("rejected", false)
      .order("created_at", { ascending: false }),
  ]);

  return (
    <div className="space-y-8">
      {/* Breadcrumb */}
      <nav className="text-sm text-zinc-500">
        <Link href="/admin" className="hover:underline">Organisations</Link>
        <span className="mx-1">/</span>
        <Link href={`/admin/orgs/${orgId}`} className="hover:underline">{org.name}</Link>
        <span className="mx-1">/</span>
        <span className="text-zinc-900 dark:text-zinc-100">{fund.name}</span>
      </nav>

      {/* Fund Header */}
      <div>
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-semibold">{fund.name}</h2>
          <span className={`text-xs px-2 py-0.5 rounded-full ${
            fund.published
              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300"
              : "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
          }`}>
            {fund.published ? "Published" : "Unpublished"}
          </span>
        </div>
        {fund.url && (
          <a href={fund.url} target="_blank" rel="noopener noreferrer"
            className="text-sm text-indigo-600 hover:underline dark:text-indigo-400">
            {fund.url}
          </a>
        )}
        {fund.notes && <p className="mt-1 text-sm text-zinc-500">{fund.notes}</p>}
      </div>

      {/* Action Bar */}
      <AdminActionBar
        entityType="funds"
        entityId={fundId}
        approved={fund.published}
        parentUrl={`/admin/orgs/${orgId}`}
        editFields={[
          { name: "name", label: "Name", type: "text" },
          { name: "url", label: "URL", type: "text" },
          { name: "notes", label: "Notes", type: "textarea" },
        ]}
        initialValues={{
          name: fund.name,
          url: fund.url ?? "",
          notes: fund.notes ?? "",
        }}
      />

      {/* Criteria Sets */}
      <CriteriaSetsSection
        criteriaSets={criteriaSets ?? []}
        orgId={orgId}
        fundId={fundId}
      />

      {/* Questions Sets */}
      <QuestionsSetsSection
        questionsSets={questionsSets ?? []}
        orgId={orgId}
        fundId={fundId}
      />
    </div>
  );
}
