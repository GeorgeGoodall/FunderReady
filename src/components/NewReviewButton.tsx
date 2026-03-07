"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface NewReviewButtonProps {
  applicationId: string;
  className?: string;
  onError?: (message: string) => void;
}

export function NewReviewButton({
  applicationId,
  className,
  onError,
}: NewReviewButtonProps) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleClick = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/applications/${applicationId}/submit-for-review`,
        { method: "POST" }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const message = (data as { error?: string }).error ?? "Failed to submit for review";
        if (onError) {
          onError(message);
        } else {
          console.error(message);
        }
        return;
      }
      router.push(`/applications/${applicationId}/review`);
    } catch {
      const message = "Failed to submit for review";
      if (onError) {
        onError(message);
      } else {
        console.error(message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      title="Submit this application for a new review"
      className={className}
    >
      {loading ? "Submitting…" : "New Review"}
    </button>
  );
}
