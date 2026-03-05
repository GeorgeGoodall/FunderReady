"use client";

import { useState } from "react";
import { scoreToHsl } from "../constants";

const SIZE = 96;
const STROKE_WIDTH = 8;
const RADIUS = (SIZE - STROKE_WIDTH) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function ScoreCircle({
  score,
  label,
  isVisible,
  isExpanded,
  onClick,
}: {
  score: number | null;
  label: string;
  isVisible: boolean;
  isExpanded?: boolean;
  onClick?: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const pct = score !== null ? Math.max(0, Math.min(100, score)) : 0;
  const offset = CIRCUMFERENCE - (pct / 100) * CIRCUMFERENCE;
  const colour = scoreToHsl(score);
  const isInteractive = !!onClick;

  const content = (
    <>
      <div
        className="relative transition-transform duration-200 ease-out"
        style={{ transform: hovered && isInteractive ? "scale(1.05)" : "scale(1)" }}
      >
        <div
          className="absolute inset-0 rounded-full transition-shadow duration-200"
          style={{ boxShadow: hovered && isInteractive ? `0 4px 20px ${colour}40` : "none" }}
        />
        <svg width={SIZE} height={SIZE} className="rotate-[-90deg]" aria-hidden="true">
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke="currentColor"
            strokeWidth={STROKE_WIDTH}
            className="text-zinc-100 dark:text-zinc-800"
          />
          {score !== null && (
            <circle
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={RADIUS}
              fill="none"
              stroke={colour}
              strokeWidth={STROKE_WIDTH}
              strokeLinecap="round"
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={isVisible ? offset : CIRCUMFERENCE}
              style={{
                transition: isVisible
                  ? "stroke-dashoffset 1s cubic-bezier(0.16, 1, 0.3, 1)"
                  : "none",
              }}
            />
          )}
        </svg>
        <span
          className="absolute inset-0 flex items-center justify-center text-lg font-bold"
          style={{ color: score !== null ? colour : undefined }}
        >
          {score !== null ? score : "N/A"}
        </span>
      </div>
      <span className="max-w-[120px] text-center text-sm font-medium leading-tight text-zinc-600 dark:text-zinc-400">
        {label}
      </span>
      {isInteractive && (
        <span
          className="text-[10px] text-zinc-400 transition-opacity duration-200 dark:text-zinc-500"
          style={{ opacity: hovered ? 1 : 0 }}
        >
          Click for details
        </span>
      )}
    </>
  );

  if (isInteractive) {
    return (
      <button
        type="button"
        className="group flex flex-col items-center gap-2 outline-none"
        onClick={onClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        aria-expanded={isExpanded}
      >
        {content}
      </button>
    );
  }

  return (
    <div className="flex flex-col items-center gap-2">
      {content}
    </div>
  );
}
