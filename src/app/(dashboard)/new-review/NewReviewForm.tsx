"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileUploader } from "@/components/FileUploader";
import { CriteriaInput } from "@/components/CriteriaInput";
import { CriteriaPreview } from "@/components/CriteriaPreview";
import { UpsellPrompt } from "@/components/UpsellPrompt";
import type { CriteriaSet } from "@/lib/schemas/criteria";
import type { UsageResult } from "@/lib/usage/check-usage";

interface NewReviewFormProps {
  userId: string;
  tier: "free" | "pro";
  usage: UsageResult;
}

type Step = "upload" | "criteria" | "confirm";

const STEPS: { key: Step; label: string }[] = [
  { key: "upload", label: "Upload" },
  { key: "criteria", label: "Criteria" },
  { key: "confirm", label: "Confirm" },
];

export function NewReviewForm({ userId, tier, usage }: NewReviewFormProps) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("upload");
  const [error, setError] = useState("");

  // Upload state
  const [fileName, setFileName] = useState("");
  const [filePath, setFilePath] = useState("");

  // Criteria state
  const [criteriaSet, setCriteriaSet] = useState<CriteriaSet | null>(null);

  // Submit state
  const [submitting, setSubmitting] = useState(false);
  const [allSectionsComplete, setAllSectionsComplete] = useState(true);

  if (!usage.allowed) {
    return <UpsellPrompt tier={tier} used={usage.used} limit={usage.limit + usage.bonus} resetDate={usage.resetDate.toISOString()} />;
  }

  const handleUploadComplete = (name: string, path: string) => {
    setFileName(name);
    setFilePath(path);
    setError("");
    setStep("criteria");
  };

  const handleSubmit = async () => {
    if (!criteriaSet) return;
    setSubmitting(true);
    setError("");

    try {
      const res = await fetch("/api/submit-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bidFileName: fileName,
          bidFilePath: filePath,
          criteriaJson: criteriaSet,
          completeDraft: allSectionsComplete,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Failed to submit review");
        return;
      }

      router.push(`/reviews/${data.reviewId}`);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const currentStepIndex = STEPS.findIndex((s) => s.key === step);

  return (
    <div className="space-y-6">
      {/* Step indicator */}
      <nav className="flex items-center gap-2">
        {STEPS.map((s, i) => (
          <div key={s.key} className="flex items-center gap-2">
            {i > 0 && <div className="h-px w-8 bg-zinc-300 dark:bg-zinc-700" />}
            <div className="flex items-center gap-2">
              <span
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                  i < currentStepIndex
                    ? "bg-blue-600 text-white"
                    : i === currentStepIndex
                      ? "bg-blue-100 text-blue-700 ring-2 ring-blue-600 dark:bg-blue-900/30 dark:text-blue-400"
                      : "bg-zinc-100 text-zinc-400 dark:bg-zinc-800"
                }`}
              >
                {i < currentStepIndex ? (
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                  </svg>
                ) : (
                  i + 1
                )}
              </span>
              <span
                className={`text-sm font-medium ${
                  i <= currentStepIndex
                    ? "text-zinc-900 dark:text-zinc-100"
                    : "text-zinc-400 dark:text-zinc-500"
                }`}
              >
                {s.label}
              </span>
            </div>
          </div>
        ))}
      </nav>

      {/* Error display */}
      {error && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Step content */}
      {step === "upload" && (
        <FileUploader
          userId={userId}
          onUploadComplete={handleUploadComplete}
          onError={setError}
        />
      )}

      {step === "criteria" && (
        <div className="space-y-6">
          {!criteriaSet ? (
            <CriteriaInput onParsed={setCriteriaSet} />
          ) : (
            <>
              <CriteriaPreview criteriaSet={criteriaSet} onChange={setCriteriaSet} />
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setCriteriaSet(null)}
                  className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  Re-parse criteria
                </button>
                <button
                  type="button"
                  onClick={() => setStep("confirm")}
                  disabled={criteriaSet.criteria.some((c) => !c.criterion.trim())}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Continue
                </button>
              </div>
            </>
          )}
          <button
            type="button"
            onClick={() => setStep("upload")}
            className="text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
          >
            &larr; Back to upload
          </button>
        </div>
      )}

      {step === "confirm" && (
        <div className="space-y-6">
          <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
            <h3 className="font-semibold">Review Summary</h3>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-zinc-500">Document</dt>
                <dd className="font-medium">{fileName}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-zinc-500">Criteria</dt>
                <dd className="font-medium">{criteriaSet?.criteria.length} criteria</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-zinc-500">Reviews remaining</dt>
                <dd className="font-medium">{usage.remaining - 1} after this review</dd>
              </div>
            </dl>
          </div>

          <label className="flex items-start gap-3 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <input
              type="checkbox"
              checked={allSectionsComplete}
              onChange={(e) => setAllSectionsComplete(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-zinc-300 text-blue-600 focus:ring-blue-500"
            />
            <div>
              <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                I have completed all sections of this bid
              </span>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                Uncheck this if your bid is still a work in progress. Incomplete bids will still be reviewed, but empty sections will be flagged rather than causing rejection.
              </p>
            </div>
          </label>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setStep("criteria")}
              className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              &larr; Back
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="rounded-lg bg-blue-600 px-6 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? "Submitting..." : "Start Review"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
