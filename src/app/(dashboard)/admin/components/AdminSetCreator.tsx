"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CriteriaInput } from "@/components/CriteriaInput";
import { QuestionsInput } from "@/components/QuestionsInput";
import { CriteriaPreview } from "@/components/CriteriaPreview";
import { QuestionsPreview } from "@/components/QuestionsPreview";
import { CriteriaSetSchema, QuestionsSetSchema } from "@/lib/schemas/criteria";
import type { CriteriaSet, QuestionsSet } from "@/lib/schemas/criteria";

type Tab = "paste" | "manual" | "json";

interface AdminSetCreatorProps {
  setType: "criteria" | "questions";
  fundId: string;
  orgId: string;
}

export function AdminSetCreator({ setType, fundId, orgId }: AdminSetCreatorProps) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("paste");
  const [data, setData] = useState<CriteriaSet | QuestionsSet | null>(null);
  const [jsonText, setJsonText] = useState("");
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [approved, setApproved] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const isCriteria = setType === "criteria";
  const label = isCriteria ? "Criteria Set" : "Questions Set";

  function handleParsed(parsed: CriteriaSet | QuestionsSet) {
    setData(parsed);
  }

  const [manualData, setManualData] = useState<CriteriaSet | QuestionsSet>(
    isCriteria
      ? { name: "Criteria", criteria: [{ id: "c1", criterion: "", sub_questions: [] }] }
      : { questions: [{ id: "q1", question: "" }] }
  );

  function handleLoadJson() {
    setJsonError(null);
    try {
      const parsed = JSON.parse(jsonText);
      const schema = isCriteria ? CriteriaSetSchema : QuestionsSetSchema;
      const result = schema.safeParse(parsed);
      if (!result.success) {
        setJsonError(result.error.issues.map((i) => i.message).join(", "));
        return;
      }
      setData(result.data as CriteriaSet | QuestionsSet);
    } catch {
      setJsonError("Invalid JSON");
    }
  }

  async function handleSave() {
    const saveData = data ?? (tab === "manual" ? manualData : null);
    if (!saveData) return;
    setSaveError(null);
    setSaving(true);

    try {
      let url: string;
      let body: Record<string, unknown>;

      if (isCriteria) {
        const criteriaData = saveData as CriteriaSet;
        url = "/api/admin/criteria-sets";
        body = {
          fund_id: fundId,
          name: criteriaData.name,
          criteria_json: criteriaData.criteria,
          approved,
          ...(criteriaData.description && { description: criteriaData.description }),
        };
      } else {
        const questionsData = saveData as QuestionsSet;
        url = "/api/admin/questions-sets";
        body = {
          fund_id: fundId,
          questions_json: questionsData.questions,
          approved,
          ...(questionsData.overall_word_limit && { overall_word_limit: questionsData.overall_word_limit }),
        };
      }

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        setSaveError(errData.error || `Failed to create (${res.status})`);
        return;
      }

      const created = await res.json();
      router.push(`/admin/orgs/${orgId}/funds/${fundId}/sets/${created.id}`);
    } catch {
      setSaveError("Network error");
    } finally {
      setSaving(false);
    }
  }

  // The active editable data: from AI parse / JSON load, or manual entry
  const activeData = data ?? (tab === "manual" ? manualData : null);

  function handleActiveChange(updated: CriteriaSet | QuestionsSet) {
    if (data) {
      setData(updated);
    } else {
      setManualData(updated);
    }
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: "paste", label: "Paste & Parse" },
    { key: "manual", label: "Manual Entry" },
    { key: "json", label: "Raw JSON" },
  ];

  return (
    <div className="space-y-6">
      {/* Tabs — hidden once AI parse or JSON load has produced data */}
      {!data && (
        <div className="flex gap-1 border-b border-zinc-200 dark:border-zinc-700">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                tab === t.key
                  ? "border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400"
                  : "border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {/* Tab Content: Paste & Parse */}
      {!data && tab === "paste" && (
        isCriteria ? (
          <CriteriaInput onParsed={handleParsed} isAdmin />
        ) : (
          <QuestionsInput onParsed={handleParsed} />
        )
      )}

      {/* Tab Content: Raw JSON */}
      {!data && tab === "json" && (
        <div className="space-y-4">
          <div>
            <label htmlFor="json-input" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              {label} JSON
            </label>
            <textarea
              id="json-input"
              rows={12}
              value={jsonText}
              onChange={(e) => setJsonText(e.target.value)}
              placeholder={isCriteria
                ? '{\n  "name": "Criteria",\n  "criteria": [\n    { "id": "c1", "criterion": "...", "sub_questions": [] }\n  ]\n}'
                : '{\n  "questions": [\n    { "id": "q1", "question": "..." }\n  ]\n}'}
              className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 font-mono text-sm shadow-sm placeholder:text-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder:text-zinc-500"
            />
          </div>

          {jsonError && (
            <p className="text-sm text-red-600 dark:text-red-400">{jsonError}</p>
          )}

          <button
            type="button"
            onClick={handleLoadJson}
            disabled={jsonText.trim().length < 2}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Load JSON
          </button>
        </div>
      )}

      {/* Editor + Save — shown for manual tab or after parse/JSON load */}
      {activeData && (
        <div className="space-y-6">
          {isCriteria ? (
            <CriteriaPreview
              criteriaSet={activeData as CriteriaSet}
              onChange={handleActiveChange}
            />
          ) : (
            <QuestionsPreview
              questionsSet={activeData as QuestionsSet}
              onChange={handleActiveChange}
            />
          )}

          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
              <input
                type="checkbox"
                checked={approved}
                onChange={(e) => setApproved(e.target.checked)}
                className="rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500"
              />
              Create as approved
            </label>
          </div>

          {saveError && (
            <p className="text-sm text-red-600 dark:text-red-400">{saveError}</p>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 text-sm rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {saving ? "Saving..." : `Save ${label}`}
            </button>
            {data && (
              <button
                type="button"
                onClick={() => setData(null)}
                disabled={saving}
                className="px-4 py-2 text-sm rounded-md bg-zinc-100 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 disabled:opacity-50"
              >
                Back
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
