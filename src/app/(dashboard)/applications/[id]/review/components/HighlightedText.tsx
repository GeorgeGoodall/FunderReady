"use client";

import { useEffect, useRef, useState } from "react";
import type { AnswerInlineComment } from "../types";
import { CommentHighlight } from "./CommentHighlight";

export function HighlightedText({
  text,
  comments,
  questionId,
  reviewId,
  applicationId,
  feedbackMap,
  onFeedbackChange,
}: {
  text: string;
  comments: AnswerInlineComment[];
  questionId?: string;
  reviewId?: string;
  applicationId?: string;
  feedbackMap?: Record<string, "up" | "down">;
  onFeedbackChange?: (itemPath: string, sentiment: "up" | "down" | null) => void;
}) {
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const containerRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpenIdx(null);
      }
    }
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, []);

  if (!text.trim()) {
    return <p className="text-sm italic text-zinc-400">No answer provided</p>;
  }

  if (comments.length === 0) {
    return <p className="whitespace-pre-wrap text-sm text-zinc-700 dark:text-zinc-300">{text}</p>;
  }

  // Find non-overlapping matches sorted by position
  const matches: Array<{ start: number; end: number; comment: AnswerInlineComment; commentIndex: number }> = [];
  for (let ci = 0; ci < comments.length; ci++) {
    const comment = comments[ci];
    const idx = text.indexOf(comment.target_text);
    if (idx !== -1) {
      matches.push({ start: idx, end: idx + comment.target_text.length, comment, commentIndex: ci });
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
    const itemPath = questionId ? `answer_feedback/${questionId}/inline_comments/${m.commentIndex}` : undefined;
    segments.push(
      <CommentHighlight
        key={`h-${i}`}
        text={text.slice(m.start, m.end)}
        comment={m.comment}
        isOpen={openIdx === i}
        onToggle={() => setOpenIdx(openIdx === i ? null : i)}
        reviewId={reviewId}
        applicationId={applicationId}
        itemPath={itemPath}
        feedbackSentiment={itemPath && feedbackMap ? (feedbackMap[itemPath] ?? null) : null}
        onFeedbackChange={onFeedbackChange}
      />
    );
    pos = m.end;
  }
  if (pos < text.length) {
    segments.push(<span key="tail">{text.slice(pos)}</span>);
  }

  return (
    <p ref={containerRef} className="whitespace-pre-wrap text-sm text-zinc-700 dark:text-zinc-300">{segments}</p>
  );
}
