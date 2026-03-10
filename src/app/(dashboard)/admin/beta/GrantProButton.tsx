"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function GrantProButton({ userId }: { userId: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  async function handleGrant() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/users/${userId}/grant-pro`, {
        method: "PATCH",
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Failed to grant pro");
        return;
      }
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleGrant}
        disabled={loading}
        className="rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {loading ? "Granting..." : "Grant Pro"}
      </button>
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  );
}
