"use client";

import { CriteriaPreview } from "@/components/CriteriaPreview";
import { QuestionsPreview } from "@/components/QuestionsPreview";
import type { CriteriaSet, QuestionsSet } from "@/lib/schemas/criteria";

interface SetContentDisplayProps {
  type: "criteria" | "questions";
  data: CriteriaSet | QuestionsSet;
}

export function SetContentDisplay({ type, data }: SetContentDisplayProps) {
  if (type === "criteria") {
    return <CriteriaPreview criteriaSet={data as CriteriaSet} onChange={() => {}} />;
  }
  return <QuestionsPreview questionsSet={data as QuestionsSet} onChange={() => {}} />;
}
