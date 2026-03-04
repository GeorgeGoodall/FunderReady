"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface NewReviewButtonProps {
  applicationId: string;
  className?: string;
}

export function NewReviewButton({
  applicationId,
  className,
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
        alert((data as { error?: string }).error ?? "Failed to submit for review");
        return;
      }
      router.push(`/applications/${applicationId}/review`);
    } catch {
      alert("Failed to submit for review");
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
