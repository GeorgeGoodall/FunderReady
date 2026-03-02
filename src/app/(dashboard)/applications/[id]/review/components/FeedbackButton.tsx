"use client";

import { useState, useCallback, useEffect, useRef } from "react";

type Sentiment = "up" | "down" | null;
type ItemType = "inline_comment" | "criteria_score" | "strength" | "weakness" | "cross_reference_summary" | "cross_reference_finding";

interface FeedbackButtonProps {
  reviewId: string;
  applicationId: string;
  itemPath: string;
  itemType: ItemType;
  currentSentiment: Sentiment;
  onSentimentChange?: (itemPath: string, sentiment: Sentiment) => void;
}

const THUMB_UP_PATH = "M6.633 10.25c.806 0 1.533-.446 2.031-1.08a9.041 9.041 0 0 1 2.861-2.4c.723-.384 1.35-.956 1.653-1.715a4.498 4.498 0 0 0 .322-1.672V2.75a.75.75 0 0 1 .75-.75 2.25 2.25 0 0 1 2.25 2.25c0 1.152-.26 2.243-.723 3.218-.266.558.107 1.282.725 1.282m0 0h3.126c1.026 0 1.945.694 2.054 1.715.045.422.068.85.068 1.285a11.95 11.95 0 0 1-2.649 7.521c-.388.482-.987.729-1.605.729H13.48c-.483 0-.964-.078-1.423-.23l-3.114-1.04a4.501 4.501 0 0 0-1.423-.23H5.904m10.598-9.75H14.25M5.904 18.5c.083.205.173.405.27.602.197.4-.078.898-.523.898h-.908c-.889 0-1.713-.518-1.972-1.368a12 12 0 0 1-.521-3.507c0-1.553.295-3.036.831-4.398C3.387 9.953 4.167 9.5 5 9.5h1.053c.472 0 .745.556.5.96a8.958 8.958 0 0 0-1.302 4.665c0 1.194.232 2.333.654 3.375Z";
const THUMB_DOWN_PATH = "M7.498 15.25H4.372c-1.026 0-1.945-.694-2.054-1.715A12.137 12.137 0 0 1 2.25 12c0-2.848.992-5.464 2.649-7.521C5.287 3.997 5.886 3.75 6.504 3.75h4.369a4.5 4.5 0 0 1 1.423.23l3.114 1.04a4.5 4.5 0 0 0 1.423.23h1.294M7.498 15.25c.618 0 .991.724.725 1.282A7.471 7.471 0 0 0 7.5 19.75 2.25 2.25 0 0 0 9.75 22a.75.75 0 0 0 .75-.75v-.633c0-.573.11-1.14.322-1.672.304-.76.93-1.33 1.653-1.715a9.04 9.04 0 0 0 2.86-2.4c.498-.634 1.226-1.08 2.032-1.08h.384m-10.253 1.5H9.7m8.075-9.75c.01.05.027.1.05.148.593 1.2.925 2.55.925 3.977 0 1.31-.269 2.558-.754 3.69-.146.339.07.744.44.744h.952c.889 0 1.713-.518 1.972-1.368a12 12 0 0 0 .521-3.507c0-1.553-.295-3.036-.831-4.398C19.613 3.453 18.833 3 18 3h-1.053c-.472 0-.745.556-.5.96a8.958 8.958 0 0 1 .303.54Z";

/** Toggle logic: clicking the same button removes sentiment, different button switches. */
export function computeNewSentiment(current: Sentiment, target: "up" | "down"): Sentiment {
  return current === target ? null : target;
}

/** Send feedback to the API. Returns true on success, false on failure. */
export async function sendFeedback(
  applicationId: string,
  reviewId: string,
  itemPath: string,
  itemType: ItemType,
  sentiment: Sentiment
): Promise<boolean> {
  try {
    const res = await fetch(
      `/api/applications/${applicationId}/reviews/${reviewId}/feedback`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          item_path: itemPath,
          item_type: itemType,
          sentiment,
        }),
      }
    );
    return res.ok;
  } catch {
    return false;
  }
}

export function FeedbackButton({
  reviewId,
  applicationId,
  itemPath,
  itemType,
  currentSentiment,
  onSentimentChange,
}: FeedbackButtonProps) {
  const [sentiment, setSentiment] = useState<Sentiment>(currentSentiment);
  const [saving, setSaving] = useState(false);
  // Use ref to avoid stale closure in toggle callback
  const sentimentRef = useRef(sentiment);
  sentimentRef.current = sentiment;

  // Sync local state when parent provides a new value (e.g. after server data refresh)
  useEffect(() => {
    setSentiment(currentSentiment);
  }, [currentSentiment]);

  const toggle = useCallback(
    async (target: "up" | "down") => {
      if (saving) return;
      const current = sentimentRef.current;
      const newSentiment = computeNewSentiment(current, target);
      const previousSentiment = current;

      // Optimistic update
      setSentiment(newSentiment);
      setSaving(true);
      onSentimentChange?.(itemPath, newSentiment);

      const ok = await sendFeedback(applicationId, reviewId, itemPath, itemType, newSentiment);
      if (!ok) {
        // Revert on error
        setSentiment(previousSentiment);
        onSentimentChange?.(itemPath, previousSentiment);
      }
      setSaving(false);
    },
    [saving, reviewId, applicationId, itemPath, itemType, onSentimentChange]
  );

  return (
    <span className="inline-flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        disabled={saving}
        onClick={() => toggle("up")}
        className={`rounded p-0.5 transition-colors ${
          sentiment === "up"
            ? "text-green-600 dark:text-green-400"
            : "text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300"
        }`}
        title="Helpful"
        aria-label="Mark as helpful"
      >
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d={THUMB_UP_PATH} />
        </svg>
      </button>
      <button
        type="button"
        disabled={saving}
        onClick={() => toggle("down")}
        className={`rounded p-0.5 transition-colors ${
          sentiment === "down"
            ? "text-red-600 dark:text-red-400"
            : "text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300"
        }`}
        title="Not helpful"
        aria-label="Mark as not helpful"
      >
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d={THUMB_DOWN_PATH} />
        </svg>
      </button>
    </span>
  );
}
