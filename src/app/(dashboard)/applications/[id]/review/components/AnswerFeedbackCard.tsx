"use client";

import { useState } from "react";
import type { AnswerAnalysis } from "../types";
import { SCORE_COLOURS } from "../constants";
import { CopyButton } from "@/components/CopyButton";
import { HighlightedText } from "./HighlightedText";
import { FeedbackButton } from "./FeedbackButton";

interface AnswerFeedbackCardProps {
  questionNumber: number;
  question: { id: string; question: string; guidance?: string; priority?: number };
  answer: string;
  feedback: AnswerAnalysis;
  isOutdated: boolean;
  defaultExpanded?: boolean;
  alwaysExpanded?: boolean;
  reviewId?: string;
  applicationId?: string;
  feedbackMap?: Record<string, "up" | "down">;
  onFeedbackChange?: (itemPath: string, sentiment: "up" | "down" | null) => void;
}

export function AnswerFeedbackCard({
  questionNumber,
  question,
  answer,
  feedback,
  isOutdated,
  defaultExpanded = false,
  alwaysExpanded = false,
  reviewId,
  applicationId,
  feedbackMap,
  onFeedbackChange,
}: AnswerFeedbackCardProps) {
  const [expanded, setExpanded] = useState(defaultExpanded || alwaysExpanded);
  const isExpanded = alwaysExpanded || expanded;

  const headerContent = (
    <div className="flex-1">
      <div className="flex items-center gap-3">
        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${SCORE_COLOURS[feedback.answer_score] ?? ""}`}>
          {feedback.answer_score}
        </span>
        {isOutdated && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
            Changed since review
          </span>
        )}
        {question.priority !== undefined && question.priority >= 4 && (
          <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">
            Priority {question.priority}/5
          </span>
        )}
        {question.priority !== undefined && question.priority <= 2 && (
          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-500 dark:bg-zinc-700 dark:text-zinc-400">
            Lower priority
          </span>
        )}
      </div>
      {!alwaysExpanded && (
        <p className="mt-1 text-sm font-medium text-zinc-700 dark:text-zinc-300">
          <span className="text-zinc-400 dark:text-zinc-500">{questionNumber}.</span> {question.question}
        </p>
      )}
    </div>
  );

  return (
    <div className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      {/* Header */}
      {alwaysExpanded ? (
        <div className="flex w-full items-center px-5 py-3">
          {headerContent}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="flex w-full items-center justify-between px-5 py-3 text-left"
        >
          {headerContent}
          <svg
            className={`h-4 w-4 shrink-0 text-zinc-400 transition-transform ${expanded ? "rotate-180" : ""}`}
            fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
          </svg>
        </button>
      )}

      {isExpanded && (
        <div className="border-t border-zinc-100 px-5 py-4 dark:border-zinc-800">
          {/* Answer text with highlights */}
          <div className="mb-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium text-zinc-500">Your answer:</span>
              {answer.trim() && <CopyButton text={answer} />}
            </div>
            <HighlightedText
              text={answer}
              comments={feedback.inline_comments}
              questionId={question.id}
              reviewId={reviewId}
              applicationId={applicationId}
              feedbackMap={feedbackMap}
              onFeedbackChange={onFeedbackChange}
            />
          </div>

          {/* Strengths */}
          {feedback.strengths.length > 0 && (
            <div className="mb-3">
              <h4 className="text-xs font-semibold text-green-700 dark:text-green-400">Strengths</h4>
              <ul className="mt-1 space-y-1">
                {feedback.strengths.map((s, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-zinc-700 dark:text-zinc-300">
                    <span className="text-green-500">+</span>
                    <span className="flex-1">{s}</span>
                    {reviewId && applicationId && onFeedbackChange && (
                      <FeedbackButton
                        reviewId={reviewId}
                        applicationId={applicationId}
                        itemPath={`answer_feedback/${question.id}/strengths/${i}`}
                        itemType="strength"
                        currentSentiment={feedbackMap?.[`answer_feedback/${question.id}/strengths/${i}`] ?? null}
                        onSentimentChange={onFeedbackChange}
                      />
                    )}
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
                  <li key={i} className="flex items-start gap-2 text-xs text-zinc-700 dark:text-zinc-300">
                    <span className="text-red-500">-</span>
                    <span className="flex-1">{s}</span>
                    {reviewId && applicationId && onFeedbackChange && (
                      <FeedbackButton
                        reviewId={reviewId}
                        applicationId={applicationId}
                        itemPath={`answer_feedback/${question.id}/weaknesses/${i}`}
                        itemType="weakness"
                        currentSentiment={feedbackMap?.[`answer_feedback/${question.id}/weaknesses/${i}`] ?? null}
                        onSentimentChange={onFeedbackChange}
                      />
                    )}
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
