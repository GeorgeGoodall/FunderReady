"use client";

import { useState, useEffect, useRef } from "react";

export interface OrgOption {
  id: string;
  name: string;
  approved: boolean;
}

interface OrganisationSelectorProps {
  onSelect: (org: OrgOption) => void;
  onCreateNew: (name: string) => void;
  initialName?: string;
}

export function OrganisationSelector({
  onSelect,
  onCreateNew,
  initialName = "",
}: OrganisationSelectorProps) {
  const [query, setQuery] = useState(initialName);
  const [results, setResults] = useState<OrgOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (query.trim().length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(
          `/api/organisations?q=${encodeURIComponent(query.trim())}`
        );
        if (res.ok) {
          const data = await res.json();
          setResults(data.organisations ?? []);
          setOpen(true);
        }
      } catch {
        // Non-fatal
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  return (
    <div className="relative">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Search or type org name..."
        className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800"
      />

      {searching && (
        <p className="mt-1 text-xs text-zinc-500">Searching...</p>
      )}

      {open && (results.length > 0 || query.trim().length >= 2) && (
        <div className="absolute z-10 mt-1 w-full rounded-lg border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
          {results.map((org) => (
            <button
              key={org.id}
              type="button"
              onMouseDown={() => onSelect(org)}
              className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800"
            >
              <span>{org.name}</span>
              {!org.approved && (
                <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                  Pending
                </span>
              )}
            </button>
          ))}
          {query.trim().length >= 2 && (
            <button
              type="button"
              onMouseDown={() => onCreateNew(query.trim())}
              className="flex w-full items-center gap-2 border-t border-zinc-100 px-3 py-2 text-left text-sm text-blue-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-blue-400 dark:hover:bg-zinc-800"
            >
              <span>+</span>
              <span>Create &ldquo;{query.trim()}&rdquo; as new organisation</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
