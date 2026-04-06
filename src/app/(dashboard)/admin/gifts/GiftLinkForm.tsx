"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CopyButton } from "@/components/CopyButton";

export function GiftLinkForm() {
  const [credits, setCredits] = useState(10);
  const [expiresAt, setExpiresAt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [generatedUrl, setGeneratedUrl] = useState("");
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setGeneratedUrl("");

    try {
      const body: Record<string, unknown> = { credits };
      if (expiresAt) {
        // Convert date to end-of-day UTC
        body.expires_at = `${expiresAt}T23:59:59Z`;
      }

      const res = await fetch("/api/admin/gift-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Failed to generate link");
        return;
      }

      const data = await res.json();
      setGeneratedUrl(data.url);
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <h3 className="text-sm font-semibold">Generate new gift link</h3>
      <form onSubmit={handleSubmit} className="mt-3 space-y-3">
        <div className="flex gap-3">
          <div className="flex-1">
            <label htmlFor="credits" className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">
              Credits (1–100)
            </label>
            <input
              id="credits"
              type="number"
              min={1}
              max={100}
              value={credits}
              onChange={(e) => setCredits(Number(e.target.value))}
              onFocus={(e) => e.target.select()}
              required
              className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-900"
            />
          </div>
          <div className="flex-1">
            <label htmlFor="expires_at" className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">
              Expiry date (optional)
            </label>
            <input
              id="expires_at"
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              min={new Date().toISOString().split("T")[0]}
              className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-900"
            />
          </div>
        </div>

        {error && (
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? "Generating..." : "Generate link"}
        </button>
      </form>

      {generatedUrl && (
        <div className="mt-3 rounded-lg border border-green-200 bg-green-50 p-3 dark:border-green-800 dark:bg-green-900/20">
          <p className="mb-1 text-xs font-medium text-green-700 dark:text-green-400">Link generated — copy and share it:</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 overflow-x-auto rounded bg-white px-2 py-1 text-xs text-zinc-800 dark:bg-zinc-900 dark:text-zinc-200">
              {generatedUrl}
            </code>
            <CopyButton text={generatedUrl} />
          </div>
        </div>
      )}
    </div>
  );
}
