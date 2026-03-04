"use client";

import { useState } from "react";
import type { CriteriaSet } from "@/lib/schemas/criteria";

interface CriteriaInputProps {
  onParsed: (criteriaSet: CriteriaSet) => void;
}

export function CriteriaInput({ onParsed }: CriteriaInputProps) {
  const [rawText, setRawText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleParse = async () => {
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/parse-criteria", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawText }),
      });

      const data = await res.json();

      if (!res.ok) {
        const detail = data.details ? `\n${data.details}` : "";
        setError((data.error ?? "Failed to parse criteria") + detail);
        return;
      }

      onParsed(data.criteria);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="criteria-text" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Funder Criteria
        </label>
        <textarea
          id="criteria-text"
          rows={8}
          value={rawText}
          onChange={(e) => setRawText(e.target.value)}
          placeholder="Paste the funder's evaluation criteria here. This could be from a scoring matrix, guidance notes, or application form. For example:&#10;&#10;1. Demonstrates clear need for the project (25%)&#10;   - What evidence is there of the need?&#10;   - Who are the beneficiaries?&#10;2. Delivers measurable outcomes (25%)&#10;   - What outcomes will be achieved?&#10;   - How will they be measured?"
          className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm shadow-sm placeholder:text-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder:text-zinc-500"
        />
      </div>

      {error && (
        <div className="whitespace-pre-wrap rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={handleParse}
          disabled={loading || rawText.trim().length < 10}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Parsing..." : "Parse with AI"}
        </button>
        <button
          type="button"
          onClick={() => onParsed({ name: "Criteria", criteria: [{ id: "c1", criterion: "", sub_questions: [] }] })}
          className="text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
        >
          Enter manually instead
        </button>
      </div>
    </div>
  );
}
