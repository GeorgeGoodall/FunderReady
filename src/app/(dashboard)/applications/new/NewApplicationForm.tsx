"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FundDetection } from "@/components/FundDetection";
import { NewFundForm, type NewFundData } from "@/components/NewFundForm";
import { CriteriaInput } from "@/components/CriteriaInput";
import { CriteriaPreview } from "@/components/CriteriaPreview";
import { QuestionsInput } from "@/components/QuestionsInput";
import { QuestionsPreview, validateQuestionsSet } from "@/components/QuestionsPreview";
import { FundDateBanner } from "@/components/FundDateBanner";
import { UpsellPrompt } from "@/components/UpsellPrompt";
import type { CriteriaSet, QuestionsSet } from "@/lib/schemas/criteria";
import type { UsageResult } from "@/lib/usage/check-usage";

interface NewApplicationFormProps {
  tier: "free" | "pro";
  usage: UsageResult;
  isAdmin?: boolean;
  fundId?: string;
}

interface FundInfo {
  id: string;
  name: string;
  organisation: { id: string; name: string } | null;
  url: string | null;
  notes: string | null;
  opens_at: string | null;
  closes_at: string | null;
  created_at: string;
}

type Step = "fund" | "criteria" | "questions" | "confirm";

const STEPS: { key: Step; label: string }[] = [
  { key: "fund", label: "Fund" },
  { key: "criteria", label: "Criteria" },
  { key: "questions", label: "Questions" },
  { key: "confirm", label: "Create" },
];

