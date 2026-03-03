"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface CreateDraftButtonProps {
  applicationId: string;
  reviewId: string;
  reviewNumber: number;
  className?: string;
}

export function CreateDraftButton({
  applicationId,
  reviewId,
  reviewNumber,
  className,
}: CreateDraftButtonProps) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleClick = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/applications/${applicationId}/reviews/${reviewId}/create-draft`,
        { method: "POST" }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert((data as { error?: string }).error ?? "Failed to create draft");
        return;
      }
      const data = await res.json() as { applicationId: string };
      router.push(`/applications/${data.applicationId}`);
    } catch {
      alert("Failed to create draft");
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      title={`Create a new draft pre-populated with Review #${reviewNumber}'s answers`}
      className={className}
    >
      {loading ? "Creating…" : "Create New Draft"}
    </button>
  );
}
