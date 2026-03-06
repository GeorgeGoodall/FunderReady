/**
 * Markdown import for FunderReady applications.
 * Pure TypeScript — regex-based parser for our controlled format.
 */

export interface ParsedAnswer {
  question_id: string;
  answer_text: string;
  selected_options?: string[];
  is_disabled: boolean;
}

export interface ImportMetadata {
  application_id: string;
  questions_set_id: string;
  fund_id: string;
}

export interface ImportError {
  type: "error" | "warning";
  message: string;
  question_id?: string;
}

export interface ParseResult {
  ok: boolean;
  metadata: ImportMetadata | null;
  answers: ParsedAnswer[];
  errors: ImportError[];
  warnings: ImportError[];
}

import type { ExportQuestion } from "./markdown-export";

/** Subset of ExportQuestion needed for import parsing. */
export type ImportQuestion = Pick<ExportQuestion, "id" | "question" | "field_type" | "options" | "word_count_max">;

// ---------------------------------------------------------------------------
// Frontmatter parsing
// ---------------------------------------------------------------------------

function parseFrontmatter(content: string): { metadata: ImportMetadata | null; errors: ImportError[] } {
  const errors: ImportError[] = [];
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) {
    errors.push({ type: "error", message: "Missing or incomplete YAML frontmatter." });
    return { metadata: null, errors };
  }

  const yamlBlock = match[1];
  const fields: Record<string, string> = {};
  for (const line of yamlBlock.split("\n")) {
    const kv = line.match(/^(\w+):\s*(.+)$/);
    if (kv) {
      fields[kv[1]] = kv[2].trim();
    }
  }

  const requiredKeys = ["application_id", "questions_set_id", "fund_id"] as const;
  for (const key of requiredKeys) {
    if (!fields[key]) {
      errors.push({ type: "error", message: `Missing frontmatter field: ${key}` });
    }
  }

  if (errors.length > 0) {
    return { metadata: null, errors };
  }

  return {
    metadata: {
      application_id: fields.application_id,
      questions_set_id: fields.questions_set_id,
      fund_id: fields.fund_id,
    },
    errors: [],
  };
}

// ---------------------------------------------------------------------------
// Answer block parsing
// ---------------------------------------------------------------------------

