"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  code: string;
  credits: number;
}

export function RedeemButton({ code, credits }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  async function handleClaim() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Failed to claim credits");
        return;
      }
      const data = await res.json();
      router.push(`/dashboard?gifted=${data.credits}`);
    } catch {
      setError("Network error — please try again");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleClaim}
        disabled={loading}
        className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
      >
        {loading ? "Claiming..." : `Claim ${credits} ${credits === 1 ? "credit" : "credits"}`}
      </button>
      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}
    </div>
  );
}
