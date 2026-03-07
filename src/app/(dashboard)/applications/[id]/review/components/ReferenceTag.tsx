"use client";

export function ReferenceTag({
  id,
  type,
  fullText,
  variant = "inline",
}: {
  id: string;
  type: "question" | "criteria";
  fullText?: string;
  variant?: "inline" | "chip";
}) {
  const number = id.replace(/^[qc]/, "");
  const label = type === "question" ? `Question ${number}` : `Criteria ${number}`;

  const className = variant === "chip"
    ? "group relative inline-flex items-center rounded bg-zinc-100 px-1.5 py-0.5 text-xs font-medium text-blue-700 hover:bg-blue-50 hover:text-blue-800 dark:bg-zinc-800 dark:text-blue-400 dark:hover:bg-blue-900/20"
    : "group relative inline text-inherit rounded px-0.5 -mx-0.5 transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800";

  return (
    <span
      className={className}
      title={fullText}
    >
      {label}
      {fullText && (
        <span className="pointer-events-none select-none group-hover:select-text absolute bottom-full left-1/2 z-30 mb-2 -translate-x-1/2 whitespace-normal rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-normal text-zinc-700 opacity-0 shadow-lg transition-opacity group-hover:opacity-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 w-64 max-w-xs">
          {fullText}
        </span>
      )}
    </span>
  );
}
