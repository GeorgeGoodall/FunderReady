import { createServiceClient, createClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { BreadcrumbLabels } from "@/components/Breadcrumbs";
import { AdminActionBar } from "../../../../components/AdminActionBar";
import { HistoricalSets } from "../../../../components/HistoricalSets";
import { formatDate } from "../../../../lib/format";
import { CriteriaSetCard } from "./components/CriteriaSetCard";
import { QuestionsSetCard } from "./components/QuestionsSetCard";
import type { CriteriaSetRow } from "./components/CriteriaSetCard";
import type { QuestionsSetRow } from "./components/QuestionsSetCard";

export const dynamic = "force-dynamic";

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
    <>
      <BreadcrumbLabels labels={{ [orgId]: org.name, [fundId]: fund.name }} />
      <div className="space-y-8">
        {/* Fund Header */}
      <div>
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-semibold">{fund.name}</h2>
          <span className={`text-xs px-2 py-0.5 rounded-full ${
            fund.approved
              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300"
              : "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
          }`}>
            {fund.approved ? "Approved" : "Pending review"}
          </span>
        </div>
        {fund.url && (
          <a href={fund.url} target="_blank" rel="noopener noreferrer"
            className="text-sm text-indigo-600 hover:underline dark:text-indigo-400">
            {fund.url}
          </a>
        )}
        {fund.notes && <p className="mt-1 text-sm text-zinc-500">{fund.notes}</p>}
        {(fund.opens_at || fund.closes_at) && (
          <div className="mt-2 flex gap-4 text-sm text-zinc-500">
            {fund.opens_at && (
              <span>Opens: <strong className="text-zinc-700 dark:text-zinc-300">{formatDate(fund.opens_at)}</strong></span>
            )}
            {fund.closes_at && (
              <span>Deadline: <strong className="text-zinc-700 dark:text-zinc-300">{formatDate(fund.closes_at)}</strong></span>
            )}
          </div>
        )}
      </div>

      {/* Action Bar */}
      <AdminActionBar
        entityType="funds"
        entityId={fundId}
        approved={fund.approved}
        parentUrl={`/admin/orgs/${orgId}`}
        editFields={[
          { name: "name", label: "Name", type: "text" },
          { name: "url", label: "URL", type: "text" },
          { name: "notes", label: "Notes", type: "textarea" },
          { name: "opens_at", label: "Opens", type: "date" },
          { name: "closes_at", label: "Deadline", type: "date" },
        ]}
        initialValues={{
          name: fund.name,
          url: fund.url ?? "",
          notes: fund.notes ?? "",
          opens_at: fund.opens_at ? fund.opens_at.slice(0, 10) : "",
          closes_at: fund.closes_at ? fund.closes_at.slice(0, 10) : "",
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
    </>
  );
}
