"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function useDeleteApplication(
  applicationId: string,
  setError: (msg: string) => void
) {
  const router = useRouter();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    setError("");
    try {
      const res = await fetch(`/api/applications/${applicationId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Failed to delete application");
        setShowDeleteConfirm(false);
        return;
      }
      router.push("/dashboard");
    } catch {
      setError("Network error. Please try again.");
      setShowDeleteConfirm(false);
    } finally {
      setDeleting(false);
    }
  };

  return { showDeleteConfirm, setShowDeleteConfirm, deleting, handleDelete };
}
