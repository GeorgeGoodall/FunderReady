"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { FormField } from "@/components/FormField";
import { ApplicationStatusBadge } from "@/components/ApplicationStatusBadge";
import { ImportResultModal } from "@/components/ImportResultModal";
import type { Json } from "@/types/database";
import {
  useDeleteApplication,
  useTitleEditing,
  useFormAutoSave,
  useQuestionsSetSwap,
  useMarkdownImportExport,
} from "./hooks";

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
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Parse questions from the questions set
  const questions: Question[] = Array.isArray(questionsSet?.questions_json)
    ? (questionsSet.questions_json as unknown as Question[])
    : [];

  // Hooks
  const { showDeleteConfirm, setShowDeleteConfirm, deleting, handleDelete } =
    useDeleteApplication(application.id, setError);

  const {
    editingTitle, titleValue, setTitleValue, savingTitle,
    titleInputRef, handleTitleEdit, handleTitleSave, handleTitleKeyDown,
  } = useTitleEditing(application.id, application.title ?? "");

  const {
    answerMap, setAnswerMap, optionsMap, setOptionsMap,
    disabledMap, setDisabledMap, reviewedTextMap,
    saving, lastSaved, dirtyRef, saveAnswers,
    handleChange, handleOptionsChange, handleDisabledChange, handleBlur,
  } = useFormAutoSave(application.id, initialAnswers, questions, setError);

  const {
    showSwapConfirm, setShowSwapConfirm,
    selectedSwapSetId, setSelectedSwapSetId,
    swapping, swapResult, setSwapResult,
    otherSets, newestApprovedSet, hasNewerApprovedSet,
    handleSwapQuestionsSet,
  } = useQuestionsSetSwap(
    application.id,
    application.questions_set_id,
    availableQuestionsSets,
    questionsSet?.created_at ?? null,
    saveAnswers,
    setError
  );

  const {
    fileInputRef, importResult, setImportResult,
    handleExport, handleFileSelect, applyImport,
  } = useMarkdownImportExport(
    application, fund, criteriaSet, questions,
    answerMap, optionsMap, disabledMap,
    setAnswerMap, setOptionsMap, setDisabledMap,
    dirtyRef, saveAnswers, setError
  );

  const handleSubmitForReview = async () => {
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
