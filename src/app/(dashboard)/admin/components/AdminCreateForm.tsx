"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface AdminCreateFormProps {
  entityType: "org" | "fund" | "criteria-set" | "questions-set";
  parentId?: string;
}

const BUTTON_LABELS: Record<AdminCreateFormProps["entityType"], string> = {
  org: "+ New Organisation",
  fund: "+ New Fund",
  "criteria-set": "+ New Criteria Set",
  "questions-set": "+ New Questions Set",
};

export function AdminCreateForm({ entityType, parentId }: AdminCreateFormProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form fields
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [criteriaJson, setCriteriaJson] = useState("");
  const [questionsJson, setQuestionsJson] = useState("");
  const [overallWordLimit, setOverallWordLimit] = useState("");

  function resetForm() {
    setName("");
    setUrl("");
    setDescription("");
    setNotes("");
    setCriteriaJson("");
    setQuestionsJson("");
    setOverallWordLimit("");
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    try {
      let apiUrl: string;
      let body: Record<string, unknown>;

      switch (entityType) {
        case "org": {
          if (!name.trim()) {
            setError("Name is required");
            setSaving(false);
            return;
          }
          apiUrl = "/api/admin/organisations";
          body = {
            name: name.trim(),
            ...(url.trim() && { url: url.trim() }),
            ...(description.trim() && { description: description.trim() }),
          };
          break;
        }
        case "fund": {
          if (!name.trim()) {
            setError("Name is required");
            setSaving(false);
            return;
          }
          apiUrl = "/api/admin/funds";
          body = {
            name: name.trim(),
            organisation_id: parentId,
            ...(url.trim() && { url: url.trim() }),
            ...(notes.trim() && { notes: notes.trim() }),
          };
          break;
        }
        case "criteria-set": {
          if (!name.trim()) {
            setError("Name is required");
            setSaving(false);
            return;
          }
          let parsedCriteria: unknown;
          try {
            parsedCriteria = JSON.parse(criteriaJson);
          } catch {
            setError("Invalid JSON for criteria");
            setSaving(false);
            return;
          }
          apiUrl = "/api/admin/criteria-sets";
          body = {
            fund_id: parentId,
            name: name.trim(),
            criteria_json: parsedCriteria,
          };
          break;
        }
        case "questions-set": {
          let parsedQuestions: unknown;
          try {
            parsedQuestions = JSON.parse(questionsJson);
          } catch {
            setError("Invalid JSON for questions");
            setSaving(false);
            return;
          }
          apiUrl = "/api/admin/questions-sets";
          body = {
            fund_id: parentId,
            questions_json: parsedQuestions,
            ...(overallWordLimit.trim() && {
              overall_word_limit: parseInt(overallWordLimit, 10),
            }),
          };
          break;
        }
      }

      const res = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || `Request failed (${res.status})`);
        return;
      }

      resetForm();
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
        onClick={() => setOpen(true)}
        className="px-3 py-1.5 text-sm rounded-md bg-emerald-600 text-white hover:bg-emerald-700"
      >
        {BUTTON_LABELS[entityType]}
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-3 rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-800/50"
    >
      <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
        {BUTTON_LABELS[entityType].replace("+ ", "Create ")}
      </p>

      {/* Organisation fields */}
      {entityType === "org" && (
        <>
          <div>
            <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400">
              Name *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400">
              URL
            </label>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            />
          </div>
        </>
      )}

      {/* Fund fields */}
      {entityType === "fund" && (
        <>
          <div>
            <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400">
              Name *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400">
              URL
            </label>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400">
              Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            />
          </div>
        </>
      )}

      {/* Criteria set fields */}
      {entityType === "criteria-set" && (
        <>
          <div>
            <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400">
              Name *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400">
              Criteria JSON *
            </label>
            <textarea
              value={criteriaJson}
              onChange={(e) => setCriteriaJson(e.target.value)}
              rows={6}
              placeholder='[{"id":"c1","criterion":"...","sub_questions":[]}]'
              className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-mono dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              required
            />
          </div>
        </>
      )}

      {/* Questions set fields */}
      {entityType === "questions-set" && (
        <>
          <div>
            <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400">
              Questions JSON *
            </label>
            <textarea
              value={questionsJson}
              onChange={(e) => setQuestionsJson(e.target.value)}
              rows={6}
              placeholder='[{"id":"q1","question":"..."}]'
              className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-mono dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400">
              Overall Word Limit
            </label>
            <input
              type="number"
              value={overallWordLimit}
              onChange={(e) => setOverallWordLimit(e.target.value)}
              placeholder="e.g. 5000"
              className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            />
          </div>
        </>
      )}

      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving}
          className="px-3 py-1.5 text-sm rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {saving ? "Creating..." : "Create"}
        </button>
        <button
          type="button"
          onClick={() => {
            resetForm();
            setOpen(false);
          }}
          disabled={saving}
          className="px-3 py-1.5 text-sm rounded-md bg-zinc-100 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
