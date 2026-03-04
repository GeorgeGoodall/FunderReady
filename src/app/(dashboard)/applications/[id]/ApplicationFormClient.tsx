"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { FormField } from "@/components/FormField";
import { ApplicationStatusBadge } from "@/components/ApplicationStatusBadge";
import { ImportResultModal } from "@/components/ImportResultModal";
import { generateMarkdown, getExportFilename, type ExportCriterion } from "@/lib/markdown-export";
import { parseMarkdown, validateImportMetadata, MAX_IMPORT_FILE_SIZE, type ParseResult } from "@/lib/markdown-import";
import type { Json } from "@/types/database";

interface Question {
  id: string;
  question: string;
  word_count_min?: number;
  word_count_max?: number;
  guidance?: string;
  field_type?: string;
  options?: string[];
  char_limit?: number;
  required?: boolean;
  section?: string;
}

interface ApplicationData {
  id: string;
  title: string | null;
  status: string;
  review_count: number;
  fund_id: string;
  questions_set_id: string;
}

interface AvailableQuestionsSet {
  id: string;
  label: string | null;
  created_at: string;
  questionCount: number;
}

interface AnswerData {
  id: string;
  question_id: string;
  answer_text: string;
  field_type: string;
  selected_options: Json | null;
  last_reviewed_text: string | null;
  is_disabled?: boolean | null;
}

interface FundData {
  id: string;
  name: string;
  organisation: { id: string; name: string } | null;
}

interface QuestionsSetData {
  id: string;
  questions_json: Json;
  overall_word_limit: number | null;
  created_at: string | null;
  approved: boolean | null;
}

interface CriteriaSetData {
  id: string;
  criteria_json: Json;
}

interface ApplicationFormClientProps {
  application: ApplicationData;
  answers: AnswerData[];
  fund: FundData | null;
  questionsSet: QuestionsSetData | null;
  availableQuestionsSets?: AvailableQuestionsSet[];
  criteriaSet?: CriteriaSetData | null;
}

