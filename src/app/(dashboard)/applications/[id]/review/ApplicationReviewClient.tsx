"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CopyButton } from "@/components/CopyButton";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AnswerInlineComment {
  target_text: string;
  category: string;
  issue: string;
  suggestion: string;
}

interface AnswerAnalysis {
  question_id: string;
  inline_comments: AnswerInlineComment[];
  criteria_relevance: Array<{
    criterion_id: string;
    relevance: string;
    notes?: string;
  }>;
  strengths: string[];
  weaknesses: string[];
  answer_score: string;
  word_count_assessment?: {
    actual: number;
    limit?: number;
    status: string;
  };
}

interface CriterionScore {
  criterion_id: string;
  criterion: string;
  score: string;
  bid_evidence: string[];
  gaps: string[];
  summary: string;
}

interface AnswerScore {
  question_id: string;
  question_text: string;
  score: string;
  summary: string;
}

interface CrossReferenceFinding {
  type: string;
  description: string;
  sections_involved: string[];
  criteria_involved?: string[];
  severity: string;
  suggestion?: string;
}

interface CrossReference {
  findings: CrossReferenceFinding[];
  overall_coherence: string;
  summary: string;
}

interface ApplicationScoring {
  answer_scores: AnswerScore[];
  criteria_scores: CriterionScore[];
  overall_score: number;
  overall_descriptor: string;
  submission_readiness: string;
  top_strengths: string[];
  top_improvements: string[];
  improvement_appendix?: Array<{
    criterion_id: string;
    criterion: string;
    what_funder_wants: string;
    how_bid_addresses: string;
    whats_missing: string;
    example_language?: string;
  }>;
}

interface ReviewResults {
  answer_feedback: Record<string, AnswerAnalysis>;
  cross_reference: CrossReference;
  scoring: ApplicationScoring;
}

interface ApplicationReviewClientProps {
  application: {
    id: string;
    title: string | null;
    status: string;
    review_count: number;
    fund_id: string;
  };
  fund: { id: string; name: string; funder_organisation: string | null } | null;
  questions: Array<{ id: string; question: string; guidance?: string; word_count_max?: number }>;
  answers: Array<{ question_id: string; answer_text: string; last_reviewed_text: string | null }>;
  review: {
    id: string;
    review_number: number;
    status: string;
    progress: Record<string, unknown> | null;
    results: Record<string, unknown> | null;
    error_message: string | null;
    created_at: string;
  } | null;
}

// ---------------------------------------------------------------------------
// Shared colour maps
// ---------------------------------------------------------------------------

const SCORE_COLOURS: Record<string, string> = {
  Strong: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  Fair: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  "Needs Improvement": "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  Missing: "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400",
};

