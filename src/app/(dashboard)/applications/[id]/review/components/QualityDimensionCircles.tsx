"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { QualityDimension } from "../types";
import { ANIMATE_ON_VIEW_THRESHOLD_RELAXED } from "../constants";
import { useAnimateOnView } from "../hooks/useAnimateOnView";
import { ScoreCircle } from "./ScoreCircle";

export function QualityDimensionCircles({ dimensions }: { dimensions: QualityDimension[] }) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const { ref, isVisible } = useAnimateOnView(ANIMATE_ON_VIEW_THRESHOLD_RELAXED);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const dismiss = useCallback(() => setExpandedIdx(null), []);

  useEffect(() => {
    if (expandedIdx === null) return;

    const handleClick = (e: MouseEvent) => {
      const target = e.target;
      if (target instanceof Node && containerRef.current && !containerRef.current.contains(target)) {
        dismiss();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss();
    };

    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [expandedIdx, dismiss]);

  return (
    <div
      ref={ref}
      className="mt-6 rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"
    >
      <h3 className="mb-5 text-sm font-semibold">Quality Dimensions</h3>
      <div ref={containerRef} className="flex flex-wrap justify-center gap-6">
        {dimensions.map((d, i) => (
          <div key={d.dimension} className="relative flex flex-col items-center">
            <ScoreCircle
              score={d.score}
              label={d.dimension}
              isVisible={isVisible}
              isExpanded={expandedIdx === i}
              onClick={() => setExpandedIdx(expandedIdx === i ? null : i)}
            />
            {expandedIdx === i && (
              <div
                role="tooltip"
                className="absolute top-full z-10 mt-1 w-56 rounded-lg border border-zinc-200 bg-white p-3 shadow-lg dark:border-zinc-700 dark:bg-zinc-800"
              >
                <p className="text-center text-xs text-zinc-600 dark:text-zinc-300">
                  {d.summary}
                </p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
