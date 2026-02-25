"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FundDetection } from "@/components/FundDetection";
import { CriteriaInput } from "@/components/CriteriaInput";
import { CriteriaPreview } from "@/components/CriteriaPreview";
import { QuestionsInput } from "@/components/QuestionsInput";
import { QuestionsPreview } from "@/components/QuestionsPreview";
import { UpsellPrompt } from "@/components/UpsellPrompt";
import type { CriteriaSet, QuestionsSet } from "@/lib/schemas/criteria";
import type { UsageResult } from "@/lib/usage/check-usage";

interface NewApplicationFormProps {
  userId: string;
  tier: "free" | "pro";
  usage: UsageResult;
}

interface FundInfo {
  id: string;
  name: string;
  funder_organisation: string | null;
  url: string | null;
  notes: string | null;
  created_at: string;
}

type Step = "fund" | "criteria" | "questions" | "confirm";

const STEPS: { key: Step; label: string }[] = [
  { key: "fund", label: "Fund" },
  { key: "criteria", label: "Criteria" },
  { key: "questions", label: "Questions" },
  { key: "confirm", label: "Create" },
];

export function NewApplicationForm({ userId: _userId, tier, usage }: NewApplicationFormProps) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("fund");
  const [error, setError] = useState("");

  // Fund state
  const [selectedFund, setSelectedFund] = useState<FundInfo | null>(null);
  const [newFundName, setNewFundName] = useState("");
  const [creatingFund, setCreatingFund] = useState(false);

  // Criteria state
  const [criteriaSet, setCriteriaSet] = useState<CriteriaSet | null>(null);
  const [criteriaSetId, setCriteriaSetId] = useState<string | null>(null);
  const [criteriaPreLoaded, setCriteriaPreLoaded] = useState(false);
  const [criteriaEdited, setCriteriaEdited] = useState(false);

  // Questions state
  const [questionsSet, setQuestionsSet] = useState<QuestionsSet | null>(null);
  const [questionsSetId, setQuestionsSetId] = useState<string | null>(null);
  const [questionsPreLoaded, setQuestionsPreLoaded] = useState(false);
  const [questionsEdited, setQuestionsEdited] = useState(false);

  // Submit state
  const [submitting, setSubmitting] = useState(false);
  const [title, setTitle] = useState("");

  if (!usage.allowed) {
    return <UpsellPrompt tier={tier} used={usage.used} limit={usage.limit + usage.bonus} resetDate={usage.resetDate.toISOString()} />;
  }

  const handleFundSelected = async (fund: FundInfo) => {
    setSelectedFund(fund);
    setError("");

    try {
      const res = await fetch(`/api/funds/${fund.id}`);
      if (res.ok) {
        const data = await res.json();

        const csData = data.userDraftCriteriaSet ?? data.criteriaSet;
        if (csData) {
          const criteriaArray = csData.criteria_json;
          setCriteriaSet({
            name: csData.name,
            description: csData.description ?? undefined,
            criteria: Array.isArray(criteriaArray) ? criteriaArray : [],
          });
          setCriteriaSetId(csData.id);
          setCriteriaPreLoaded(true);
          setCriteriaEdited(false);
        }

        const qsData = data.userDraftQuestionsSet ?? data.questionsSet;
        if (qsData) {
          const questionsArray = qsData.questions_json;
          setQuestionsSet({
            questions: Array.isArray(questionsArray) ? questionsArray : [],
            overall_word_limit: qsData.overall_word_limit ?? undefined,
          });
          setQuestionsSetId(qsData.id);
          setQuestionsPreLoaded(true);
          setQuestionsEdited(false);
        }
      }
    } catch {
      // Non-fatal
    }

    setStep("criteria");
  };

  const handleNewFund = async (suggestedName: string) => {
    if (suggestedName) setNewFundName(suggestedName);
    setCreatingFund(true);
  };

  const handleCreateFund = async () => {
    if (!newFundName.trim()) {
      setError("Fund name is required");
      return;
    }
    setError("");
    try {
      const res = await fetch("/api/funds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newFundName.trim() }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Failed to create fund");
        return;
      }
      const data = await res.json();
      setSelectedFund(data.fund);
      setCreatingFund(false);
      setStep("criteria");
    } catch {
      setError("Network error. Please try again.");
    }
  };

  const handleCriteriaChange = (updated: CriteriaSet) => {
    setCriteriaSet(updated);
    if (criteriaPreLoaded) setCriteriaEdited(true);
  };

  const handleQuestionsChange = (updated: QuestionsSet) => {
    setQuestionsSet(updated);
    if (questionsPreLoaded) setQuestionsEdited(true);
  };

  const saveCriteriaSetsIfNeeded = async (): Promise<string | null> => {
    if (!selectedFund || !criteriaSet) return null;
    if (criteriaPreLoaded && !criteriaEdited && criteriaSetId) return criteriaSetId;

    const res = await fetch(`/api/funds/${selectedFund.id}/criteria-sets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(criteriaSet),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error ?? "Failed to save criteria");
    }
    const data = await res.json();
    return data.criteriaSet.id;
  };

  const saveQuestionsSetsIfNeeded = async (): Promise<string | null> => {
    if (!selectedFund || !questionsSet) return null;
    if (questionsPreLoaded && !questionsEdited && questionsSetId) return questionsSetId;

    const res = await fetch(`/api/funds/${selectedFund.id}/questions-sets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(questionsSet),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error ?? "Failed to save questions");
    }
    const data = await res.json();
    return data.questionsSet.id;
  };

  const handleCreateApplication = async () => {
    if (!criteriaSet || !selectedFund || !questionsSet) return;
    setSubmitting(true);
    setError("");

    try {
      const savedCriteriaSetId = await saveCriteriaSetsIfNeeded();
      const savedQuestionsSetId = await saveQuestionsSetsIfNeeded();

      if (!savedCriteriaSetId) {
        setError("Failed to save criteria set");
        return;
      }
      if (!savedQuestionsSetId) {
        setError("Questions are required for form-based applications");
        return;
      }

      const res = await fetch("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fundId: selectedFund.id,
          criteriaSetId: savedCriteriaSetId,
          questionsSetId: savedQuestionsSetId,
          ...(title.trim() && { title: title.trim() }),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to create application");
        return;
      }

      router.push(`/applications/${data.applicationId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error. Please try again.");
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

      {/* Step: Fund */}
      {step === "fund" && (
        <div className="space-y-4">
          {!creatingFund ? (
            <FundDetection
              fileName=""
              onFundSelected={handleFundSelected}
              onNewFund={handleNewFund}
              onSkip={() => setCreatingFund(true)}
            />
          ) : (
            <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
              <h3 className="font-semibold">Create New Fund</h3>
              <p className="mt-1 text-sm text-zinc-500">
                Enter the name of the funding programme you are applying to.
              </p>
              <input
                type="text"
                value={newFundName}
                onChange={(e) => setNewFundName(e.target.value)}
                placeholder="e.g. Community Ownership Fund"
                className="mt-3 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800"
              />
              <div className="mt-3 flex gap-3">
                <button
                  onClick={handleCreateFund}
                  disabled={!newFundName.trim()}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Create Fund
                </button>
                <button
                  onClick={() => setCreatingFund(false)}
                  className="text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Step: Criteria */}
      {step === "criteria" && (
        <div className="space-y-6">
          {criteriaPreLoaded && criteriaSet && !criteriaEdited && (
            <div className="rounded-lg border border-green-100 bg-green-50 p-3 dark:border-green-900/30 dark:bg-green-900/10">
              <p className="text-sm text-green-800 dark:text-green-300">
                Criteria pre-loaded from <strong>{selectedFund?.name}</strong>. You can edit below or continue.
              </p>
            </div>
          )}

          {!criteriaSet ? (
            <CriteriaInput onParsed={setCriteriaSet} />
          ) : (
            <>
              <CriteriaPreview criteriaSet={criteriaSet} onChange={handleCriteriaChange} />
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setCriteriaSet(null);
                    setCriteriaPreLoaded(false);
                    setCriteriaEdited(false);
                    setCriteriaSetId(null);
                  }}
                  className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  Re-parse criteria
                </button>
                <button
                  type="button"
                  onClick={() => setStep("questions")}
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
            onClick={() => setStep("fund")}
            className="text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
          >
            &larr; Back to fund selection
          </button>
        </div>
      )}

      {/* Step: Questions */}
      {step === "questions" && (
        <div className="space-y-6">
          <div className="rounded-lg border border-blue-100 bg-blue-50 p-4 dark:border-blue-900/30 dark:bg-blue-900/10">
            <p className="text-sm text-blue-800 dark:text-blue-300">
              <strong>Required:</strong> Paste the funder&apos;s application questions below.
              These define the form you&apos;ll fill out.
            </p>
          </div>

          {questionsPreLoaded && questionsSet && !questionsEdited && (
            <div className="rounded-lg border border-green-100 bg-green-50 p-3 dark:border-green-900/30 dark:bg-green-900/10">
              <p className="text-sm text-green-800 dark:text-green-300">
                Questions pre-loaded from <strong>{selectedFund?.name}</strong>. You can edit below or continue.
              </p>
            </div>
          )}

          {!questionsSet ? (
            <>
              <QuestionsInput onParsed={setQuestionsSet} />
              <button
                type="button"
                onClick={() => setStep("criteria")}
                className="text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
              >
                &larr; Back to criteria
              </button>
            </>
          ) : (
            <>
              <QuestionsPreview questionsSet={questionsSet} onChange={handleQuestionsChange} />
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setQuestionsSet(null);
                    setQuestionsPreLoaded(false);
                    setQuestionsEdited(false);
                    setQuestionsSetId(null);
                  }}
                  className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  Re-parse questions
                </button>
                <button
                  type="button"
                  onClick={() => setStep("confirm")}
                  disabled={questionsSet.questions.some((q) => !q.question.trim())}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Continue
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Step: Confirm */}
      {step === "confirm" && (
        <div className="space-y-6">
          <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
            <h3 className="font-semibold">Application Summary</h3>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-zinc-500">Fund</dt>
                <dd className="font-medium">{selectedFund?.name ?? "—"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-zinc-500">Criteria</dt>
                <dd className="font-medium">{criteriaSet?.criteria.length} criteria</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-zinc-500">Questions</dt>
                <dd className="font-medium">
                  {questionsSet
                    ? `${questionsSet.questions.length} questions${questionsSet.overall_word_limit ? ` (${questionsSet.overall_word_limit} word limit)` : ""}`
                    : "None"}
                </dd>
              </div>
            </dl>

            <div className="mt-4">
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Application title (optional)
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Community Centre Renovation 2026"
                className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800"
              />
            </div>
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setStep("questions")}
              className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              &larr; Back
            </button>
            <button
              type="button"
              onClick={handleCreateApplication}
              disabled={submitting || !questionsSet}
              className="rounded-lg bg-blue-600 px-6 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? "Creating..." : "Create Application"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
