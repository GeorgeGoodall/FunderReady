"use client";

import { useState, useEffect } from "react";
import { NewFundForm, type NewFundData } from "./NewFundForm";
import { FundSearchResults } from "./funds/FundSearchResults";

interface Fund {
  id: string;
  name: string;
  organisation: { id: string; name: string } | null;
  url: string | null;
  notes: string | null;
  opens_at: string | null;
  closes_at: string | null;
  created_at: string;
}

interface FundDetectionProps {
  fileName: string;
  bidTextPreview?: string;
  onFundSelected: (fund: Fund) => void;
  onNewFundData: (data: NewFundData) => void;
  onSkip: () => void;
}

export function FundDetection({
  fileName,
  bidTextPreview,
  onFundSelected,
  onNewFundData,
  onSkip,
}: FundDetectionProps) {
  const [detecting, setDetecting] = useState(true);
  const [detectedName, setDetectedName] = useState<string | null>(null);
  const [matchedFund, setMatchedFund] = useState<Fund | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Fund[]>([]);
  const [searching, setSearching] = useState(false);
  const [showNewFundForm, setShowNewFundForm] = useState(false);

  // Auto-detect fund on mount
  useEffect(() => {
    let cancelled = false;

    async function detect() {
      try {
        const res = await fetch("/api/detect-fund", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileName, bidTextPreview }),
        });

        if (!res.ok || cancelled) return;
        const data = await res.json();

        if (!cancelled) {
          setDetectedName(data.detectedName);
          const raw = data.matchedFund;
          if (raw) {
            // Normalise API shape: Supabase returns { organisations: {...} }
            setMatchedFund({ ...raw, organisation: raw.organisations ?? null });
          }
          if (data.detectedName) {
            setSearchQuery(data.detectedName);
          }
        }
      } catch {
        // Non-fatal
      } finally {
        if (!cancelled) setDetecting(false);
      }
    }

    detect();
    return () => {
      cancelled = true;
    };
  }, [fileName, bidTextPreview]);

  // Search funds
  const handleSearch = async (q: string) => {
    setSearchQuery(q);
    if (q.trim().length < 2) {
      setSearchResults([]);
      return;
    }

    setSearching(true);
    try {
      const res = await fetch(`/api/funds?q=${encodeURIComponent(q.trim())}`);
      if (res.ok) {
        const data = await res.json();
        // Normalise API shape: Supabase returns { organisations: {...} }
        const funds = (data.funds ?? []).map((f: Fund & { organisations?: { id: string; name: string } | null }) => ({
          ...f,
          organisation: f.organisations ?? null,
        }));
        setSearchResults(funds);
      }
    } catch {
      // Non-fatal
    } finally {
      setSearching(false);
    }
  };

  if (detecting) {
    return (
      <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center gap-3">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
          <span className="text-sm text-zinc-600 dark:text-zinc-400">
            Detecting fund/programme from your document...
          </span>
        </div>
      </div>
    );
  }

  if (showNewFundForm) {
    return (
      <NewFundForm
        suggestedName={detectedName ?? ""}
        onSubmit={(data) => {
          setShowNewFundForm(false);
          onNewFundData(data);
        }}
        onCancel={() => setShowNewFundForm(false)}
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Matched fund card */}
      {matchedFund && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-900/30 dark:bg-green-900/10">
          <p className="text-sm font-medium text-green-800 dark:text-green-300">
            We found an existing fund that matches your bid:
          </p>
          <div className="mt-2 flex items-center justify-between">
            <div>
              <p className="font-semibold">{matchedFund.name}</p>
              {matchedFund.organisation && (
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  {matchedFund.organisation.name}
                </p>
              )}
            </div>
            <button
              onClick={() => onFundSelected(matchedFund)}
              className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700"
            >
              Use this fund
            </button>
          </div>
        </div>
      )}

      {/* Detected name but no match */}
      {detectedName && !matchedFund && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-900/30 dark:bg-blue-900/10">
          <p className="text-sm text-blue-800 dark:text-blue-300">
            We detected this fund name: <strong>{detectedName}</strong>
          </p>
          <p className="mt-1 text-xs text-blue-600 dark:text-blue-400">
            No existing fund matched. You can create it as a new fund or search below.
          </p>
          <button
            onClick={() => setShowNewFundForm(true)}
            className="mt-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
          >
            Create &ldquo;{detectedName}&rdquo; as new fund
          </button>
        </div>
      )}

      {/* Search existing funds */}
      <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Search for an existing fund
        </label>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="Type fund name..."
          className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800"
        />

        {searching && (
          <p className="mt-2 text-xs text-zinc-500">Searching...</p>
        )}

        <FundSearchResults results={searchResults} onSelect={onFundSelected} />
      </div>

      {/* Create new fund */}
      <div className="flex gap-3">
        <button
          onClick={() => setShowNewFundForm(true)}
          className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          Create new fund
        </button>
        <button
          onClick={onSkip}
          className="text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
        >
          Skip fund detection
        </button>
      </div>
    </div>
  );
}
