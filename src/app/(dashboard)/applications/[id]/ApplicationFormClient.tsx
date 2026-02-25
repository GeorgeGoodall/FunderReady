"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { FormField } from "@/components/FormField";
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
}

interface AnswerData {
  id: string;
  question_id: string;
  answer_text: string;
  field_type: string;
  selected_options: Json | null;
  last_reviewed_text: string | null;
}

interface FundData {
  id: string;
  name: string;
  funder_organisation: string | null;
}

interface QuestionsSetData {
  id: string;
  questions_json: Json;
  overall_word_limit: number | null;
}

interface ApplicationFormClientProps {
  application: ApplicationData;
  answers: AnswerData[];
  fund: FundData | null;
  questionsSet: QuestionsSetData | null;
}

export function ApplicationFormClient({
  application,
  answers: initialAnswers,
  fund,
  questionsSet,
}: ApplicationFormClientProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

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
      .filter((q) => answerMap[q.id] !== undefined)
      .map((q) => ({
        question_id: q.id,
        answer_text: answerMap[q.id] ?? "",
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
  }, [answerMap, optionsMap, application.id, questions]);

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
          <h1 className="text-2xl font-bold">
            {application.title ?? fund?.name ?? "Application"}
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            {fund?.name}
            {fund?.funder_organisation ? ` — ${fund.funder_organisation}` : ""}
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
          <div className="flex items-center justify-between">
            <p className="text-sm text-green-800 dark:text-green-300">
              Review #{application.review_count} complete. Edit your answers and submit again when ready.
            </p>
            <button
              type="button"
              onClick={() => router.push(`/applications/${application.id}/review`)}
              className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700"
            >
              View Feedback
            </button>
          </div>
        </div>
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
              onChange={(v) => handleChange(q.id, v)}
              onOptionsChange={(opts) => handleOptionsChange(q.id, opts)}
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
  );
}

function ApplicationStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    draft: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
    submitted_for_review: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    reviewing: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    reviewed: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  };

  const labels: Record<string, string> = {
    draft: "Draft",
    submitted_for_review: "Submitted",
    reviewing: "Reviewing",
    reviewed: "Reviewed",
  };

  return (
    <span
      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${styles[status] ?? styles.draft}`}
    >
      {labels[status] ?? status}
    </span>
  );
}

function TotalWordCount({
  answerMap,
  limit,
}: {
  answerMap: Record<string, string>;
  limit: number;
}) {
  const total = Object.values(answerMap).reduce(
    (sum, text) => sum + (text.trim() ? text.trim().split(/\s+/).length : 0),
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
