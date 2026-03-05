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
  initialData: CriteriaSet | QuestionsSet;
}

export function AdminAmendForm({
  setType,
  setId,
  fundId,
  initialData,
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
      // Step 1: Create the amended set
      let createUrl: string;
      let createBody: Record<string, unknown>;

      if (setType === "criteria") {
        const criteriaData = data as CriteriaSet;
        createUrl = "/api/admin/criteria-sets";
        createBody = {
          fund_id: fundId,
          name: criteriaData.name,
          criteria_json: criteriaData.criteria,
          ...(criteriaData.description && {
            description: criteriaData.description,
          }),
        };
      } else {
        const questionsData = data as QuestionsSet;
        createUrl = "/api/admin/questions-sets";
        createBody = {
          fund_id: fundId,
          questions_json: questionsData.questions,
          ...(questionsData.overall_word_limit && {
            overall_word_limit: questionsData.overall_word_limit,
          }),
        };
      }

      const createRes = await fetch(createUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(createBody),
      });

      if (!createRes.ok) {
        const errData = await createRes.json().catch(() => ({}));
        setError(errData.error || `Failed to create amended set (${createRes.status})`);
        return;
      }

      // Step 2: Reject the original set
      const rejectEntityType =
        setType === "criteria" ? "criteria-sets" : "questions-sets";
      const rejectRes = await fetch(
        `/api/admin/${rejectEntityType}/${setId}/reject`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason: "Amended by admin" }),
        }
      );

      if (!rejectRes.ok) {
        const errData = await rejectRes.json().catch(() => ({}));
        setError(
          errData.error ||
            `Amended set created but failed to reject original (${rejectRes.status})`
        );
        return;
      }

      setOpen(false);
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
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
