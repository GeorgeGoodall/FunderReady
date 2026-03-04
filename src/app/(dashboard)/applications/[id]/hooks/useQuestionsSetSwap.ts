"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface AvailableQuestionsSet {
  id: string;
  label: string | null;
  created_at: string;
  questionCount: number;
}

export function useQuestionsSetSwap(
  applicationId: string,
  currentQuestionsSetId: string,
  availableQuestionsSets: AvailableQuestionsSet[],
  questionsSetCreatedAt: string | null,
  saveAnswers: () => Promise<void>,
  setError: (msg: string) => void
) {
  const router = useRouter();
  const [showSwapConfirm, setShowSwapConfirm] = useState(false);
  const [selectedSwapSetId, setSelectedSwapSetId] = useState("");
  const [swapping, setSwapping] = useState(false);
  const [swapResult, setSwapResult] = useState<{ added: number; removed: number; kept: number } | null>(null);

  const otherSets = availableQuestionsSets.filter((s) => s.id !== currentQuestionsSetId);
  const newestApprovedSet = otherSets[0] ?? null;
  const hasNewerApprovedSet =
    newestApprovedSet !== null &&
    (newestApprovedSet.created_at ?? "") > (questionsSetCreatedAt ?? "");

  const handleSwapQuestionsSet = async () => {
    if (!selectedSwapSetId) return;
    setSwapping(true);
    setError("");
    try {
      await saveAnswers();

      const res = await fetch(`/api/applications/${applicationId}/questions-set`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionsSetId: selectedSwapSetId }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to swap questions set");
        return;
      }

      setSwapResult(data);
      setShowSwapConfirm(false);
      setSelectedSwapSetId("");
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSwapping(false);
    }
  };

  return {
    showSwapConfirm,
    setShowSwapConfirm,
    selectedSwapSetId,
    setSelectedSwapSetId,
    swapping,
    swapResult,
    setSwapResult,
    otherSets,
    newestApprovedSet,
    hasNewerApprovedSet,
    handleSwapQuestionsSet,
  };
}
