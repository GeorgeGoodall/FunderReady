"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Fund = {
  id: string;
  name: string;
  organisation_id: string | null;
  organisations: { id: string; name: string } | null;
  url: string | null;
  notes: string | null;
  opens_at: string | null;
  closes_at: string | null;
  created_at: string;
};

type MyFund = {
  id: string;
  name: string;
  organisation: { id: string; name: string } | null;
  url: string | null;
  published: boolean;
  created_at: string;
};

type Tab = "browse" | "my";

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function FundsBrowser({
  initialPublishedFunds,
  initialHasMore,
  myFunds: initialMyFunds,
}: {
  initialPublishedFunds: Fund[];
  initialHasMore: boolean;
  myFunds: MyFund[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("browse");

  // Browse tab state
  const [funds, setFunds] = useState<Fund[]>(initialPublishedFunds);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [page, setPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<Fund[] | null>(null);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // My Funds tab state
  const [myFunds, setMyFunds] = useState<MyFund[]>(initialMyFunds);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleSearch = useCallback(async (query: string) => {
    if (!query.trim() || query.trim().length < 2) {
      setSearchResults(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    try {
      const res = await fetch(`/api/funds?q=${encodeURIComponent(query.trim())}`);
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data.funds ?? []);
      }
    } catch {
      // Silently fail search
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!search.trim()) {
      setSearchResults(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    debounceRef.current = setTimeout(() => {
      handleSearch(search);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search, handleSearch]);

  async function loadMore() {
    setLoadingMore(true);
    const nextPage = page + 1;
    try {
      const res = await fetch(`/api/funds/browse?page=${nextPage}&limit=20`);
      if (res.ok) {
        const data = await res.json();
        setFunds((prev) => [...prev, ...(data.funds ?? [])]);
        setHasMore(data.hasMore ?? false);
        setPage(nextPage);
      }
    } catch {
      // Silently fail
    } finally {
      setLoadingMore(false);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/funds/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed");
      setMyFunds((prev) => prev.filter((f) => f.id !== id));
      setConfirmingId(null);
      router.refresh();
    } catch {
      setDeleteError("Failed to remove fund. Please try again.");
    } finally {
      setDeletingId(null);
    }
  }

  const displayFunds = searchResults !== null ? searchResults : funds;
  const isSearching = search.trim().length > 0;

  return (
    <div>
      {/* Header row: tabs + create button */}
      <div className="flex items-center justify-between gap-4">
        <div className="inline-flex rounded-lg bg-zinc-100 p-1 dark:bg-zinc-800">
          <button
            type="button"
            onClick={() => setTab("browse")}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
              tab === "browse"
                ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-zinc-100"
                : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            }`}
          >
            Browse Funds
          </button>
          <button
            type="button"
            onClick={() => setTab("my")}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
              tab === "my"
                ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-zinc-100"
                : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            }`}
          >
            My Funds
          </button>
        </div>

        <Link
          href="/funds/new"
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
        >
          Create Fund
        </Link>
      </div>

      {/* Browse Funds tab */}
      {tab === "browse" && (
        <div className="mt-6">
          {/* Search box */}
          <div className="relative">
            <svg
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
              />
            </svg>
            <input
              type="text"
              placeholder="Search funds by name or organisation..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-zinc-200 bg-white py-2.5 pl-10 pr-4 text-sm placeholder:text-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-blue-400 dark:focus:ring-blue-400"
            />
          </div>

          {/* Spinner while searching */}
          {searching && (
            <div className="mt-6 flex justify-center">
              <svg
                className="h-6 w-6 animate-spin text-zinc-400"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
            </div>
          )}

          {/* Fund cards */}
          {!searching && (
            <>
              {displayFunds.length === 0 ? (
                <div className="mt-12 text-center">
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">
                    {isSearching
                      ? "No funds found matching your search."
                      : "No published funds yet."}
                  </p>
                </div>
              ) : (
                <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {displayFunds.map((fund) => (
                    <div
                      key={fund.id}
                      className="flex flex-col rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
                    >
                      <div className="min-w-0 flex-1">
                        <Link
                          href={`/funds/${fund.id}`}
                          className="font-medium text-zinc-900 hover:underline dark:text-zinc-100"
                        >
                          {fund.name}
                        </Link>
                        {fund.organisations && (
                          <p className="mt-1 truncate text-sm text-zinc-500 dark:text-zinc-400">
                            {fund.organisations.name}
                          </p>
                        )}
                        {(fund.opens_at || fund.closes_at) && (
                          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
                            {fund.opens_at && (
                              <span>Opens: {formatDate(fund.opens_at)}</span>
                            )}
                            {fund.closes_at && (
                              <span>Closes: {formatDate(fund.closes_at)}</span>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="mt-4">
                        <Link
                          href={`/applications/new?fundId=${fund.id}`}
                          className="inline-block rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-700"
                        >
                          Start Application
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Load more button (only when not searching and hasMore) */}
              {!isSearching && hasMore && (
                <div className="mt-6 text-center">
                  <button
                    type="button"
                    onClick={loadMore}
                    disabled={loadingMore}
                    className="rounded-lg border border-zinc-200 px-6 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  >
                    {loadingMore ? "Loading..." : "Load more"}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* My Funds tab */}
      {tab === "my" && (
        <div className="mt-6">
          {deleteError && (
            <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
              {deleteError}
            </div>
          )}
          {myFunds.length === 0 ? (
            <div className="mt-12 text-center">
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                No funds yet. Create a fund to get started.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {myFunds.map((fund) => (
                <li
                  key={fund.id}
                  className="flex items-center justify-between gap-4 py-4"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/funds/${fund.id}`}
                        className="truncate font-medium hover:underline"
                      >
                        {fund.name}
                      </Link>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                          fund.published
                            ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400"
                            : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                        }`}
                      >
                        {fund.published ? "Published" : "Unpublished"}
                      </span>
                    </div>
                    {fund.organisation && (
                      <p className="mt-0.5 truncate text-sm text-zinc-500 dark:text-zinc-400">
                        {fund.organisation.name}
                      </p>
                    )}
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    {confirmingId === fund.id ? (
                      <>
                        <span className="text-sm text-zinc-600 dark:text-zinc-400">
                          Remove?
                        </span>
                        <button
                          onClick={() => handleDelete(fund.id)}
                          disabled={deletingId === fund.id}
                          className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
                        >
                          {deletingId === fund.id ? "Removing..." : "Yes, remove"}
                        </button>
                        <button
                          onClick={() => setConfirmingId(null)}
                          className="rounded-md px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => setConfirmingId(fund.id)}
                        className="rounded-md px-3 py-1.5 text-xs font-medium text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-red-600 dark:hover:bg-zinc-800 dark:hover:text-red-400"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
