"use client";

import { CriteriaPreview } from "@/components/CriteriaPreview";
import { QuestionsPreview } from "@/components/QuestionsPreview";
import type { CriteriaSet, QuestionsSet } from "@/lib/schemas/criteria";

interface SetContentDisplayProps {
  type: "criteria" | "questions";
  data: CriteriaSet | QuestionsSet;
}

export function SetContentDisplay({ type, data }: SetContentDisplayProps) {
  return (
    <div className="pointer-events-none select-text [&_input]:bg-transparent [&_textarea]:bg-transparent [&_button]:hidden [&_select]:appearance-none">
      {type === "criteria" ? (
        <CriteriaPreview criteriaSet={data as CriteriaSet} onChange={() => {}} />
      ) : (
        <QuestionsPreview questionsSet={data as QuestionsSet} onChange={() => {}} />
      )}
    </div>
  );
}
