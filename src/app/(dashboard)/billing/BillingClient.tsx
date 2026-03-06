"use client";

import { useState } from "react";

export function BillingClient({ tier }: { tier: "free" | "basic" | "pro" }) {
  const [loading, setLoading] = useState<string | null>(null);

  async function handleSubscribe(selectedTier: "basic" | "pro") {
    setLoading(selectedTier);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier: selectedTier }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } finally {
      setLoading(null);
    }
  }

  async function handleTopup(pack: "standard" | "pro", quantity: number = 1) {
    setLoading(pack);
    try {
      const res = await fetch("/api/stripe/topup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pack, quantity }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } finally {
      setLoading(null);
    }
  }

  if (tier === "free") {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Choose a Plan</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-zinc-200 p-6 dark:border-zinc-800">
            <h3 className="text-lg font-semibold">Basic</h3>
            <p className="mt-1 text-2xl font-bold">£19<span className="text-sm font-normal text-zinc-500">/month</span></p>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">30 credits/month</p>
            <button
              onClick={() => handleSubscribe("basic")}
              disabled={loading !== null}
              className="mt-4 w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {loading === "basic" ? "Redirecting..." : "Subscribe to Basic"}
            </button>
          </div>
          <div className="rounded-lg border-2 border-blue-600 p-6">
            <h3 className="text-lg font-semibold">Pro</h3>
            <p className="mt-1 text-2xl font-bold">£49<span className="text-sm font-normal text-zinc-500">/month</span></p>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">100 credits/month + Pro top-ups</p>
            <button
              onClick={() => handleSubscribe("pro")}
              disabled={loading !== null}
              className="mt-4 w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {loading === "pro" ? "Redirecting..." : "Subscribe to Pro"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Subscribed user — show top-up options
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Buy Credits</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-zinc-200 p-6 dark:border-zinc-800">
          <h3 className="font-semibold">Standard Pack</h3>
          <p className="mt-1 text-lg font-bold">£5</p>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">10 credits</p>
          <button
            onClick={() => handleTopup("standard")}
            disabled={loading !== null}
            className="mt-3 w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {loading === "standard" ? "Redirecting..." : "Buy"}
          </button>
        </div>
        {tier === "pro" && (
          <div className="rounded-lg border border-zinc-200 p-6 dark:border-zinc-800">
            <h3 className="font-semibold">Pro Pack</h3>
            <p className="mt-1 text-lg font-bold">£10</p>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">30 credits</p>
            <button
              onClick={() => handleTopup("pro")}
              disabled={loading !== null}
              className="mt-3 w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {loading === "pro" ? "Redirecting..." : "Buy"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
