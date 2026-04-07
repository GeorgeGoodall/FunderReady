"use client";

import { useState } from "react";
import type { QuestionsSet } from "@/lib/schemas/criteria";

interface QuestionsInputProps {
  onParsed: (questionsSet: QuestionsSet) => void;
  itemLabel?: string;
}

export function QuestionsInput({ onParsed, itemLabel = "Question" }: QuestionsInputProps) {
  const [rawText, setRawText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleParse = async () => {
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/parse-questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawText }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Failed to parse questions");
        return;
      }

      onParsed(data.questions);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="questions-text" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Application {itemLabel}s
        </label>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Paste the funder&apos;s application {itemLabel.toLowerCase()}s or template text below. We&apos;ll extract the {itemLabel.toLowerCase()}s, word limits, and guidance automatically.
        </p>
        <textarea
          id="questions-text"
          rows={8}
          value={rawText}
          onChange={(e) => setRawText(e.target.value)}
          placeholder={itemLabel === "Section"
            ? `Paste the funder's application template here. For example:\n\n## Executive Summary\nBriefly describe your organisation and the project (up to 200 words)\n\n## Statement of Need\nWhat is the problem or need this project addresses? (up to 500 words)\n\n## Project Plan\nHow will you deliver this project? (up to 600 words)`
            : `Paste the funder's application ${itemLabel.toLowerCase()}s here. For example:\n\nQ1. Tell us about your organisation (50-300 words)\nHere are some ideas: history, mission, key achievements...\n\nQ2. What is the need for this project? (up to 500 words)\nDescribe the evidence base and who will benefit.`}
          className="mt-2 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm shadow-sm placeholder:text-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder:text-zinc-500"
        />
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
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
          {loading ? "Extracting..." : "Extract with AI"}
        </button>
        <button
          type="button"
          onClick={() => onParsed({ questions: [{ id: "q1", question: "" }] })}
          className="text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
        >
          Enter {itemLabel.toLowerCase()}s manually instead
        </button>
      </div>
    </div>
  );
}