function parseTextBlock(raw: string): string {
  // Extract content inside ``` fences (greedy to skip escaped \``` inside)
  const fenceMatch = raw.match(/```\n([\s\S]*)\n```/);
  if (fenceMatch) {
    return fenceMatch[1].replace(/\\```/g, "```");
  }
  // Handle empty fences: ```\n```
  if (raw.match(/```\n```/)) {
    return "";
  }
  // Fallback: return trimmed raw text
  return raw.trim();
}

function parseRadioBlock(raw: string, allowedOptions: string[]): { answer_text: string; selected_options: string[]; invalid_options: string[] } {
  const selected: string[] = [];
  const invalid: string[] = [];
  const allowedSet = new Set(allowedOptions);
  for (const line of raw.split("\n")) {
    const match = line.match(/^\(x\)\s+(.+)$/);
    if (match) {
      const value = match[1].trim();
      selected.push(value);
      if (allowedSet.size > 0 && !allowedSet.has(value)) {
        invalid.push(value);
      }
    }
  }
  return {
    answer_text: selected[0] ?? "",
    selected_options: selected,
    invalid_options: invalid,
  };
}

function parseCheckboxBlock(raw: string, allowedOptions: string[]): { answer_text: string; selected_options: string[]; invalid_options: string[] } {
  const selected: string[] = [];
  const invalid: string[] = [];
  const allowedSet = new Set(allowedOptions);
  for (const line of raw.split("\n")) {
    const match = line.match(/^\[x\]\s+(.+)$/);
    if (match) {
      const value = match[1].trim();
      selected.push(value);
      if (allowedSet.size > 0 && !allowedSet.has(value)) {
        invalid.push(value);
      }
    }
  }
  return {
    answer_text: selected.join(", "),
    selected_options: selected,
    invalid_options: invalid,
  };
}

// ---------------------------------------------------------------------------
// Disabled detection
// ---------------------------------------------------------------------------

function detectDisabledQuestions(content: string): Set<string> {
  const disabled = new Set<string>();
  // Look for [DISABLED] in the heading line after question_id comment
  const pattern = /<!-- question_id: (\S+) -->\s*\n####[^\n]*\[DISABLED\]/g;
  let match;
  while ((match = pattern.exec(content)) !== null) {
    disabled.add(match[1]);
  }
  return disabled;
}

// ---------------------------------------------------------------------------
// Main parser
// ---------------------------------------------------------------------------

export function parseMarkdown(rawContent: string, questions: ImportQuestion[]): ParseResult {
  // Normalize Windows line endings
  const content = rawContent.replace(/\r\n/g, "\n");

  const errors: ImportError[] = [];
  const warnings: ImportError[] = [];
  const answers: ParsedAnswer[] = [];

  // 1. Parse frontmatter
  const fm = parseFrontmatter(content);
  if (fm.errors.length > 0) {
    return { ok: false, metadata: null, answers: [], errors: fm.errors, warnings: [] };
  }
  const metadata = fm.metadata!;

  // 2. Build question lookup
  const questionMap = new Map<string, ImportQuestion>();
  for (const q of questions) {
    questionMap.set(q.id, q);
  }

  // 3. Detect disabled questions
  const disabledSet = detectDisabledQuestions(content);

  // 4. Extract answer blocks
  const answerPattern = /<!-- answer_start: (\S+) -->([\s\S]*?)<!-- answer_end: \1 -->/g;
  const foundIds = new Set<string>();
  let blockMatch;

  while ((blockMatch = answerPattern.exec(content)) !== null) {
    const qId = blockMatch[1];
    const rawBlock = blockMatch[2];
    foundIds.add(qId);

    const question = questionMap.get(qId);
    if (!question) {
      errors.push({ type: "error", message: `Unknown question ID: ${qId}`, question_id: qId });
      continue;
    }

    const ft = question.field_type ?? "text_long";
    const isDisabled = disabledSet.has(qId);

    let answerText = "";
    let selectedOptions: string[] | undefined;

    if (ft === "radio" || ft === "dropdown") {
      const parsed = parseRadioBlock(rawBlock, question.options ?? []);
      answerText = parsed.answer_text;
      selectedOptions = parsed.selected_options;

      // Validate single-select
      if (parsed.selected_options.length > 1) {
        errors.push({
          type: "error",
          message: `${ft === "radio" ? "Radio" : "Dropdown"} question "${question.question}" has multiple selections — only one is allowed.`,
          question_id: qId,
        });
        continue;
      }

      // Warn on unrecognised option values
      for (const inv of parsed.invalid_options) {
        warnings.push({
          type: "warning",
          message: `Question "${question.question}" has unrecognised option: "${inv}"`,
          question_id: qId,
        });
      }
    } else if (ft === "checkbox") {
      const parsed = parseCheckboxBlock(rawBlock, question.options ?? []);
      answerText = parsed.answer_text;
      selectedOptions = parsed.selected_options;

      for (const inv of parsed.invalid_options) {
        warnings.push({
          type: "warning",
          message: `Question "${question.question}" has unrecognised option: "${inv}"`,
          question_id: qId,
        });
      }
    } else {
      answerText = parseTextBlock(rawBlock);
    }

    // Warnings
    if (isDisabled && answerText.trim()) {
      warnings.push({
        type: "warning",
        message: `Disabled question "${question.question}" has non-empty answer text.`,
        question_id: qId,
      });
    }

    if (question.word_count_max && answerText.trim()) {
      const wordCount = answerText.trim().split(/\s+/).length;
      if (wordCount > question.word_count_max) {
        warnings.push({
          type: "warning",
          message: `Question "${question.question}" has ${wordCount} words, exceeding limit of ${question.word_count_max}.`,
          question_id: qId,
        });
      }
    }

    answers.push({
      question_id: qId,
      answer_text: answerText,
      selected_options: selectedOptions,
      is_disabled: isDisabled,
    });
  }

  // 5. Check for missing answer blocks
  for (const q of questions) {
    if (!foundIds.has(q.id)) {
      errors.push({
        type: "error",
        message: `Missing answer block for question: "${q.question}"`,
        question_id: q.id,
      });
    }
  }

  return {
    ok: errors.length === 0,
    metadata,
    answers,
    errors,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Metadata validation (separate from parsing to avoid mutation)
// ---------------------------------------------------------------------------

export const MAX_IMPORT_FILE_SIZE = 2 * 1024 * 1024; // 2 MB

export function validateImportMetadata(
  result: ParseResult,
  expectedApplicationId: string,
  expectedQuestionsSetId: string,
): ParseResult {
  if (!result.metadata) return result;

  const extraErrors: ImportError[] = [];

  if (result.metadata.application_id !== expectedApplicationId) {
    const isTemplate = result.metadata.application_id === "template";
    extraErrors.push({
      type: "error",
      message: isTemplate
        ? "This file is a blank template. Please export from an application first, fill in your answers, then import."
        : `Application ID mismatch: file is for ${result.metadata.application_id}, but this application is ${expectedApplicationId}`,
    });
  }
  if (result.metadata.questions_set_id !== expectedQuestionsSetId) {
    extraErrors.push({
      type: "error",
      message: `Questions set ID mismatch: file is for ${result.metadata.questions_set_id}, but this application uses ${expectedQuestionsSetId}`,
    });
  }

  if (extraErrors.length === 0) return result;

  return {
    ...result,
    ok: false,
    errors: [...extraErrors, ...result.errors],
  };
}
