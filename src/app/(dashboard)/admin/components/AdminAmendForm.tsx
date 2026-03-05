"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CriteriaPreview } from "@/components/CriteriaPreview";
import { QuestionsPreview } from "@/components/QuestionsPreview";
import type { CriteriaSet, QuestionsSet } from "@/lib/schemas/criteria";

interface AdminAmendFormProps {
  setType: "criteria" | "questions";
  setId: string;
  fundId: string;
  orgId: string;
  initialData: CriteriaSet | QuestionsSet;
  children?: React.ReactNode;
}

export function AdminAmendForm({
  setType,
  setId,
  fundId,
  orgId,
  initialData,
  children,
}: AdminAmendFormProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<CriteriaSet | QuestionsSet>(initialData);

  async function handleSave() {
    setError(null);
    setSaving(true);

    try {
      const body: Record<string, unknown> = {
        set_type: setType,
        original_id: setId,
        fund_id: fundId,
      };

      if (setType === "criteria") {
        const criteriaData = data as CriteriaSet;
        body.name = criteriaData.name;
        body.criteria_json = criteriaData.criteria;
        if (criteriaData.description) body.description = criteriaData.description;
      } else {
        const questionsData = data as QuestionsSet;
        body.questions_json = questionsData.questions;
        if (questionsData.overall_word_limit) body.overall_word_limit = questionsData.overall_word_limit;
      }

      const res = await fetch("/api/admin/amend-set", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        setError(errData.error || `Failed to amend set (${res.status})`);
        // If amended set was created but reject failed, still navigate to it
        if (errData.id) {
          router.push(`/admin/orgs/${orgId}/funds/${fundId}/sets/${errData.id}`);
        }
        return;
      }

      const created = await res.json();
      setOpen(false);
      router.push(`/admin/orgs/${orgId}/funds/${fundId}/sets/${created.id}`);
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <>
        <button
          type="button"
          onClick={() => {
            setData(initialData);
            setOpen(true);
          }}
          className="px-3 py-1.5 text-sm rounded-md bg-zinc-100 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 disabled:opacity-50"
        >
          Amend
        </button>
        {children}
      </>
    );
  }

  return (
    <div className="space-y-4 rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-800/50">
      <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
        Amend {setType === "criteria" ? "Criteria Set" : "Questions Set"}
      </p>

      {setType === "criteria" ? (
        <CriteriaPreview
          criteriaSet={data as CriteriaSet}
          onChange={(updated) => setData(updated)}
        />
      ) : (
        <QuestionsPreview
          questionsSet={data as QuestionsSet}
          onChange={(updated) => setData(updated)}
        />
      )}

      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="px-3 py-1.5 text-sm rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save Amended"}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
          disabled={saving}
          className="px-3 py-1.5 text-sm rounded-md bg-zinc-100 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
