"use client";

import { useState } from "react";
import type { QualityDimension } from "../types";

function barColour(score: number | null): string {
  if (score === null) return "bg-zinc-200 dark:bg-zinc-700";
  if (score > 70) return "bg-green-500 dark:bg-green-400";
  if (score > 50) return "bg-amber-500 dark:bg-amber-400";
  if (score > 25) return "bg-orange-500 dark:bg-orange-400";
  return "bg-red-500 dark:bg-red-400";
}

function textColour(score: number | null): string {
  if (score === null) return "text-zinc-400 dark:text-zinc-500";
  if (score > 70) return "text-green-700 dark:text-green-400";
  if (score > 50) return "text-amber-700 dark:text-amber-400";
  if (score > 25) return "text-orange-700 dark:text-orange-400";
  return "text-red-700 dark:text-red-400";
}

export function QualityDimensionBars({ dimensions }: { dimensions: QualityDimension[] }) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  return (
    <div className="mt-6 rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
      <h3 className="mb-4 text-sm font-semibold">Quality Dimensions</h3>
      <div className="space-y-3">
        {dimensions.map((d, i) => (
          <div key={d.dimension}>
            <button
              type="button"
              className="flex w-full items-center gap-3 text-left"
              onClick={() => setExpandedIdx(expandedIdx === i ? null : i)}
            >
              <span className="w-36 shrink-0 text-xs text-zinc-600 dark:text-zinc-400">{d.dimension}</span>
              <div className="flex-1">
                <div className="h-2 rounded-full bg-zinc-100 dark:bg-zinc-800">
                  {d.score !== null && (
                    <div
                      className={`h-2 rounded-full transition-all ${barColour(d.score)}`}
                      style={{ width: `${d.score}%` }}
                    />
                  )}
                </div>
              </div>
              <span className={`w-10 text-right text-xs font-medium ${textColour(d.score)}`}>
                {d.score !== null ? d.score : "N/A"}
              </span>
            </button>
            {expandedIdx === i && (
              <p className="ml-39 mt-1 text-xs text-zinc-500 dark:text-zinc-400">{d.summary}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
