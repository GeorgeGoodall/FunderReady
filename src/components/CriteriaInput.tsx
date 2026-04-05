"use client";

import { useState, useRef, useEffect } from "react";
import type { CriteriaSet } from "@/lib/schemas/criteria";

interface CriteriaInputProps {
  onParsed: (criteriaSet: CriteriaSet, dates?: { opens_at?: string; closes_at?: string }) => void;
  isAdmin?: boolean;
}

interface ScrapeProgress {
  stage: string;
  message: string;
  currentPage?: number;
  totalPages?: number;
  detail?: Record<string, unknown>;
}

interface ScrapeUsage {
  totalCalls: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  costGbp: number;
}

interface PageNode {
  url: string;
  title: string;
  relevant: boolean;
  children: PageNode[];
}

function PageTree({ node, isLast = true, prefix = "" }: { node: PageNode; isLast?: boolean; prefix?: string }) {
  const connector = prefix === "" ? "" : isLast ? "└── " : "├── ";
  const childPrefix = prefix === "" ? "" : prefix + (isLast ? "    " : "│   ");
  const label = node.title.length > 60 ? node.title.slice(0, 57) + "..." : node.title;

  return (
    <>
      <div>
        <span className="text-zinc-400">{prefix}{connector}</span>
        <span className={node.relevant ? "text-green-500" : "text-zinc-500"}>
          {label}
        </span>
      </div>
      {node.children.map((child, i) => (
        <PageTree
          key={child.url}
          node={child}
          isLast={i === node.children.length - 1}
          prefix={childPrefix}
        />
      ))}
    </>
  );
}

