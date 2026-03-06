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

export type ExportFormat = "markdown" | "docx";

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 100);
}

export function useImportExport(
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

  const handleExport = async (format: ExportFormat) => {
    if (!fund) return;

    const criteria: ExportCriterion[] = Array.isArray(criteriaSet?.criteria_json)
      ? (criteriaSet.criteria_json as unknown as ExportCriterion[])
      : [];

    const params = {
      application: { id: application.id, title: application.title },
      fund: { id: fund.id, name: fund.name, organisation: fund.organisation },
      criteria,
      questions,
      answerMap,
      optionsMap,
      disabledMap,
      questionsSetId: application.questions_set_id,
    };

    if (format === "docx") {
      try {
        const { generateDocxBuffer, getDocxExportFilename } = await import("@/lib/docx-export");
        const buffer = await generateDocxBuffer(params);
        const blob = new Blob([new Uint8Array(buffer)], {
          type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        });
        const filename = getDocxExportFilename(fund.name, application.title, application.id);
        triggerDownload(blob, filename);
      } catch (err) {
        console.error("Docx export failed:", err);
        setError("Failed to export as Word document. Please try again.");
      }
      return;
    }

    // Markdown export
    const md = generateMarkdown(params);
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const filename = getExportFilename(fund.name, application.title, application.id);
    triggerDownload(blob, filename);
  };

  const openFileDialog = (format: ExportFormat) => {
    if (!fileInputRef.current) return;
    if (format === "docx") {
      fileInputRef.current.accept = ".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    } else {
      fileInputRef.current.accept = ".md,text/markdown";
    }
    fileInputRef.current.click();
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isDocx = file.name.toLowerCase().endsWith(".docx");

    const maxSize = isDocx
      ? 10 * 1024 * 1024 // MAX_DOCX_IMPORT_SIZE — avoid importing the constant to keep the dynamic import lazy
      : MAX_IMPORT_FILE_SIZE;

    if (file.size > maxSize) {
      setError(`File is too large. Maximum size is ${isDocx ? "10" : "2"} MB.`);
      e.target.value = "";
      return;
    }

    if (isDocx) {
      try {
        const arrayBuffer = await file.arrayBuffer();
        const { parseDocx } = await import("@/lib/docx-import");
        const parsed = await parseDocx(arrayBuffer, questions);
        const validated = validateImportMetadata(parsed, application.id, application.questions_set_id);
        setImportResult(validated);
      } catch (err) {
        console.error("Docx import failed:", err);
        setError("Failed to read the Word document. Please try again.");
      }
    } else {
      // Markdown import
      const reader = new FileReader();
      reader.onload = () => {
        const content = reader.result as string;
        const parsed = parseMarkdown(content, questions);
        const validated = validateImportMetadata(parsed, application.id, application.questions_set_id);
        setImportResult(validated);
      };
      reader.readAsText(file);
    }

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
    openFileDialog,
    handleFileSelect,
    applyImport,
  };
}