export function NewApplicationForm({ tier, usage, isAdmin, fundId }: NewApplicationFormProps) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("fund");
  const [error, setError] = useState("");

  // Fund state
  const [selectedFund, setSelectedFund] = useState<FundInfo | null>(null);
  const [pendingNewFundData, setPendingNewFundData] = useState<NewFundData | null>(null);
  const [creatingFund, setCreatingFund] = useState(false);

  // AI-detected dates (from criteria parse)
  const [detectedOpensAt, setDetectedOpensAt] = useState<string | null>(null);
  const [detectedClosesAt, setDetectedClosesAt] = useState<string | null>(null);

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

  // fundId query param auto-select
  const [fundIdLoading, setFundIdLoading] = useState(!!fundId);

  // Shared helper: apply fund data (criteria/questions sets) from API response
  function applyFundData(data: Record<string, unknown>) {
    const csData = data.criteriaSet as { id: string; name: string; description?: string; criteria_json: unknown } | undefined;
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

    const qsData = data.questionsSet as { id: string; questions_json: unknown; overall_word_limit?: number } | undefined;
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

  // Auto-select fund from query param
  useEffect(() => {
    if (!fundId) return;
    let cancelled = false;

    async function loadFund() {
      try {
        const res = await fetch(`/api/funds/${fundId}`);
        if (!res.ok || cancelled) return;
        const data = await res.json();
        const fund: FundInfo = {
          id: data.fund.id,
          name: data.fund.name,
          organisation: data.fund.organisations
            ? { id: data.fund.organisations.id, name: data.fund.organisations.name }
            : null,
          url: data.fund.url,
          notes: data.fund.notes,
          opens_at: data.fund.opens_at ?? null,
          closes_at: data.fund.closes_at ?? null,
          created_at: data.fund.created_at,
        };
        if (cancelled) return;

        setSelectedFund(fund);
        setError("");

        try {
          applyFundData(data);
        } catch {
          // Non-fatal
        }

        setStep("criteria");
      } catch {
        // Fall back to normal flow
      } finally {
        if (!cancelled) setFundIdLoading(false);
      }
    }

    loadFund();
    return () => { cancelled = true; };
  }, [fundId]);

  if (!usage.allowed) {
    return <UpsellPrompt tier={tier} used={usage.used} limit={usage.limit + usage.bonus} resetDate={usage.resetDate.toISOString()} />;
  }

  if (fundIdLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-zinc-500">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-blue-600" />
        Loading fund...
      </div>
    );
  }

  const handleFundSelected = async (fund: FundInfo) => {
    setSelectedFund(fund);
    setError("");

    try {
      const res = await fetch(`/api/funds/${fund.id}`);
      if (res.ok) {
        const data = await res.json();
        applyFundData(data);
      }
    } catch {
      // Non-fatal
    }

    setStep("criteria");
  };

  const handleNewFundData = (data: NewFundData) => {
    setPendingNewFundData(data);
    setCreatingFund(false);
    setStep("criteria");
  };

  const patchFundDates = async (fundId: string, opensAt: string | null, closesAt: string | null) => {
    try {
      await fetch(`/api/funds/${fundId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opens_at: opensAt, closes_at: closesAt }),
      });
    } catch {
      // Non-fatal — dates are supplementary
    }
  };

  const handleCriteriaParsed = (criteriaSet: CriteriaSet, dates?: { opens_at?: string; closes_at?: string }) => {
    setCriteriaSet(criteriaSet);
    if (dates?.opens_at) setDetectedOpensAt(dates.opens_at);
    if (dates?.closes_at) setDetectedClosesAt(dates.closes_at);

    // Patch dates onto existing fund if it has none
    if (selectedFund && !selectedFund.opens_at && !selectedFund.closes_at) {
      if (dates?.opens_at || dates?.closes_at) {
        patchFundDates(selectedFund.id, dates.opens_at ?? null, dates.closes_at ?? null);
      }
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

  const saveCriteriaSetsIfNeeded = async (fundId: string): Promise<string | null> => {
    if (!criteriaSet) return null;
    if (criteriaPreLoaded && !criteriaEdited && criteriaSetId) return criteriaSetId;

    const res = await fetch(`/api/funds/${fundId}/criteria-sets`, {
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

  const saveQuestionsSetsIfNeeded = async (fundId: string): Promise<string | null> => {
    if (!questionsSet) return null;
    if (questionsPreLoaded && !questionsEdited && questionsSetId) return questionsSetId;

    const res = await fetch(`/api/funds/${fundId}/questions-sets`, {
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
    if (!criteriaSet || !questionsSet) return;
    setSubmitting(true);
    setError("");

    try {
      // Create the fund now if it's new (deferred from step 1)
      let fund = selectedFund;
      if (!fund) {
        if (!pendingNewFundData) {
          setError("Fund information is required");
          return;
        }

        // Create new org first if needed
        let organisationId = pendingNewFundData.organisationId;
        if (!organisationId && pendingNewFundData.newOrg) {
          const orgRes = await fetch("/api/organisations", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(pendingNewFundData.newOrg),
          });
          if (!orgRes.ok) {
            const orgData = await orgRes.json();
            setError(orgData.error ?? "Failed to create organisation");
            return;
          }
          const orgData = await orgRes.json();
          organisationId = orgData.organisation.id;
        }

        const fundRes = await fetch("/api/funds", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: pendingNewFundData.name,
            organisation_id: organisationId ?? null,
            url: pendingNewFundData.url,
            notes: pendingNewFundData.notes,
            opens_at: detectedOpensAt ?? null,
            closes_at: detectedClosesAt ?? null,
          }),
        });
        if (!fundRes.ok) {
          const data = await fundRes.json();
          setError(data.error ?? "Failed to create fund");
          return;
        }
        const fundData = await fundRes.json();
        fund = fundData.fund;
        setSelectedFund(fundData.fund);
      }

      if (!fund) {
        setError("Fund data unavailable");
        return;
      }

      const savedCriteriaSetId = await saveCriteriaSetsIfNeeded(fund.id);
      const savedQuestionsSetId = await saveQuestionsSetsIfNeeded(fund.id);

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
          fundId: fund.id,
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

  const goToStep = (targetStep: Step) => {
    if (targetStep === "fund") {
      setCreatingFund(false);
      setPendingNewFundData(null);
    }
    setStep(targetStep);
    setError("");
  };

  return (
    <div className="space-y-6">
      {/* Step indicator */}
      <nav className="flex items-center gap-2">
        {STEPS.map((s, i) => (
          <div key={s.key} className="flex items-center gap-2">
            {i > 0 && <div className="h-px w-8 bg-zinc-300 dark:bg-zinc-700" />}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => i < currentStepIndex && goToStep(s.key)}
                disabled={i >= currentStepIndex}
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                  i < currentStepIndex
                    ? "bg-blue-600 text-white hover:bg-blue-700 cursor-pointer"
                    : i === currentStepIndex
                      ? "bg-blue-100 text-blue-700 ring-2 ring-blue-600 dark:bg-blue-900/30 dark:text-blue-400 cursor-default"
                      : "bg-zinc-100 text-zinc-400 dark:bg-zinc-800 cursor-default"
                }`}
              >
                {i < currentStepIndex ? (
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                  </svg>
                ) : (
                  i + 1
                )}
              </button>
              <button
                type="button"
                onClick={() => i < currentStepIndex && goToStep(s.key)}
                disabled={i >= currentStepIndex}
                className={`text-sm font-medium transition-colors ${
                  i < currentStepIndex
                    ? "text-zinc-900 dark:text-zinc-100 hover:text-blue-600 dark:hover:text-blue-400 cursor-pointer"
                    : i === currentStepIndex
                      ? "text-zinc-900 dark:text-zinc-100 cursor-default"
                      : "text-zinc-400 dark:text-zinc-500 cursor-default"
                }`}
              >
                {s.label}
              </button>
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
              onNewFundData={handleNewFundData}
              onSkip={() => setCreatingFund(true)}
            />
          ) : (
            <NewFundForm
              onSubmit={handleNewFundData}
              onCancel={() => setCreatingFund(false)}
            />
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
            <CriteriaInput onParsed={handleCriteriaParsed} isAdmin={isAdmin} />
          ) : (
            <>
              <CriteriaPreview criteriaSet={criteriaSet} onChange={handleCriteriaChange} />
              <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
                <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-3">
                  Submission dates (optional)
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400">
                      Opens
                    </label>
                    <input
                      type="date"
                      value={detectedOpensAt ? detectedOpensAt.slice(0, 10) : ""}
                      onChange={(e) => setDetectedOpensAt(e.target.value ? new Date(e.target.value).toISOString() : null)}
                      className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400">
                      Deadline
                    </label>
                    <input
                      type="date"
                      value={detectedClosesAt ? detectedClosesAt.slice(0, 10) : ""}
                      onChange={(e) => setDetectedClosesAt(e.target.value ? new Date(e.target.value).toISOString() : null)}
                      className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800"
                    />
                  </div>
                </div>
              </div>
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
                  {criteriaPreLoaded ? "Start over" : "Re-enter / Parse with AI"}
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
            onClick={() => goToStep("fund")}
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
                onClick={() => goToStep("criteria")}
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
                  onClick={() => goToStep("criteria")}
                  className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  &larr; Back to criteria
                </button>
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
                  {questionsPreLoaded ? "Start over" : "Re-enter / Parse with AI"}
                </button>
                <button
                  type="button"
                  onClick={() => setStep("confirm")}
                  disabled={questionsSet.questions.some((q) => !q.question.trim()) || validateQuestionsSet(questionsSet).length > 0}
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
          <FundDateBanner
            opensAt={selectedFund?.opens_at ?? detectedOpensAt}
            closesAt={selectedFund?.closes_at ?? detectedClosesAt}
          />
          <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
            <h3 className="font-semibold">Application Summary</h3>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-zinc-500">Fund</dt>
                <dd className="font-medium">{selectedFund?.name ?? pendingNewFundData?.name ?? "—"}</dd>
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
              {(selectedFund?.closes_at || detectedClosesAt) && (
                <div className="flex justify-between">
                  <dt className="text-zinc-500">Deadline</dt>
                  <dd className="font-medium">
                    {new Date(selectedFund?.closes_at ?? detectedClosesAt!).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
                  </dd>
                </div>
              )}
              {(selectedFund?.opens_at || detectedOpensAt) && (
                <div className="flex justify-between">
                  <dt className="text-zinc-500">Opens</dt>
                  <dd className="font-medium">
                    {new Date(selectedFund?.opens_at ?? detectedOpensAt!).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
                  </dd>
                </div>
              )}
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