export function ApplicationFormClient({
  application,
  answers: initialAnswers,
  fund,
  questionsSet,
  availableQuestionsSets = [],
  criteriaSet,
}: ApplicationFormClientProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [error, setError] = useState("");
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  // Questions set swap
  const [showSwapConfirm, setShowSwapConfirm] = useState(false);
  const [selectedSwapSetId, setSelectedSwapSetId] = useState("");
  const [swapping, setSwapping] = useState(false);
  const [swapResult, setSwapResult] = useState<{ added: number; removed: number; kept: number } | null>(null);

  const otherSets = availableQuestionsSets.filter((s) => s.id !== application.questions_set_id);
  // Show banner when the newest approved set is newer than the user's current set
  // (handles both approved and unapproved current sets)
  const newestApprovedSet = otherSets[0] ?? null;
  const hasNewerApprovedSet =
    newestApprovedSet !== null &&
    (newestApprovedSet.created_at ?? "") > (questionsSet?.created_at ?? "");

  const handleSwapQuestionsSet = async () => {
    if (!selectedSwapSetId) return;
    setSwapping(true);
    setError("");
    try {
      // Save any pending answers first
      await saveAnswers();

      const res = await fetch(`/api/applications/${application.id}/questions-set`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionsSetId: selectedSwapSetId }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to swap questions set");
        return;
      }

      setSwapResult(data);
      setShowSwapConfirm(false);
      setSelectedSwapSetId("");
      // Reload to get new questions + answers
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSwapping(false);
    }
  };

  // Title editing
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState(application.title ?? "");
  const [savingTitle, setSavingTitle] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);

  const handleTitleEdit = () => {
    setEditingTitle(true);
    setTimeout(() => titleInputRef.current?.select(), 0);
  };

  const handleTitleSave = async () => {
    setEditingTitle(false);
    const trimmed = titleValue.trim();
    // No change
    if (trimmed === (application.title ?? "")) return;
    setSavingTitle(true);
    try {
      await fetch(`/api/applications/${application.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: trimmed }),
      });
    } finally {
      setSavingTitle(false);
    }
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") handleTitleSave();
    if (e.key === "Escape") {
      setTitleValue(application.title ?? "");
      setEditingTitle(false);
    }
  };

  // Parse questions from the questions set
  const questions: Question[] = Array.isArray(questionsSet?.questions_json)
    ? (questionsSet.questions_json as unknown as Question[])
    : [];

  // Build answer state keyed by question_id
  const [answerMap, setAnswerMap] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    for (const a of initialAnswers) {
      map[a.question_id] = a.answer_text;
    }
    return map;
  });

  const [optionsMap, setOptionsMap] = useState<Record<string, string[]>>(() => {
    const map: Record<string, string[]> = {};
    for (const a of initialAnswers) {
      if (a.selected_options && Array.isArray(a.selected_options)) {
        map[a.question_id] = a.selected_options as string[];
      }
    }
    return map;
  });

  const [disabledMap, setDisabledMap] = useState<Record<string, boolean>>(() => {
    const map: Record<string, boolean> = {};
    for (const a of initialAnswers) {
      if (a.is_disabled) {
        map[a.question_id] = true;
      }
    }
    return map;
  });

  // Track last_reviewed_text per question
  const reviewedTextMap: Record<string, string | null> = {};
  for (const a of initialAnswers) {
    reviewedTextMap[a.question_id] = a.last_reviewed_text;
  }

  // Dirty tracking for auto-save
  const dirtyRef = useRef(false);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const saveAnswers = useCallback(async () => {
    if (!dirtyRef.current) return;

    const answersToSave = questions
      .filter((q) => answerMap[q.id] !== undefined || disabledMap[q.id] !== undefined)
      .map((q) => ({
        question_id: q.id,
        answer_text: answerMap[q.id] ?? "",
        is_disabled: disabledMap[q.id] ?? false,
        ...(optionsMap[q.id] && { selected_options: optionsMap[q.id] }),
      }));

    if (answersToSave.length === 0) return;

    setSaving(true);
    try {
      const res = await fetch(`/api/applications/${application.id}/answers`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers: answersToSave }),
      });

      if (res.ok) {
        dirtyRef.current = false;
        setLastSaved(new Date());
        setError("");
      } else {
        const data = await res.json();
        setError(data.error ?? "Failed to save");
      }
    } catch {
      setError("Network error saving answers");
    } finally {
      setSaving(false);
    }
  }, [answerMap, optionsMap, disabledMap, application.id, questions]);

  // Auto-save every 30s if dirty
  useEffect(() => {
    autoSaveTimerRef.current = setInterval(() => {
      if (dirtyRef.current) {
        saveAnswers();
      }
    }, 30000);
    return () => {
      if (autoSaveTimerRef.current) clearInterval(autoSaveTimerRef.current);
    };
  }, [saveAnswers]);

  const handleChange = (questionId: string, value: string) => {
    setAnswerMap((prev) => ({ ...prev, [questionId]: value }));
    dirtyRef.current = true;
  };

  const handleOptionsChange = (questionId: string, options: string[]) => {
    setOptionsMap((prev) => ({ ...prev, [questionId]: options }));
    dirtyRef.current = true;
  };

  const handleDisabledChange = (questionId: string, disabled: boolean) => {
    setDisabledMap((prev) => ({ ...prev, [questionId]: disabled }));
    dirtyRef.current = true;
  };

  const handleBlur = () => {
    if (dirtyRef.current) {
      saveAnswers();
    }
  };

  const handleSubmitForReview = async () => {
    // Force save first
    await saveAnswers();

    setSubmitting(true);
    setError("");

    try {
      const res = await fetch(`/api/applications/${application.id}/submit-for-review`, {
        method: "POST",
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to submit for review");
        return;
      }

      router.push(`/applications/${application.id}/review`);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    setError("");
    try {
      const res = await fetch(`/api/applications/${application.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Failed to delete application");
        setShowDeleteConfirm(false);
        return;
      }
      router.push("/dashboard");
    } catch {
      setError("Network error. Please try again.");
      setShowDeleteConfirm(false);
    } finally {
      setDeleting(false);
    }
  };

  // Markdown export/import
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importResult, setImportResult] = useState<ParseResult | null>(null);

  const handleExport = () => {
    if (!fund) return;

    const criteria: ExportCriterion[] = Array.isArray(criteriaSet?.criteria_json)
      ? (criteriaSet.criteria_json as unknown as ExportCriterion[])
      : [];

    const md = generateMarkdown({
      application: { id: application.id, title: application.title },
      fund: { id: fund.id, name: fund.name, organisation: fund.organisation },
      criteria,
      questions,
      answerMap,
      optionsMap,
      disabledMap,
      questionsSetId: application.questions_set_id,
    });

    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = getExportFilename(fund.name, application.title, application.id);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 100);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_IMPORT_FILE_SIZE) {
      setError("File is too large. Maximum size is 2 MB.");
      e.target.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const content = reader.result as string;
      const parsed = parseMarkdown(content, questions);
      const validated = validateImportMetadata(parsed, application.id, application.questions_set_id);
      setImportResult(validated);
    };
    reader.readAsText(file);

    // Reset input so the same file can be re-selected
    e.target.value = "";
  };

  const applyImport = (result: ParseResult) => {
    const newAnswerMap = { ...answerMap };
    const newOptionsMap = { ...optionsMap };
    const newDisabledMap = { ...disabledMap };

    for (const a of result.answers) {
      newAnswerMap[a.question_id] = a.answer_text;
      if (a.selected_options) {
        newOptionsMap[a.question_id] = a.selected_options;
      }
      newDisabledMap[a.question_id] = a.is_disabled;
    }

    setAnswerMap(newAnswerMap);
    setOptionsMap(newOptionsMap);
    setDisabledMap(newDisabledMap);
    dirtyRef.current = true;
    setImportResult(null);

    // Trigger save
    setTimeout(() => saveAnswers(), 0);
  };

  const isReviewing = application.status === "submitted_for_review" || application.status === "reviewing";
  const isDraft = application.status === "draft";
  const isReviewed = application.status === "reviewed";

  // Group questions by section
  const sections: { label: string | null; questions: Question[] }[] = [];
  let currentSection: string | null = null;
  for (const q of questions) {
    if (q.section !== currentSection) {
      currentSection = q.section ?? null;
      sections.push({ label: currentSection, questions: [] });
    }
    sections[sections.length - 1].questions.push(q);
  }
  if (sections.length === 0) {
    sections.push({ label: null, questions });
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          {editingTitle ? (
            <input
              ref={titleInputRef}
              value={titleValue}
              onChange={(e) => setTitleValue(e.target.value)}
              onBlur={handleTitleSave}
              onKeyDown={handleTitleKeyDown}
              placeholder={fund?.name ?? "Application name"}
              className="w-full rounded-md border border-blue-400 bg-transparent px-2 py-0.5 text-2xl font-bold outline-none ring-2 ring-blue-200 dark:border-blue-500 dark:ring-blue-900/50"
            />
          ) : (
            <button
              type="button"
              onClick={handleTitleEdit}
              className="group flex items-center gap-2 text-left"
            >
              <h1 className="text-2xl font-bold">
                {titleValue || fund?.name || "Application"}
                {savingTitle && (
                  <span className="ml-2 text-sm font-normal text-zinc-400">Saving...</span>
                )}
              </h1>
              <svg
                className="h-4 w-4 shrink-0 text-zinc-400 opacity-0 transition-opacity group-hover:opacity-100"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.75}
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125" />
              </svg>
            </button>
          )}
          <p className="mt-1 text-sm text-zinc-500">
            {fund?.name}
            {fund?.organisation ? ` — ${fund.organisation.name}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {saving && (
            <span className="text-xs text-zinc-400">Saving...</span>
          )}
          {!saving && lastSaved && (
            <span className="text-xs text-zinc-400">
              Saved {lastSaved.toLocaleTimeString()}
            </span>
          )}
          <ApplicationStatusBadge status={application.status} />
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Review in progress notice */}
      {isReviewing && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-900/30 dark:bg-blue-900/10">
          <p className="text-sm text-blue-800 dark:text-blue-300">
            Your application is being reviewed. You&apos;ll be able to edit after the review completes.
          </p>
          <button
            type="button"
            onClick={() => router.push(`/applications/${application.id}/review`)}
            className="mt-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
          >
            View Review Progress
          </button>
        </div>
      )}

      {/* Reviewed notice */}
      {isReviewed && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-900/30 dark:bg-green-900/10">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-green-800 dark:text-green-300">
              Review #{application.review_count} complete. Edit your answers and submit again when ready.
            </p>
            <div className="flex shrink-0 items-center gap-2">
              {application.review_count > 1 && (
                <Link
                  href={`/applications/${application.id}/history`}
                  className="rounded-lg border border-green-600 px-3 py-1.5 text-sm font-medium text-green-700 transition-colors hover:bg-green-100 dark:border-green-500 dark:text-green-400 dark:hover:bg-green-900/20"
                >
                  View History
                </Link>
              )}
              <button
                type="button"
                onClick={() => router.push(`/applications/${application.id}/review`)}
                className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700"
              >
                View Feedback
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Swap result notice */}
      {swapResult && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 dark:border-blue-900/30 dark:bg-blue-900/10">
          <p className="text-sm text-blue-800 dark:text-blue-300">
            Questions set updated: {swapResult.kept} answers kept, {swapResult.added} new questions added{swapResult.removed > 0 ? `, ${swapResult.removed} removed` : ""}.
          </p>
          <button
            type="button"
            onClick={() => setSwapResult(null)}
            className="mt-1 text-xs text-blue-600 underline hover:text-blue-800 dark:text-blue-400"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Updated questions set banner */}
      {hasNewerApprovedSet && (isDraft || isReviewed) && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/30 dark:bg-amber-900/10">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                An updated official questions set has been published for this fund.
              </p>
              <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-400">
                Switch to use the latest approved questions. Your existing answers for matching questions will be kept.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setSelectedSwapSetId(newestApprovedSet?.id ?? "");
                setShowSwapConfirm(true);
              }}
              className="shrink-0 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-700"
            >
              Switch to Latest
            </button>
          </div>
        </div>
      )}

      {/* Questions set selector (when multiple sets available) */}
      {otherSets.length > 0 && (isDraft || isReviewed) && (
        <details className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <summary className="cursor-pointer text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Switch to a different questions set ({availableQuestionsSets.length} available)
          </summary>
          <div className="mt-3 space-y-2">
            {availableQuestionsSets.map((s) => (
              <div
                key={s.id}
                className={`flex items-center justify-between rounded-lg border p-3 ${
                  s.id === application.questions_set_id
                    ? "border-blue-300 bg-blue-50 dark:border-blue-800 dark:bg-blue-900/20"
                    : "border-zinc-200 dark:border-zinc-700"
                }`}
              >
                <div>
                  <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                    {s.label || "Untitled set"}
                  </span>
                  <span className="ml-2 text-xs text-zinc-500">
                    {s.questionCount} questions
                  </span>
                  {s.id === application.questions_set_id && (
                    <span className="ml-2 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                      Current
                    </span>
                  )}
                </div>
                {s.id !== application.questions_set_id && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedSwapSetId(s.id);
                      setShowSwapConfirm(true);
                    }}
                    className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  >
                    Switch
                  </button>
                )}
              </div>
            ))}
          </div>
        </details>
      )}

      {/* Questions form */}
      {sections.map((section, si) => (
        <div key={si} className="space-y-4">
          {section.label && (
            <h2 className="text-lg font-semibold text-zinc-800 dark:text-zinc-200">
              {section.label}
            </h2>
          )}
          {section.questions.map((q) => (
            <FormField
              key={q.id}
              question={q}
              value={answerMap[q.id] ?? ""}
              selectedOptions={optionsMap[q.id]}
              lastReviewedText={reviewedTextMap[q.id]}
              isDisabled={disabledMap[q.id] ?? false}
              onChange={(v) => handleChange(q.id, v)}
              onOptionsChange={(opts) => handleOptionsChange(q.id, opts)}
              onDisabledChange={(disabled) => handleDisabledChange(q.id, disabled)}
              onBlur={handleBlur}
            />
          ))}
        </div>
      ))}

      {/* Overall word limit indicator */}
      {questionsSet?.overall_word_limit && (
        <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <TotalWordCount
            answerMap={answerMap}
            disabledMap={disabledMap}
            limit={questionsSet.overall_word_limit}
          />
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3 border-t border-zinc-200 pt-6 dark:border-zinc-800">
        <button
          type="button"
          onClick={() => router.push("/dashboard")}
          className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          Back to Dashboard
        </button>
        {(isDraft || isReviewed) && fund && (
          <Link
            href={`/funds/${fund.id}/questions-sets/new?from=${application.questions_set_id}&applicationId=${application.id}&returnTo=/applications/${application.id}`}
            className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Update Questions
          </Link>
        )}
        {(isDraft || isReviewed) && fund && (
          <>
            <button
              type="button"
              onClick={handleExport}
              className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Export Markdown
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Import Markdown
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".md,text/markdown"
              onChange={handleFileSelect}
              className="hidden"
            />
          </>
        )}
        {application.review_count > 1 && (
          <Link
            href={`/applications/${application.id}/history`}
            className="text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
          >
            Review History
          </Link>
        )}
        <div className="ml-auto flex items-center gap-3">
          <button
            type="button"
            onClick={() => setShowDeleteConfirm(true)}
            className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/20"
          >
            Delete Application
          </button>
          {(isDraft || isReviewed) && (
            <button
              type="button"
              onClick={handleSubmitForReview}
              disabled={submitting}
              className="rounded-lg bg-blue-600 px-6 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting
                ? "Submitting..."
                : isReviewed
                  ? "Request New Review"
                  : "Submit for Review"}
            </button>
          )}
        </div>
      </div>

      {/* Delete confirmation modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl dark:bg-zinc-900">
            <h2 className="text-lg font-semibold">Delete application?</h2>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              This will permanently delete{" "}
              <span className="font-medium text-zinc-900 dark:text-zinc-100">
                {application.title ?? fund?.name ?? "Untitled application"}
              </span>{" "}
              and all its answers and reviews. This cannot be undone.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleting}
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {deleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import result modal */}
      {importResult && (
        <ImportResultModal
          result={importResult}
          onConfirm={() => applyImport(importResult)}
          onCancel={() => setImportResult(null)}
        />
      )}

      {/* Swap questions set confirmation modal */}
      {showSwapConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl dark:bg-zinc-900">
            <h2 className="text-lg font-semibold">Switch questions set?</h2>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              Answers for matching questions will be kept. New questions will be added as blank, and questions no longer in the new set will be removed.
            </p>
            {selectedSwapSetId && (() => {
              const selected = availableQuestionsSets.find((s) => s.id === selectedSwapSetId);
              return selected ? (
                <div className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-800">
                  <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                    {selected.label || "Untitled set"}
                  </p>
                  <p className="text-xs text-zinc-500">{selected.questionCount} questions</p>
                </div>
              ) : null;
            })()}
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowSwapConfirm(false);
                  setSelectedSwapSetId("");
                }}
                disabled={swapping}
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSwapQuestionsSet}
                disabled={swapping}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {swapping ? "Switching..." : "Switch"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TotalWordCount({
  answerMap,
  disabledMap,
  limit,
}: {
  answerMap: Record<string, string>;
  disabledMap: Record<string, boolean>;
  limit: number;
}) {
  const total = Object.entries(answerMap).reduce(
    (sum, [id, text]) => (disabledMap[id] ? sum : sum + (text.trim() ? text.trim().split(/\s+/).length : 0)),
    0
  );
  const ratio = total / limit;
  const colour =
    ratio > 0.95
      ? "text-red-600 dark:text-red-400"
      : ratio > 0.8
        ? "text-amber-600 dark:text-amber-400"
        : "text-zinc-700 dark:text-zinc-300";

  return (
    <div className="flex items-center justify-between">
      <span className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
        Overall word count
      </span>
      <span className={`text-sm font-semibold ${colour}`}>
        {total} / {limit} words
      </span>
    </div>
  );
}
