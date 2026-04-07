"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { FormField } from "@/components/FormField";
import { ApplicationStatusBadge } from "@/components/ApplicationStatusBadge";
import { FundDateBanner } from "@/components/FundDateBanner";
import { ImportResultModal } from "@/components/ImportResultModal";
import type { Json } from "@/types/database";
import {
  useDeleteApplication,
  useTitleEditing,
  useFormAutoSave,
  useQuestionsSetSwap,
  useImportExport,
} from "./hooks";

interface Question {
  id: string;
  question: string;
  word_count_min?: number;
  word_count_max?: number;
  guidance?: string;
  field_type?: string;
  options?: string[];
  char_count_max?: number;
  required?: boolean;
  section?: string;
}

interface ApplicationData {
  id: string;
  title: string | null;
  status: string;
  review_count: number;
  fund_id: string;
  questions_set_id: string | null;
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
  opens_at: string | null;
  closes_at: string | null;
  application_format?: string;
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

// ---------------------------------------------------------------------------
// Converts a mammoth HTML string to plain text, preserving tables as
// GitHub-flavoured markdown tables and collapsing other HTML to text.
// Runs client-side using the browser's built-in DOMParser.
// ---------------------------------------------------------------------------
function tableToMarkdown(table: Element): string {
  const rows = Array.from(table.querySelectorAll("tr"));
  if (rows.length === 0) return "";

  const tableData = rows.map((row) =>
    Array.from(row.querySelectorAll("td, th")).map((cell) =>
      (cell.textContent ?? "").trim().replace(/\|/g, "\\|").replace(/\s*\n\s*/g, " ")
    )
  );

  const maxCols = Math.max(...tableData.map((r) => r.length));
  const padded = tableData.map((row) => {
    const r = [...row];
    while (r.length < maxCols) r.push("");
    return r;
  });

  const separator = Array(maxCols).fill("---");
  const lines = padded.flatMap((row, i) => {
    const line = "| " + row.join(" | ") + " |";
    return i === 0 ? [line, "| " + separator.join(" | ") + " |"] : [line];
  });

  return lines.join("\n");
}

function nodeToMarkdownText(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
  if (node.nodeType !== Node.ELEMENT_NODE) return "";

  const el = node as Element;
  const tag = el.tagName.toLowerCase();

  if (tag === "table") return tableToMarkdown(el) + "\n\n";
  if (tag === "br") return "\n";

  const inner = Array.from(el.childNodes).map(nodeToMarkdownText).join("");

  if (["p", "div", "h1", "h2", "h3", "h4", "h5", "h6"].includes(tag)) {
    return inner.trim() ? inner.trimEnd() + "\n\n" : "";
  }
  if (tag === "li") return inner.trimEnd() + "\n";

  return inner;
}

function htmlToMarkdownText(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  return nodeToMarkdownText(doc.body)
    .replace(/\n{3,}/g, "\n\n") // collapse excessive blank lines
    .trim();
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
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [cancellingReview, setCancellingReview] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [estimateState, setEstimateState] = useState<{
    low: number;
    high: number;
    remaining: number;
    canAfford: boolean;
    hasEstimate: boolean;
  } | null>(null);
  const [loadingUsage, setLoadingUsage] = useState(false);
  const [draftReviewMode, setDraftReviewMode] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const extractFileInputRef = useRef<HTMLInputElement>(null);
  const [docxUploading, setDocxUploading] = useState(false);
  const docxFileInputRef = useRef<HTMLInputElement>(null);

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
    application.questions_set_id ?? "",
    availableQuestionsSets,
    questionsSet?.created_at ?? null,
    saveAnswers,
    setError
  );

  const {
    fileInputRef, importResult, setImportResult,
    handleExport, openFileDialog, handleFileSelect, applyImport,
  } = useImportExport(
    application, fund, criteriaSet, questions,
    answerMap, optionsMap, disabledMap,
    setAnswerMap, setOptionsMap, setDisabledMap,
    dirtyRef, saveAnswers, setError
  );

