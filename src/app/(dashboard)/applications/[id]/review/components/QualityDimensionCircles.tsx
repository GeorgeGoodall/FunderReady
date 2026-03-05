"use client";

import { useState } from "react";
import type { QualityDimension } from "../types";
import { useAnimateOnView } from "../hooks/useAnimateOnView";
import { ScoreCircle } from "./ScoreCircle";

export function QualityDimensionCircles({ dimensions }: { dimensions: QualityDimension[] }) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const { ref, isVisible } = useAnimateOnView(0.2);

  return (
    <div
      ref={ref}
      className="mt-6 rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"
    >
      <h3 className="mb-5 text-sm font-semibold">Quality Dimensions</h3>
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {dimensions.map((d, i) => (
          <div key={d.dimension} className="flex flex-col items-center">
            <ScoreCircle
              score={d.score}
              label={d.dimension}
              isVisible={isVisible}
              onClick={() => setExpandedIdx(expandedIdx === i ? null : i)}
            />
            {expandedIdx === i && (
              <p className="mt-2 max-w-[200px] text-center text-xs text-zinc-500 dark:text-zinc-400">
                {d.summary}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
