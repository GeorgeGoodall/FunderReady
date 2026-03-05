"use client";

import { useState, useRef } from "react";
import { generateMarkdown, getExportFilename, type ExportCriterion } from "@/lib/markdown-export";
import { parseMarkdown, validateImportMetadata, MAX_IMPORT_FILE_SIZE, type ParseResult } from "@/lib/markdown-import";

interface Question {
  id: string;
  question: string;
  word_count_min?: number;
  word_count_max?: number;
  guidance?: string;
  field_type?: string;
  options?: string[];
  char_count_max?: number;
  required?: boolean;
  section?: string;
}

interface ApplicationData {
  id: string;
  title: string | null;
  questions_set_id: string;
}

interface FundData {
  id: string;
  name: string;
  organisation: { id: string; name: string } | null;
}

interface CriteriaSetData {
  criteria_json: unknown;
}

export function useMarkdownImportExport(
  application: ApplicationData,
  fund: FundData | null,
  criteriaSet: CriteriaSetData | null | undefined,
  questions: Question[],
  answerMap: Record<string, string>,
  optionsMap: Record<string, string[]>,
  disabledMap: Record<string, boolean>,
  setAnswerMap: (fn: (prev: Record<string, string>) => Record<string, string>) => void,
  setOptionsMap: (fn: (prev: Record<string, string[]>) => Record<string, string[]>) => void,
  setDisabledMap: (fn: (prev: Record<string, boolean>) => Record<string, boolean>) => void,
  dirtyRef: React.MutableRefObject<boolean>,
  saveAnswers: () => Promise<void>,
  setError: (msg: string) => void
) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importResult, setImportResult] = useState<ParseResult | null>(null);

  const handleExport = () => {
    if (!fund) return;

    const criteria: ExportCriterion[] = Array.isArray(criteriaSet?.criteria_json)
      ? (criteriaSet.criteria_json as unknown as ExportCriterion[])
      : [];

    const md = generateMarkdown({
      application: { id: application.id, title: application.title },
      fund: { id: fund.id, name: fund.name, organisation: fund.organisation },
      criteria,
      questions,
      answerMap,
      optionsMap,
      disabledMap,
      questionsSetId: application.questions_set_id,
    });

    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = getExportFilename(fund.name, application.title, application.id);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 100);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_IMPORT_FILE_SIZE) {
      setError("File is too large. Maximum size is 2 MB.");
      e.target.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const content = reader.result as string;
      const parsed = parseMarkdown(content, questions);
      const validated = validateImportMetadata(parsed, application.id, application.questions_set_id);
      setImportResult(validated);
    };
    reader.readAsText(file);

    e.target.value = "";
  };

  const applyImport = (result: ParseResult) => {
    const newAnswerMap = { ...answerMap };
    const newOptionsMap = { ...optionsMap };
    const newDisabledMap = { ...disabledMap };

    for (const a of result.answers) {
      newAnswerMap[a.question_id] = a.answer_text;
      if (a.selected_options) {
        newOptionsMap[a.question_id] = a.selected_options;
      }
      newDisabledMap[a.question_id] = a.is_disabled;
    }

    setAnswerMap(() => newAnswerMap);
    setOptionsMap(() => newOptionsMap);
    setDisabledMap(() => newDisabledMap);
    dirtyRef.current = true;
    setImportResult(null);

    setTimeout(() => saveAnswers(), 0);
  };

  return {
    fileInputRef,
    importResult,
    setImportResult,
    handleExport,
    handleFileSelect,
    applyImport,
  };
}