const READINESS_COLOURS: Record<string, string> = {
  "Ready to submit": "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  "Nearly ready": "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  "Needs revisions": "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  "Major rework needed": "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

const SEVERITY_COLOURS: Record<string, string> = {
  high: "border-red-200 bg-red-50 dark:border-red-900/30 dark:bg-red-900/10",
  medium: "border-amber-200 bg-amber-50 dark:border-amber-900/30 dark:bg-amber-900/10",
  low: "border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/50",
};

// ---------------------------------------------------------------------------
// Pipeline steps for progress display
// ---------------------------------------------------------------------------

const PIPELINE_STEPS = [
  { key: "pending", label: "Queued" },
  { key: "analysing", label: "Analysing answers" },
  { key: "cross_referencing", label: "Cross-referencing" },
  { key: "scoring", label: "Scoring" },
];

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ApplicationReviewClient({
  application,
  fund,
  questions,
  answers,
  review,
}: ApplicationReviewClientProps) {
  const router = useRouter();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isInProgress = review && !["completed", "failed"].includes(review.status);

  // Poll for updates while in progress
  useEffect(() => {
    if (isInProgress) {
      intervalRef.current = setInterval(() => {
        router.refresh();
      }, 3000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isInProgress, router]);

  // No review yet
  if (!review) {
    return (
      <div className="space-y-4">
        <Header application={application} fund={fund} />
        <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-sm text-zinc-500">No review has been submitted yet.</p>
        </div>
        <Link
          href={`/applications/${application.id}`}
          className="inline-block text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
        >
          &larr; Back to application
        </Link>
      </div>
    );
  }

  // Failed
  if (review.status === "failed") {
    return (
      <div className="space-y-4">
        <Header application={application} fund={fund} />
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 dark:border-red-900 dark:bg-red-900/20">
          <h2 className="font-semibold text-red-700 dark:text-red-400">Review Failed</h2>
          <p className="mt-2 text-sm text-red-600 dark:text-red-400">
            {review.error_message ?? "An unexpected error occurred."}
          </p>
        </div>
        <Link
          href={`/applications/${application.id}`}
          className="inline-block rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
        >
          Edit & Retry
        </Link>
      </div>
    );
  }

  // In progress
  if (isInProgress) {
    const currentIndex = PIPELINE_STEPS.findIndex((s) => s.key === review.status);
    const answersCompleted = (review.progress?.answers_completed as number) ?? 0;
    const answersTotal = (review.progress?.answers_total as number) ?? 0;

    return (
      <div className="space-y-6">
        <Header application={application} fund={fund} />
        <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="font-semibold">Review in progress</h2>
          <p className="mt-1 text-sm text-zinc-500">This page updates automatically.</p>

          <div className="mt-6 space-y-3">
            {PIPELINE_STEPS.map((step, i) => {
              const isCurrent = i === currentIndex;
              const isDone = i < currentIndex;
              const isPending = i > currentIndex;

              return (
                <div key={step.key} className="flex items-center gap-3">
                  {isDone && (
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
                      <svg className="h-3.5 w-3.5 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                      </svg>
                    </span>
                  )}
                  {isCurrent && (
                    <span className="flex h-6 w-6 items-center justify-center">
                      <span className="h-3 w-3 animate-pulse rounded-full bg-blue-500" />
                    </span>
                  )}
                  {isPending && (
                    <span className="flex h-6 w-6 items-center justify-center">
                      <span className="h-2 w-2 rounded-full bg-zinc-300 dark:bg-zinc-600" />
                    </span>
                  )}
                  <span className={`text-sm ${isCurrent ? "font-medium text-blue-600 dark:text-blue-400" : isDone ? "text-zinc-500" : "text-zinc-400 dark:text-zinc-500"}`}>
                    {step.label}
                    {isCurrent && review.status === "analysing" && answersTotal > 0 && ` (${answersCompleted}/${answersTotal})`}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // Completed — show results
  const results = review.results as unknown as ReviewResults | null;
  if (!results?.scoring) {
    return (
      <div className="space-y-4">
        <Header application={application} fund={fund} />
        <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-sm text-zinc-500">Review completed but results are unavailable.</p>
        </div>
      </div>
    );
  }

  const { scoring, answer_feedback, cross_reference } = results;

  // Build outdated map
  const outdatedMap: Record<string, boolean> = {};
  for (const a of answers) {
    outdatedMap[a.question_id] =
      a.last_reviewed_text !== null &&
      a.last_reviewed_text !== undefined &&
      a.answer_text !== a.last_reviewed_text;
  }

  return (
    <div className="space-y-8">
      <Header application={application} fund={fund} />

      {/* Score + readiness */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-baseline gap-2">
          <span className="text-4xl font-bold">{scoring.overall_score}</span>
          <span className="text-sm text-zinc-500">/100</span>
        </div>
        <span className={`rounded-full px-3 py-1 text-sm font-medium ${READINESS_COLOURS[scoring.submission_readiness] ?? ""}`}>
          {scoring.submission_readiness}
        </span>
        <Link
          href={`/applications/${application.id}`}
          className="ml-auto rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
        >
          Edit Answers
        </Link>
      </div>

      <p className="text-sm text-zinc-600 dark:text-zinc-400">{scoring.overall_descriptor}</p>

      {/* Strengths + improvements */}
      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <h3 className="font-semibold text-green-700 dark:text-green-400">Top Strengths</h3>
          <ul className="mt-3 space-y-2">
            {scoring.top_strengths.map((s, i) => (
              <li key={i} className="flex gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                <span className="mt-0.5 text-green-500">+</span>{s}
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <h3 className="font-semibold text-amber-700 dark:text-amber-400">Top Improvements</h3>
          <ul className="mt-3 space-y-2">
            {scoring.top_improvements.map((s, i) => (
              <li key={i} className="flex gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                <span className="mt-0.5 text-amber-500">!</span>{s}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Criteria scores */}
      <div className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="border-b border-zinc-200 px-5 py-3 dark:border-zinc-800">
          <h3 className="font-semibold">Criteria Scores</h3>
        </div>
        <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {scoring.criteria_scores.map((cs) => (
            <div key={cs.criterion_id} className="flex items-center justify-between px-5 py-3">
              <div className="min-w-0 flex-1 pr-4">
                <p className="text-sm font-medium">{cs.criterion}</p>
                <p className="mt-0.5 text-xs text-zinc-500">{cs.summary}</p>
              </div>
              <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${SCORE_COLOURS[cs.score] ?? ""}`}>
                {cs.score}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Answer-by-answer feedback */}
      <div>
        <h3 className="mb-4 text-lg font-semibold">Answer Feedback</h3>
        <div className="space-y-4">
          {questions.map((q) => {
            const feedback = answer_feedback?.[q.id];
            const answer = answers.find((a) => a.question_id === q.id);
            const isOutdated = outdatedMap[q.id] ?? false;

            if (!feedback) return null;

            return (
              <AnswerFeedbackCard
                key={q.id}
                question={q}
                answer={answer?.answer_text ?? ""}
                feedback={feedback}
                isOutdated={isOutdated}
              />
            );
          })}
        </div>
      </div>

      {/* Cross-reference findings */}
      {cross_reference?.findings?.length > 0 && (
        <div>
          <h3 className="mb-4 text-lg font-semibold">Cross-Reference Findings</h3>
          <p className="mb-3 text-sm text-zinc-500">
            Overall coherence: <span className="font-medium capitalize">{cross_reference.overall_coherence}</span>
            {" — "}{cross_reference.summary}
          </p>
          <div className="space-y-3">
            {cross_reference.findings.map((finding, i) => (
              <CrossReferenceFindingCard key={i} finding={finding} />
            ))}
          </div>
        </div>
      )}

      {/* Improvement appendix */}
      {scoring.improvement_appendix && scoring.improvement_appendix.length > 0 && (
        <ImprovementAppendix items={scoring.improvement_appendix} />
      )}

      {/* Actions */}
      <div className="flex items-center gap-3 border-t border-zinc-200 pt-6 dark:border-zinc-800">
        <Link
          href={`/applications/${application.id}`}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
        >
          Edit Answers
        </Link>
        <Link
          href="/dashboard"
          className="text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
        >
          Back to Dashboard
        </Link>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

function Header({
  application,
  fund,
}: {
  application: { title: string | null };
  fund: { name: string; funder_organisation: string | null } | null;
}) {
  return (
    <div>
      <h1 className="text-2xl font-bold">
        {application.title ?? fund?.name ?? "Application"} — Review
      </h1>
      {fund && (
        <p className="mt-0.5 text-sm text-zinc-600 dark:text-zinc-400">
          {fund.name}
          {fund.funder_organisation ? ` — ${fund.funder_organisation}` : ""}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Answer feedback card with inline highlighting
// ---------------------------------------------------------------------------

function AnswerFeedbackCard({
  question,
  answer,
  feedback,
  isOutdated,
}: {
  question: { id: string; question: string; guidance?: string };
  answer: string;
  feedback: AnswerAnalysis;
  isOutdated: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      {/* Header */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between px-5 py-3 text-left"
      >
        <div className="flex items-center gap-3">
          <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${SCORE_COLOURS[feedback.answer_score] ?? ""}`}>
            {feedback.answer_score}
          </span>
          <span className="text-sm font-medium">{question.question}</span>
          {isOutdated && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
              Changed since review
            </span>
          )}
        </div>
        <svg
          className={`h-4 w-4 shrink-0 text-zinc-400 transition-transform ${expanded ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {expanded && (
        <div className="border-t border-zinc-100 px-5 py-4 dark:border-zinc-800">
          {/* Answer text with highlights */}
          <div className="mb-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium text-zinc-500">Your answer:</span>
              {answer.trim() && <CopyButton text={answer} />}
            </div>
            <HighlightedText text={answer} comments={feedback.inline_comments} />
          </div>

          {/* Strengths */}
          {feedback.strengths.length > 0 && (
            <div className="mb-3">
              <h4 className="text-xs font-semibold text-green-700 dark:text-green-400">Strengths</h4>
              <ul className="mt-1 space-y-1">
                {feedback.strengths.map((s, i) => (
                  <li key={i} className="flex gap-2 text-xs text-zinc-700 dark:text-zinc-300">
                    <span className="text-green-500">+</span>{s}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Weaknesses */}
          {feedback.weaknesses.length > 0 && (
            <div className="mb-3">
              <h4 className="text-xs font-semibold text-red-700 dark:text-red-400">Weaknesses</h4>
              <ul className="mt-1 space-y-1">
                {feedback.weaknesses.map((s, i) => (
                  <li key={i} className="flex gap-2 text-xs text-zinc-700 dark:text-zinc-300">
                    <span className="text-red-500">-</span>{s}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Word count */}
          {feedback.word_count_assessment && (
            <div className="text-xs text-zinc-500">
              Words: {feedback.word_count_assessment.actual}
              {feedback.word_count_assessment.limit ? ` / ${feedback.word_count_assessment.limit}` : ""}
              {feedback.word_count_assessment.status === "over_limit" && (
                <span className="ml-1 font-medium text-red-600">Over limit</span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Highlighted text with inline comment popovers
// ---------------------------------------------------------------------------

function HighlightedText({
  text,
  comments,
}: {
  text: string;
  comments: AnswerInlineComment[];
}) {
  if (!text.trim()) {
    return <p className="text-sm italic text-zinc-400">No answer provided</p>;
  }

  if (comments.length === 0) {
    return <p className="whitespace-pre-wrap text-sm text-zinc-700 dark:text-zinc-300">{text}</p>;
  }

  // Find non-overlapping matches sorted by position
  const matches: Array<{ start: number; end: number; comment: AnswerInlineComment }> = [];
  for (const comment of comments) {
    const idx = text.indexOf(comment.target_text);
    if (idx !== -1) {
      matches.push({ start: idx, end: idx + comment.target_text.length, comment });
    }
  }
  matches.sort((a, b) => a.start - b.start);

  // Remove overlaps (keep first match)
  const filtered: typeof matches = [];
  let lastEnd = 0;
  for (const m of matches) {
    if (m.start >= lastEnd) {
      filtered.push(m);
      lastEnd = m.end;
    }
  }

  if (filtered.length === 0) {
    return <p className="whitespace-pre-wrap text-sm text-zinc-700 dark:text-zinc-300">{text}</p>;
  }

  // Build segments
  const segments: React.ReactNode[] = [];
  let pos = 0;
  for (let i = 0; i < filtered.length; i++) {
    const m = filtered[i];
    if (pos < m.start) {
      segments.push(
        <span key={`t-${i}`}>{text.slice(pos, m.start)}</span>
      );
    }
    segments.push(
      <CommentHighlight key={`h-${i}`} text={text.slice(m.start, m.end)} comment={m.comment} />
    );
    pos = m.end;
  }
  if (pos < text.length) {
    segments.push(<span key="tail">{text.slice(pos)}</span>);
  }

  return (
    <p className="whitespace-pre-wrap text-sm text-zinc-700 dark:text-zinc-300">{segments}</p>
  );
}

// ---------------------------------------------------------------------------
// Comment highlight with tooltip
// ---------------------------------------------------------------------------

function CommentHighlight({
  text,
  comment,
}: {
  text: string;
  comment: AnswerInlineComment;
}) {
  const [open, setOpen] = useState(false);

  const categoryColours: Record<string, string> = {
    ALIGNMENT: "bg-blue-100 dark:bg-blue-900/30",
    EVIDENCE: "bg-purple-100 dark:bg-purple-900/30",
    CLARITY: "bg-yellow-100 dark:bg-yellow-900/30",
    STRUCTURE: "bg-indigo-100 dark:bg-indigo-900/30",
    IMPACT: "bg-green-100 dark:bg-green-900/30",
    BUDGET: "bg-orange-100 dark:bg-orange-900/30",
    MISSING: "bg-red-100 dark:bg-red-900/30",
    CONSISTENCY: "bg-teal-100 dark:bg-teal-900/30",
    SPECIFICITY: "bg-amber-100 dark:bg-amber-900/30",
    CONCISENESS: "bg-pink-100 dark:bg-pink-900/30",
  };

  return (
    <span className="relative inline">
      <mark
        className={`cursor-pointer rounded-sm px-0.5 ${categoryColours[comment.category] ?? "bg-yellow-100 dark:bg-yellow-900/30"}`}
        onClick={() => setOpen(!open)}
        title={`[${comment.category}] ${comment.issue}`}
      >
        {text}
      </mark>
      {open && (
        <span className="absolute left-0 top-full z-20 mt-1 w-80 rounded-lg border border-zinc-200 bg-white p-3 shadow-lg dark:border-zinc-700 dark:bg-zinc-800">
          <span className="mb-1 flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">
              [{comment.category}]
            </span>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setOpen(false); }}
              className="text-xs text-zinc-400 hover:text-zinc-600"
            >
              &times;
            </button>
          </span>
          <span className="block text-xs text-zinc-700 dark:text-zinc-300">
            <span className="font-medium">Issue:</span> {comment.issue}
          </span>
          <span className="mt-1 block text-xs text-zinc-600 dark:text-zinc-400">
            <span className="font-medium">Suggestion:</span> {comment.suggestion}
          </span>
        </span>
      )}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Cross-reference finding card
// ---------------------------------------------------------------------------

function CrossReferenceFindingCard({ finding }: { finding: CrossReferenceFinding }) {
  return (
    <div className={`rounded-lg border p-4 ${SEVERITY_COLOURS[finding.severity] ?? SEVERITY_COLOURS.low}`}>
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold capitalize text-zinc-600 dark:text-zinc-400">
          {finding.type.replace(/_/g, " ")}
        </span>
        <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium capitalize ${
          finding.severity === "high" ? "bg-red-200 text-red-800 dark:bg-red-900/40 dark:text-red-300" :
          finding.severity === "medium" ? "bg-amber-200 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300" :
          "bg-zinc-200 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-400"
        }`}>
          {finding.severity}
        </span>
      </div>
      <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">{finding.description}</p>
      {finding.suggestion && (
        <p className="mt-1 text-xs text-zinc-500">
          <span className="font-medium">Fix:</span> {finding.suggestion}
        </p>
      )}
      <p className="mt-1 text-xs text-zinc-400">
        Answers: {finding.sections_involved.join(", ")}
        {finding.criteria_involved?.length ? ` | Criteria: ${finding.criteria_involved.join(", ")}` : ""}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Improvement appendix (collapsible)
// ---------------------------------------------------------------------------

function ImprovementAppendix({
  items,
}: {
  items: NonNullable<ApplicationScoring["improvement_appendix"]>;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between px-5 py-3 text-left"
      >
        <h3 className="font-semibold">Improvement Appendix</h3>
        <svg
          className={`h-4 w-4 text-zinc-400 transition-transform ${expanded ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
        </svg>
      </button>
      {expanded && (
        <div className="divide-y divide-zinc-100 border-t border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {items.map((item) => (
            <div key={item.criterion_id} className="px-5 py-4">
              <h4 className="text-sm font-semibold">{item.criterion}</h4>
              <div className="mt-2 space-y-1.5 text-xs text-zinc-600 dark:text-zinc-400">
                <p><span className="font-medium">What the funder wants:</span> {item.what_funder_wants}</p>
                <p><span className="font-medium">How you address it:</span> {item.how_bid_addresses}</p>
                <p><span className="font-medium">What&apos;s missing:</span> {item.whats_missing}</p>
                {item.example_language && (
                  <div className="mt-2 rounded border border-zinc-200 bg-zinc-50 p-2 dark:border-zinc-700 dark:bg-zinc-800">
                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Suggested language</p>
                    <p className="text-xs text-zinc-700 dark:text-zinc-300">{item.example_language}</p>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
