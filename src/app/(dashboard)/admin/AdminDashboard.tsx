"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Json } from "@/types/database";

interface PendingCriteriaSet {
  id: string;
  name: string;
  description: string | null;
  criteria_json: Json;
  created_at: string;
  fund_id: string;
  created_by: string;
  funds: { name: string }[] | null;
}

interface PendingQuestionsSet {
  id: string;
  questions_json: Json;
  overall_word_limit: number | null;
  created_at: string;
  fund_id: string;
  created_by: string;
  funds: { name: string }[] | null;
}

interface AdminDashboardProps {
  pendingCriteriaSets: PendingCriteriaSet[];
  pendingQuestionsSets: PendingQuestionsSet[];
}

export function AdminDashboard({
  pendingCriteriaSets,
  pendingQuestionsSets,
}: AdminDashboardProps) {
  const router = useRouter();
  const [approvingId, setApprovingId] = useState<string | null>(null);

  const handleApproveCriteria = async (id: string) => {
    setApprovingId(id);
    try {
      const res = await fetch(`/api/admin/criteria-sets/${id}/approve`, {
        method: "PATCH",
      });
      if (res.ok) {
        router.refresh();
      }
    } finally {
      setApprovingId(null);
    }
  };

  const handleApproveQuestions = async (id: string) => {
    setApprovingId(id);
    try {
      const res = await fetch(`/api/admin/questions-sets/${id}/approve`, {
        method: "PATCH",
      });
      if (res.ok) {
        router.refresh();
      }
    } finally {
      setApprovingId(null);
    }
  };

  const getCriteriaCount = (json: Json): number => {
    if (Array.isArray(json)) return json.length;
    return 0;
  };

  const getQuestionsCount = (json: Json): number => {
    if (Array.isArray(json)) return json.length;
    return 0;
  };

  const formatDate = (iso: string): string => {
    const d = new Date(iso);
    return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
  };

  return (
    <div className="space-y-8">
      {/* Pending Criteria Sets */}
      <section>
        <h2 className="text-lg font-semibold">Pending Criteria Sets ({pendingCriteriaSets.length})</h2>
        {pendingCriteriaSets.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500">No pending criteria sets.</p>
        ) : (
          <div className="mt-3 space-y-3">
            {pendingCriteriaSets.map((cs) => (
              <div
                key={cs.id}
                className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{cs.name}</p>
                  <p className="text-sm text-zinc-500">
                    Fund: {cs.funds?.[0]?.name ?? "Unknown"} &middot;{" "}
                    {getCriteriaCount(cs.criteria_json)} criteria &middot;{" "}
                    {formatDate(cs.created_at)}
                  </p>
                </div>
                <button
                  onClick={() => handleApproveCriteria(cs.id)}
                  disabled={approvingId === cs.id}
                  className="ml-4 shrink-0 rounded-lg bg-green-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-green-700 disabled:opacity-50"
                >
                  {approvingId === cs.id ? "Approving..." : "Approve"}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Pending Questions Sets */}
      <section>
        <h2 className="text-lg font-semibold">Pending Questions Sets ({pendingQuestionsSets.length})</h2>
        {pendingQuestionsSets.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500">No pending questions sets.</p>
        ) : (
          <div className="mt-3 space-y-3">
            {pendingQuestionsSets.map((qs) => (
              <div
                key={qs.id}
                className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    Fund: {qs.funds?.[0]?.name ?? "Unknown"}
                  </p>
                  <p className="text-sm text-zinc-500">
                    {getQuestionsCount(qs.questions_json)} questions
                    {qs.overall_word_limit ? ` (${qs.overall_word_limit} word limit)` : ""} &middot;{" "}
                    {formatDate(qs.created_at)}
                  </p>
                </div>
                <button
                  onClick={() => handleApproveQuestions(qs.id)}
                  disabled={approvingId === qs.id}
                  className="ml-4 shrink-0 rounded-lg bg-green-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-green-700 disabled:opacity-50"
                >
                  {approvingId === qs.id ? "Approving..." : "Approve"}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
