"use client";

import type { ParseResult } from "@/lib/markdown-import";

// ---------------------------------------------------------------------------
// Pure logic — exported for unit testing
// ---------------------------------------------------------------------------

export type ModalVariant = "error" | "warning" | "success";

export function getModalVariant(result: ParseResult): ModalVariant {
  if (result.errors.length > 0) return "error";
  if (result.warnings.length > 0) return "warning";
  return "success";
}

export function getConfirmLabel(variant: ModalVariant): string | null {
  if (variant === "error") return null;
  if (variant === "warning") return "Import Anyway";
  return "Apply Import";
}

export function formatErrorItem(e: { question_id?: string; message: string }): string {
  return e.question_id ? `[${e.question_id}] ${e.message}` : e.message;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface ImportResultModalProps {
  result: ParseResult;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ImportResultModal({ result, onConfirm, onCancel }: ImportResultModalProps) {
  const variant = getModalVariant(result);
  const hasErrors = variant === "error";
  const hasWarnings = variant === "warning";
  const confirmLabel = getConfirmLabel(variant);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl dark:bg-zinc-900">
        <h2 className="text-lg font-semibold">Import Results</h2>

        {/* Errors */}
        {hasErrors && (
          <div className="mt-4 rounded-lg bg-red-50 px-4 py-3 dark:bg-red-900/20">
            <p className="text-sm font-medium text-red-800 dark:text-red-300">
              Import cannot proceed — {result.errors.length} error{result.errors.length !== 1 ? "s" : ""} found:
            </p>
            <ul className="mt-2 space-y-1">
              {result.errors.map((e, i) => (
                <li key={`err-${e.question_id ?? i}`} className="text-sm text-red-700 dark:text-red-400">
                  {formatErrorItem(e)}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Warnings */}
        {hasWarnings && (
          <div className="mt-4 rounded-lg bg-amber-50 px-4 py-3 dark:bg-amber-900/20">
            <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
              {result.warnings.length} warning{result.warnings.length !== 1 ? "s" : ""}:
            </p>
            <ul className="mt-2 space-y-1">
              {result.warnings.map((w, i) => (
                <li key={`warn-${w.question_id ?? i}`} className="text-sm text-amber-700 dark:text-amber-400">
                  {formatErrorItem(w)}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Clean success */}
        {!hasErrors && !hasWarnings && (
          <div className="mt-4 rounded-lg bg-green-50 px-4 py-3 dark:bg-green-900/20">
            <p className="text-sm font-medium text-green-800 dark:text-green-300">
              File parsed successfully. {result.answers.length} answer{result.answers.length !== 1 ? "s" : ""} ready to import.
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="mt-6 flex justify-end gap-3">
          {hasErrors ? (
            <button
              type="button"
              onClick={onCancel}
              className="rounded-lg bg-zinc-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700"
            >
              Close
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={onCancel}
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onConfirm}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
              >
                {confirmLabel}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