export function CriteriaInput({ onParsed, isAdmin }: CriteriaInputProps) {
  const [rawText, setRawText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Scraping state
  const [scrapeUrl, setScrapeUrl] = useState("");
  const [scraping, setScraping] = useState(false);
  const [scrapeProgress, setScrapeProgress] = useState<ScrapeProgress[]>([]);
  const [scrapeError, setScrapeError] = useState("");
  const [scrapeUsage, setScrapeUsage] = useState<ScrapeUsage | null>(null);
  const [finalUsage, setFinalUsage] = useState<ScrapeUsage | null>(null);
  const [pageTree, setPageTree] = useState<PageNode | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const progressRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    progressRef.current?.scrollTo({ top: progressRef.current.scrollHeight });
  }, [scrapeProgress]);

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

      onParsed(data.criteria, { opens_at: data.opens_at, closes_at: data.closes_at });
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleScrape = async () => {
    setScrapeError("");
    setScrapeProgress([]);
    setScrapeUsage(null);
    setFinalUsage(null);
    setPageTree(null);
    setScraping(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/admin/scrape-criteria", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: scrapeUrl }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const data = await res.json();
        setScrapeError(data.error ?? "Failed to start scraping");
        setScraping(false);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        setScrapeError("No response stream available");
        setScraping(false);
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Parse SSE events from buffer
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        let eventType = "";
        for (const line of lines) {
          if (line.startsWith("event: ")) {
            eventType = line.slice(7).trim();
          } else if (line.startsWith("data: ") && eventType) {
            try {
              const data = JSON.parse(line.slice(6));

              if (eventType === "progress") {
                const progress = data as ScrapeProgress;
                if (progress.stage === "usage_update" && progress.detail && typeof progress.detail.totalCalls === "number") {
                  setScrapeUsage({
                    totalCalls: progress.detail.totalCalls,
                    inputTokens: progress.detail.inputTokens ?? 0,
                    outputTokens: progress.detail.outputTokens ?? 0,
                    costUsd: progress.detail.costUsd ?? 0,
                    costGbp: progress.detail.costGbp ?? 0,
                  } as ScrapeUsage);
                } else {
                  setScrapeProgress((prev) => [...prev, progress]);
                }
              } else if (eventType === "complete") {
                setRawText(data.content);
                if (data.usage && typeof data.usage.totalCalls === "number") {
                  setFinalUsage(data.usage as ScrapeUsage);
                }
                if (data.pageTree && typeof data.pageTree.url === "string") {
                  setPageTree(data.pageTree as PageNode);
                }
                setScraping(false);
              } else if (eventType === "error") {
                setScrapeError(data.message);
                setScraping(false);
              }
            } catch {
              // Skip unparseable events
            }
            eventType = "";
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setScrapeError("Network error during scraping. Please try again.");
      }
    } finally {
      setScraping(false);
      abortRef.current = null;
    }
  };

  const handleCancelScrape = () => {
    abortRef.current?.abort();
    setScraping(false);
  };

  const isValidUrl = (url: string) => {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  };

  return (
    <div className="space-y-4">
      {isAdmin && (
        <>
          <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-700">
            <h3 className="mb-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Import from URL
            </h3>

            <div className="flex gap-2">
              <input
                type="url"
                value={scrapeUrl}
                onChange={(e) => setScrapeUrl(e.target.value)}
                placeholder="https://funder.org/criteria"
                disabled={scraping}
                className="flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm shadow-sm placeholder:text-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder:text-zinc-500"
              />
              {!scraping ? (
                <button
                  type="button"
                  onClick={handleScrape}
                  disabled={!isValidUrl(scrapeUrl)}
                  className="whitespace-nowrap rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Scrape Criteria
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleCancelScrape}
                  className="whitespace-nowrap rounded-lg bg-zinc-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-600"
                >
                  Cancel
                </button>
              )}
            </div>

            {scrapeProgress.length > 0 && (
              <div ref={progressRef} className="mt-3 max-h-64 space-y-1 overflow-y-auto rounded border border-zinc-100 bg-zinc-50 p-2 font-mono text-xs dark:border-zinc-700 dark:bg-zinc-900">
                {scrapeProgress.map((p, i) => (
                  <div key={i}>
                    <div className="flex items-start gap-2 text-zinc-500 dark:text-zinc-400">
                      {scraping && i === scrapeProgress.length - 1 ? (
                        <span className="mt-0.5 animate-pulse text-blue-400">&#9679;</span>
                      ) : p.stage === "relevance_result" ? (
                        <span className={`mt-0.5 ${p.detail?.relevant ? "text-green-500" : "text-amber-500"}`}>
                          {p.detail?.relevant ? "\u2713" : "\u2717"}
                        </span>
                      ) : p.stage === "link_decision" ? (
                        <span className="mt-0.5 text-blue-500">&#9670;</span>
                      ) : (
                        <span className="mt-0.5 text-green-500">&#10003;</span>
                      )}
                      <span className={
                        p.stage === "relevance_result" && !p.detail?.relevant
                          ? "text-amber-600 dark:text-amber-400"
                          : p.stage === "relevance_result" && p.detail?.relevant
                            ? "text-green-600 dark:text-green-400"
                            : ""
                      }>
                        {p.message}
                      </span>
                    </div>
                    {p.stage === "link_decision" && p.detail && (
                      <div className="ml-6 mt-1 space-y-0.5 text-zinc-400 dark:text-zinc-500">
                        {(p.detail.selected as string[])?.map((name, j) => (
                          <div key={`s-${j}`} className="text-green-600 dark:text-green-500">
                            &nbsp;&nbsp;+ {name}
                          </div>
                        ))}
                        {(p.detail.rejected as string[])?.map((name, j) => (
                          <div key={`r-${j}`} className="text-zinc-400 dark:text-zinc-600">
                            &nbsp;&nbsp;- {name}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {(scrapeUsage || finalUsage) && (
              <div className="mt-2 flex items-center gap-2 rounded border border-zinc-200 bg-zinc-100 px-3 py-1.5 font-mono text-xs text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400">
                <span>{(finalUsage ?? scrapeUsage)!.totalCalls} AI calls</span>
                <span className="text-zinc-300 dark:text-zinc-600">|</span>
                <span>{((finalUsage ?? scrapeUsage)!.inputTokens + (finalUsage ?? scrapeUsage)!.outputTokens).toLocaleString()} tokens</span>
                <span className="text-zinc-300 dark:text-zinc-600">|</span>
                <span>${(finalUsage ?? scrapeUsage)!.costUsd.toFixed(4)}</span>
                {finalUsage && <span className="ml-auto text-green-600 dark:text-green-400">Final</span>}
              </div>
            )}

            {pageTree && (
              <div className="mt-3 rounded border border-zinc-200 bg-zinc-50 p-3 font-mono text-xs dark:border-zinc-700 dark:bg-zinc-900">
                <div className="mb-2 text-xs font-medium text-zinc-600 dark:text-zinc-400">
                  Pages scraped <span className="text-green-500">&#9632;</span> = used for criteria
                </div>
                <PageTree node={pageTree} />
              </div>
            )}

            {scrapeError && (
              <div className="mt-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
                {scrapeError}
              </div>
            )}
          </div>

          <div className="relative flex items-center">
            <div className="flex-grow border-t border-zinc-300 dark:border-zinc-600" />
            <span className="mx-4 shrink-0 text-xs text-zinc-400 dark:text-zinc-500">
              or paste criteria text
            </span>
            <div className="flex-grow border-t border-zinc-300 dark:border-zinc-600" />
          </div>
        </>
      )}

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
          {loading ? "Extracting..." : "Extract with AI"}
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
