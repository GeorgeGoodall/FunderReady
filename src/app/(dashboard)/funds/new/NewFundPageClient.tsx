"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { NewFundForm, type NewFundData } from "@/components/NewFundForm";

export function NewFundPageClient() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const handleSubmit = async (data: NewFundData) => {
    setError(null);
    setCreating(true);

    try {
      let organisationId = data.organisationId;

      // Create new organisation if needed
      if (data.newOrg && !organisationId) {
        const orgRes = await fetch("/api/organisations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data.newOrg),
        });

        if (!orgRes.ok) {
          const orgErr = await orgRes.json();
          throw new Error(orgErr.error || "Failed to create organisation");
        }

        const orgData = await orgRes.json();
        organisationId = orgData.id;
      }

      // Create the fund
      const fundRes = await fetch("/api/funds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.name,
          organisation_id: organisationId,
          url: data.url,
          notes: data.notes,
          shared: data.shared ?? false,
          application_format: data.application_format,
        }),
      });

      if (!fundRes.ok) {
        const fundErr = await fundRes.json();
        throw new Error(fundErr.error || "Failed to create fund");
      }

      router.push("/funds");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setCreating(false);
    }
  };

  const handleCancel = () => {
    router.push("/funds");
  };

  return (
    <div className="mx-auto max-w-3xl">
      {/* Back link */}
      <Link
        href="/funds"
        className="mb-4 inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
      >
        <svg
          className="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15.75 19.5 8.25 12l7.5-7.5"
          />
        </svg>
        Back to Funds
      </Link>

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Create Fund</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Add a new fund that you and others can use for applications.
        </p>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Loading indicator */}
      {creating && (
        <div className="mb-4 flex items-center gap-2 text-sm text-zinc-500">
          <svg
            className="h-4 w-4 animate-spin"
            viewBox="0 0 24 24"
            fill="none"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
          Creating fund...
        </div>
      )}

      <NewFundForm onSubmit={handleSubmit} onCancel={handleCancel} />
    </div>
  );
}