  // Derive application format
  const applicationFormat = (fund?.application_format ?? "question_form") as
    | "question_form"
    | "structured_doc"
    | "unstructured_doc";
  const isUnstructuredDoc = applicationFormat === "unstructured_doc";

  // Document content state for unstructured_doc forms
  const documentAnswer = initialAnswers.find((a) => a.question_id === "document_content");
  const [documentContent, setDocumentContent] = useState(documentAnswer?.answer_text ?? "");
  const documentWordCount = documentContent.trim()
    ? documentContent.trim().split(/\s+/).filter(Boolean).length
    : 0;

  // Auto-save document content for unstructured_doc
  const hasInitializedRef = useRef(false);

  const saveDocumentContent = useCallback(
    async (text: string) => {
      try {
        await fetch(`/api/applications/${application.id}/answers`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            answers: [{ question_id: "document_content", answer_text: text }],
          }),
        });
      } catch {
        // silent — same pattern as auto-save
      }
    },
    [application.id]
  );

  useEffect(() => {
    if (!isUnstructuredDoc) return;

    // Skip the first effect run (data just loaded from server)
    if (!hasInitializedRef.current) {
      hasInitializedRef.current = true;
      return;
    }

    const timer = setTimeout(() => {
      saveDocumentContent(documentContent);
    }, 1500);
    return () => clearTimeout(timer);
  }, [documentContent, isUnstructuredDoc, saveDocumentContent]);

  async function handleExtractAnswers(file: File | undefined) {
    if (!file) return;
    setExtracting(true);
    setError("");
    try {
      const arrayBuffer = await file.arrayBuffer();
      const uint8 = new Uint8Array(arrayBuffer);
      const CHUNK = 8192;
      let binary = "";
      for (let i = 0; i < uint8.length; i += CHUNK) {
        binary += String.fromCharCode(...uint8.subarray(i, i + CHUNK));
      }
      const base64 = btoa(binary);
      const res = await fetch(`/api/applications/${application.id}/extract-answers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: base64, contentType: "docx_base64" }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Failed to extract answers from document");
        return;
      }
      const data = await res.json();
      const extracted: Array<{ question_id: string; answer_text: string }> = data.answers ?? [];
      setAnswerMap((prev) => {
        const next = { ...prev };
        for (const a of extracted) {
          if (a.answer_text) {
            next[a.question_id] = a.answer_text;
          }
        }
        return next;
      });
      dirtyRef.current = true;
    } catch {
      setError("Failed to extract answers. Please try again.");
    } finally {
      setExtracting(false);
      if (extractFileInputRef.current) {
        extractFileInputRef.current.value = "";
      }
    }
  }

  async function handleDocxUpload(file: File | undefined) {
    if (!file) return;
    setDocxUploading(true);
    setError("");
    // Reset input so the same file can be re-selected if needed
    if (docxFileInputRef.current) docxFileInputRef.current.value = "";
    try {
      const mod = await import("mammoth");
      // Dynamic CJS imports in Next.js can land on .default
      const mammoth = (mod as unknown as { default?: typeof mod }).default ?? mod;
      const arrayBuffer = await file.arrayBuffer();
      const { value: html } = await mammoth.convertToHtml({ arrayBuffer });
      const text = htmlToMarkdownText(html);
      if (!text) {
        setError("The .docx file appears to be empty or could not be read.");
        return;
      }
      setDocumentContent(text);
    } catch (err) {
      console.error("Failed to parse docx:", err);
      setError("Failed to read the .docx file. Please try again or paste the text directly.");
    } finally {
      setDocxUploading(false);
    }
  }

  const handleSubmitClick = async () => {
    await saveAnswers();
    setError("");
    setLoadingUsage(true);

    try {
      const res = await fetch(`/api/applications/${application.id}/estimate`);
      if (!res.ok) {
        // Fallback: show no-estimate confirm dialog if estimate fails
        setLoadingUsage(false);
        setEstimateState({ low: 0, high: 0, remaining: 0, canAfford: true, hasEstimate: false });
        setShowSubmitConfirm(true);
        return;
      }
      const data = await res.json();
      setEstimateState({
        low: data.estimate?.low ?? 0,
        high: data.estimate?.high ?? 0,
        remaining: data.credits.remaining,
        canAfford: data.canAfford,
        hasEstimate: data.estimate !== null,
      });
      setShowSubmitConfirm(true);
    } catch {
      // Fallback: show no-estimate confirm dialog if estimate fails
      setEstimateState({ low: 0, high: 0, remaining: 0, canAfford: true, hasEstimate: false });
      setShowSubmitConfirm(true);
    } finally {
      setLoadingUsage(false);
    }
  };

  const handleConfirmSubmit = async () => {
    setShowSubmitConfirm(false);
    setSubmitting(true);
    setError("");

    try {
      const res = await fetch(`/api/applications/${application.id}/submit-for-review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_draft: draftReviewMode }),
      });

      const data = await res.json();

      if (res.status === 402) {
        setEstimateState({
          low: data.estimate?.low ?? 0,
          high: data.estimate?.high ?? 0,
          remaining: 0,
          canAfford: false,
          hasEstimate: data.estimate !== null,
        });
        setShowSubmitConfirm(true);
        return;
      }

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

  const handleCancelReview = async () => {
    if (!showCancelConfirm) {
      setShowCancelConfirm(true);
      return;
    }
    setShowCancelConfirm(false);
    setCancellingReview(true);
    setError("");
    try {
      const res = await fetch(`/api/applications/${application.id}/cancel-review`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Failed to cancel review");
        return;
      }
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setCancellingReview(false);
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

      {/* Fund date banner */}
      {fund && <FundDateBanner opensAt={fund.opens_at} closesAt={fund.closes_at} />}

      {/* Review in progress notice */}
      {isReviewing && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/20">
          <p className="text-sm text-blue-800 dark:text-blue-300">
            {application.status === "submitted_for_review"
              ? "Your review is queued and will start shortly."
              : "Your application is being reviewed. You'll be able to edit after the review completes."}
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => router.push(`/applications/${application.id}/review`)}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
            >
              View Review Progress
            </button>
            {application.status === "submitted_for_review" && (
              <button
                type="button"
                onClick={handleCancelReview}
                disabled={cancellingReview}
                className="rounded-lg border border-blue-300 px-4 py-2 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-blue-700 dark:text-blue-300 dark:hover:bg-blue-900/40"
              >
                {cancellingReview
                  ? "Cancelling..."
                  : showCancelConfirm
                    ? "Are you sure? Click to confirm"
                    : "Cancel queued review"}
              </button>
            )}
          </div>
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

      {/* Questions form / Document textarea */}
      {isUnstructuredDoc ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Your document</h2>
            <label className={`inline-flex items-center gap-1.5 text-sm border rounded-md px-3 py-1.5 transition-colors ${docxUploading ? "cursor-not-allowed border-zinc-200 text-zinc-400" : "cursor-pointer text-indigo-600 hover:text-indigo-800 border-indigo-200"}`}>
              {docxUploading ? (
                <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
              )}
              {docxUploading ? "Parsing…" : "Upload .docx"}
              <input
                ref={docxFileInputRef}
                type="file"
                accept=".docx"
                className="sr-only"
                disabled={docxUploading}
                onChange={(e) => handleDocxUpload(e.target.files?.[0])}
              />
            </label>
          </div>
          <textarea
            className="w-full min-h-[400px] resize-y rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500"
            placeholder="Paste or type your document here, or upload a .docx file above…"
            value={documentContent}
            onChange={(e) => setDocumentContent(e.target.value)}
          />
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {documentWordCount} word{documentWordCount !== 1 ? "s" : ""}
          </p>
        </div>
      ) : (
        <>
          {/* Upload answers from document (question_form / structured_doc only) */}
          {(isDraft || isReviewed) && (
            <div className="flex items-center gap-3 rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900/50">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 shrink-0 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              <p className="flex-1 text-sm text-zinc-600 dark:text-zinc-400">
                Have a document with your answers? Upload it to auto-populate the form.
              </p>
              <label className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${extracting ? "cursor-not-allowed border-zinc-200 text-zinc-400" : "border-indigo-300 text-indigo-600 hover:bg-indigo-50 dark:border-indigo-700 dark:text-indigo-400 dark:hover:bg-indigo-900/20"}`}>
                {extracting ? "Extracting..." : "Upload answers from document"}
                <input
                  ref={extractFileInputRef}
                  type="file"
                  accept=".docx"
                  className="sr-only"
                  disabled={extracting}
                  onChange={(e) => handleExtractAnswers(e.target.files?.[0])}
                />
              </label>
            </div>
          )}

          {sections.reduce<{ elements: React.ReactNode[]; counter: number }>(
            (acc, section, si) => {
              const sectionQuestions = section.questions.map((q, qi) => {
                const num = acc.counter + qi + 1;
                return (
                  <FormField
                    key={q.id}
                    question={q}
                    questionNumber={num}
                    value={answerMap[q.id] ?? ""}
                    selectedOptions={optionsMap[q.id]}
                    lastReviewedText={reviewedTextMap[q.id]}
                    isDisabled={disabledMap[q.id] ?? false}
                    onChange={(v) => handleChange(q.id, v)}
                    onOptionsChange={(opts) => handleOptionsChange(q.id, opts)}
                    onDisabledChange={(disabled) => handleDisabledChange(q.id, disabled)}
                    onBlur={handleBlur}
                  />
                );
              });
              acc.elements.push(
                <div key={si} className="space-y-4">
                  {section.label && (
                    <h2 className="text-lg font-semibold text-zinc-800 dark:text-zinc-200">
                      {section.label}
                    </h2>
                  )}
                  {sectionQuestions}
                </div>
              );
              acc.counter += section.questions.length;
              return acc;
            },
            { elements: [], counter: 0 }
          ).elements}

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
        </>
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
          <ExportImportDropdowns
            onExport={handleExport}
            onImport={openFileDialog}
            fileInputRef={fileInputRef}
            onFileSelect={handleFileSelect}
          />
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
              onClick={handleSubmitClick}
              disabled={submitting || loadingUsage}
              className="rounded-lg bg-blue-600 px-6 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting
                ? "Submitting..."
                : loadingUsage
                  ? "Checking..."
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

      {/* Submit for review confirmation modal */}
      {showSubmitConfirm && estimateState && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl dark:bg-zinc-900">
            {!estimateState.hasEstimate && estimateState.canAfford ? (
              <>
                <h2 className="text-lg font-semibold">Submit for review?</h2>
                <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
                  You have <strong>{estimateState.remaining} credits</strong> remaining.
                  Credits will be deducted based on actual usage after the review completes.
                </p>
                <div className="mt-4">
                  <label className="flex cursor-pointer items-start gap-3">
                    <input
                      type="checkbox"
                      checked={draftReviewMode}
                      onChange={(e) => setDraftReviewMode(e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-zinc-300 text-blue-600"
                    />
                    <div>
                      <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                        This is a draft review
                      </span>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        Placeholders won&apos;t be penalised. Feedback will be framed as suggestions to help you develop your answers.
                      </p>
                    </div>
                  </label>
                </div>
                <div className="mt-6 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => { setShowSubmitConfirm(false); setDraftReviewMode(false); }}
                    className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowSubmitConfirm(false); handleConfirmSubmit(); }}
                    className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
                  >
                    Confirm &amp; Submit
                  </button>
                </div>
              </>
            ) : estimateState.canAfford ? (
              <>
                <h2 className="text-lg font-semibold">Submit for review?</h2>
                <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-900/20">
                  <p className="text-sm text-blue-800 dark:text-blue-200">
                    This review will cost approximately{" "}
                    <strong>{estimateState.low}&ndash;{estimateState.high} credits</strong>.
                    You have <strong>{estimateState.remaining} credits</strong> remaining.
                  </p>
                </div>
                <div className="mt-4">
                  <label className="flex cursor-pointer items-start gap-3">
                    <input
                      type="checkbox"
                      checked={draftReviewMode}
                      onChange={(e) => setDraftReviewMode(e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-zinc-300 text-blue-600"
                    />
                    <div>
                      <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                        This is a draft review
                      </span>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        Placeholders won&apos;t be penalised. Feedback will be framed as suggestions to help you develop your answers.
                      </p>
                    </div>
                  </label>
                </div>
                <div className="mt-6 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => { setShowSubmitConfirm(false); setDraftReviewMode(false); }}
                    className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowSubmitConfirm(false); handleConfirmSubmit(); }}
                    className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
                  >
                    Confirm &amp; Submit
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2 className="text-lg font-semibold">Insufficient credits</h2>
                <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-900/20">
                  <p className="text-sm text-amber-800 dark:text-amber-200">
                    This review needs approximately{" "}
                    <strong>{estimateState.low}&ndash;{estimateState.high} credits</strong>,
                    but you only have <strong>{estimateState.remaining} credits</strong> remaining.
                  </p>
                </div>
                <div className="mt-6 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => { setShowSubmitConfirm(false); setDraftReviewMode(false); }}
                    className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  >
                    Cancel
                  </button>
                  <Link
                    href="/billing"
                    className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-700"
                  >
                    Buy Credits
                  </Link>
                </div>
              </>
            )}
          </div>
        </div>
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

interface ExportImportDropdownsProps {
  onExport: (format: "markdown" | "docx") => void;
  onImport: (format: "markdown" | "docx") => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

function ExportImportDropdowns({
  onExport,
  onImport,
  fileInputRef,
  onFileSelect,
}: ExportImportDropdownsProps) {
  const [exportOpen, setExportOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);
  const importRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) {
        setExportOpen(false);
      }
      if (importRef.current && !importRef.current.contains(e.target as Node)) {
        setImportOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const buttonClass =
    "rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800";
  const menuClass =
    "absolute left-0 top-full z-10 mt-1 w-44 rounded-lg border bg-white py-1 shadow-lg dark:bg-zinc-900 dark:border-zinc-700";
  const menuItemClass =
    "block w-full px-4 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800";

  return (
    <>
      <div className="relative" ref={exportRef}>
        <button
          type="button"
          onClick={() => {
            setExportOpen((v) => !v);
            setImportOpen(false);
          }}
          className={buttonClass}
        >
          Export &#9662;
        </button>
        {exportOpen && (
          <div className={menuClass}>
            <button
              type="button"
              className={menuItemClass}
              onClick={() => {
                onExport("markdown");
                setExportOpen(false);
              }}
            >
              Markdown (.md)
            </button>
            <button
              type="button"
              className={menuItemClass}
              onClick={() => {
                onExport("docx");
                setExportOpen(false);
              }}
            >
              Word (.docx)
            </button>
          </div>
        )}
      </div>
      <div className="relative" ref={importRef}>
        <button
          type="button"
          onClick={() => {
            setImportOpen((v) => !v);
            setExportOpen(false);
          }}
          className={buttonClass}
        >
          Import &#9662;
        </button>
        {importOpen && (
          <div className={menuClass}>
            <button
              type="button"
              className={menuItemClass}
              onClick={() => {
                onImport("markdown");
                setImportOpen(false);
              }}
            >
              Markdown (.md)
            </button>
            <button
              type="button"
              className={menuItemClass}
              onClick={() => {
                onImport("docx");
                setImportOpen(false);
              }}
            >
              Word (.docx)
            </button>
          </div>
        )}
      </div>
      <input
        ref={fileInputRef}
        type="file"
        onChange={onFileSelect}
        className="hidden"
      />
    </>
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
