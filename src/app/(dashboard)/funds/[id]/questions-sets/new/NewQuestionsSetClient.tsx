"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { QuestionsPreview } from "@/components/QuestionsPreview";
import type { QuestionsSet } from "@/lib/schemas/criteria";

interface NewQuestionsSetClientProps {
  fundId: string;
  fundName: string;
  sourceQuestions: Array<Record<string, unknown>>;
  sourceOverallWordLimit?: number;
  applicationId?: string;
  returnTo?: string;
}

export function NewQuestionsSetClient({
  fundId,
  fundName,
  sourceQuestions,
  sourceOverallWordLimit,
  applicationId,
  returnTo,
}: NewQuestionsSetClientProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [questionsSet, setQuestionsSet] = useState<QuestionsSet>(() => ({
    questions: sourceQuestions.length > 0
      ? (sourceQuestions as QuestionsSet["questions"])
      : [{ id: "q1", question: "" }],
    overall_word_limit: sourceOverallWordLimit,
  }));

  const backHref = returnTo || `/funds/${fundId}`;

  const handleSave = async () => {
    setSaving(true);
    setError(null);

    try {
      // 1. Create the new questions set
      const res = await fetch(`/api/funds/${fundId}/questions-sets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(questionsSet),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "Failed to save questions set");
        setSaving(false);
        return;
      }

      const { questionsSet: created } = await res.json();

      // 2. If linked to an application, swap the application to use the new set
      if (applicationId && created?.id) {
        const swapRes = await fetch(`/api/applications/${applicationId}/questions-set`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ questionsSetId: created.id }),
        });

        if (!swapRes.ok) {
          const data = await swapRes.json().catch(() => null);
          setError(data?.error ?? "Questions set saved but failed to update application");
          setSaving(false);
          return;
        }
      }

      router.push(backHref);
    } catch {
      setError("Network error — please try again");
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={backHref}
          className="text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
        >
          &larr; Back
        </Link>
        <h1 className="mt-2 text-2xl font-bold">
          New Questions Set for {fundName}
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          Edit the questions below and save to create a new version.
          {sourceQuestions.length > 0 && " Pre-populated from the existing set."}
        </p>
      </div>

      <QuestionsPreview questionsSet={questionsSet} onChange={setQuestionsSet} />

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/30 dark:bg-red-900/10 dark:text-red-400">
          {error}
        </div>
      )}

      <div className="flex items-center gap-3 border-t border-zinc-200 pt-6 dark:border-zinc-800">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || questionsSet.questions.length === 0}
          className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save Questions Set"}
        </button>
        <Link
          href={backHref}
          className="text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
        >
          Cancel
        </Link>
      </div>
    </div>
  );
}
