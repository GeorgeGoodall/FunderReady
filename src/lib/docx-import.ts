/**
 * Docx import for FunderReady applications.
 * Parses .docx files exported by FunderReady, extracting metadata and answers.
 */

import JSZip from "jszip";
import mammoth from "mammoth";

import { FUNDERREADY_XML_NAMESPACE, parseCustomXml } from "@/lib/docx-custom-xml";
import type {
  ParseResult,
  ParsedAnswer,
  ImportMetadata,
  ImportError,
  ImportQuestion,
} from "@/lib/markdown-import";

export const MAX_DOCX_IMPORT_SIZE = 10 * 1024 * 1024; // 10 MB

/* ------------------------------------------------------------------ */
/*  Internal helpers                                                   */
/* ------------------------------------------------------------------ */

/** Lines that are metadata in the grey table — skip when extracting answer text. */
const METADATA_LINE_PATTERNS = [
  /^Type:\s/,
  /^Word limit:\s/,
  /^Guidance:\s/,
];

function isMetadataLine(line: string): boolean {
  return METADATA_LINE_PATTERNS.some((p) => p.test(line));
}

/**
 * Match a heading line like "1. Describe your project (required)" or
 * "2. Legacy question (required) [DISABLED]".
 * Returns the question text portion (without the number prefix, required tag, or disabled tag).
 */
const HEADING_PATTERN = /^\d+\.\s+(.+?)(?:\s+\(required\))?(?:\s+\[DISABLED\])?\s*$/;

function normaliseText(s: string): string {
  // Collapse whitespace, trim, lower-case for fuzzy matching
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}

/* ------------------------------------------------------------------ */
/*  Custom XML extraction                                              */
/* ------------------------------------------------------------------ */

async function extractMetadataFromZip(
  zip: JSZip,
): Promise<{ metadata: ImportMetadata; errors: ImportError[] } | { metadata: null; errors: ImportError[] }> {
  const errors: ImportError[] = [];

  // Look for customXml files containing our namespace
  const xmlFiles: string[] = [];
  zip.forEach((path) => {
    if (path.startsWith("customXml/") && path.endsWith(".xml") && !path.includes("_rels") && !path.includes("Props")) {
      xmlFiles.push(path);
    }
  });

  for (const path of xmlFiles) {
    const content = await zip.file(path)!.async("text");
    if (content.includes(FUNDERREADY_XML_NAMESPACE)) {
      const parsed = parseCustomXml(content);
      if (!parsed) {
        errors.push({ type: "error", message: "FunderReady metadata found but could not be parsed — file may be corrupted." });
        return { metadata: null, errors };
      }
      const meta: ImportMetadata = {
        application_id: parsed.application_id,
        questions_set_id: parsed.questions_set_id,
        fund_id: parsed.fund_id,
      };
      return { metadata: meta, errors: [] };
    }
  }

  errors.push({ type: "error", message: "This file was not exported from FunderReady." });
  return { metadata: null, errors };
}

/* ------------------------------------------------------------------ */
/*  Text parsing                                                       */
/* ------------------------------------------------------------------ */

interface QuestionRegion {
  questionId: string;
  isDisabled: boolean;
  lines: string[];
}

function findQuestionRegions(
  textLines: string[],
  questions: ImportQuestion[],
): { regions: QuestionRegion[]; unmatchedIds: string[] } {
  // Build a lookup from normalised question text → question
  const questionByNormText = new Map<string, ImportQuestion>();
  for (const q of questions) {
    questionByNormText.set(normaliseText(q.question), q);
  }

  // Scan lines to find heading positions
  interface HeadingMatch {
    lineIndex: number;
    question: ImportQuestion;
    isDisabled: boolean;
  }

  const headings: HeadingMatch[] = [];
  for (let i = 0; i < textLines.length; i++) {
    const line = textLines[i];
    const headingMatch = HEADING_PATTERN.exec(line);
    if (!headingMatch) continue;

    const rawQuestionText = headingMatch[1];
    const normText = normaliseText(rawQuestionText);

    // Try exact match first
    let matched = questionByNormText.get(normText);

    // If not found, try contains match (the question text appears in the heading)
    if (!matched) {
      for (const entry of Array.from(questionByNormText.entries())) {
        if (normText.includes(entry[0]) || entry[0].includes(normText)) {
          matched = entry[1];
          break;
        }
      }
    }

    if (matched) {
      headings.push({
        lineIndex: i,
        question: matched,
        isDisabled: line.includes("[DISABLED]"),
      });
    }
  }

  // Extract regions between headings
  const regions: QuestionRegion[] = [];
  const matchedIds = new Set<string>();

  for (let h = 0; h < headings.length; h++) {
    const hd = headings[h];
    const startLine = hd.lineIndex + 1; // skip the heading itself
    const endLine = h + 1 < headings.length ? headings[h + 1].lineIndex : textLines.length;
    const regionLines = textLines.slice(startLine, endLine);

    matchedIds.add(hd.question.id);
    regions.push({
      questionId: hd.question.id,
      isDisabled: hd.isDisabled,
      lines: regionLines,
    });
  }

  // Find unmatched question IDs
  const unmatchedIds = questions.filter((q) => !matchedIds.has(q.id)).map((q) => q.id);

  return { regions, unmatchedIds };
}

function extractAnswerFromRegion(
  region: QuestionRegion,
  question: ImportQuestion,
): { answer: ParsedAnswer; warnings: ImportError[]; errors?: ImportError[] } {
  const warnings: ImportError[] = [];
  const ft = question.field_type ?? "text_long";

  if (ft === "radio" || ft === "dropdown") {
    const selected: string[] = [];
    const allowedSet = new Set(question.options ?? []);
    for (const line of region.lines) {
      const match = line.match(/^\(x\)\s+(.+)$/);
      if (match) {
        const value = match[1].trim();
        selected.push(value);
        if (allowedSet.size > 0 && !allowedSet.has(value)) {
          warnings.push({
            type: "warning",
            message: `Question "${question.question}" has unrecognised option: "${value}"`,
            question_id: region.questionId,
          });
        }
      }
    }

    if (selected.length > 1) {
      return {
        answer: {
          question_id: region.questionId,
          answer_text: selected[0] ?? "",
          selected_options: selected,
          is_disabled: region.isDisabled,
        },
        warnings,
        errors: [{
          type: "error" as const,
          message: `${ft === "radio" ? "Radio" : "Dropdown"} question "${question.question}" has multiple selections — only one is allowed.`,
          question_id: region.questionId,
        }],
      };
    }

    const answerText = selected[0] ?? "";
    return {
      answer: {
        question_id: region.questionId,
        answer_text: answerText,
        selected_options: selected,
        is_disabled: region.isDisabled,
      },
      warnings,
    };
  }

  if (ft === "checkbox") {
    const selected: string[] = [];
    const allowedSet = new Set(question.options ?? []);
    for (const line of region.lines) {
      const match = line.match(/^\[x\]\s+(.+)$/);
      if (match) {
        const value = match[1].trim();
        selected.push(value);
        if (allowedSet.size > 0 && !allowedSet.has(value)) {
          warnings.push({
            type: "warning",
            message: `Question "${question.question}" has unrecognised option: "${value}"`,
            question_id: region.questionId,
          });
        }
      }
    }
    const answerText = selected.join(", ");
    return {
      answer: {
        question_id: region.questionId,
        answer_text: answerText,
        selected_options: selected,
        is_disabled: region.isDisabled,
      },
      warnings,
    };
  }

  // Text-based answer: skip metadata lines and empty lines at start
  const contentLines: string[] = [];
  let foundContent = false;

  for (const line of region.lines) {
    if (isMetadataLine(line)) continue;

    // Skip leading empty lines
    if (!foundContent && line.trim() === "") continue;

    foundContent = true;
    contentLines.push(line);
  }

  // Trim trailing empty lines
  while (contentLines.length > 0 && contentLines[contentLines.length - 1].trim() === "") {
    contentLines.pop();
  }

  const answerText = contentLines.join("\n");

  // Warn on disabled with non-empty text
  if (region.isDisabled && answerText.trim()) {
    warnings.push({
      type: "warning",
      message: `Disabled question "${question.question}" has non-empty answer text.`,
      question_id: region.questionId,
    });
  }

  // Warn on word count exceeded
  if (question.word_count_max && answerText.trim()) {
    const wordCount = answerText.trim().split(/\s+/).length;
    if (wordCount > question.word_count_max) {
      warnings.push({
        type: "warning",
        message: `Question "${question.question}" has ${wordCount} words, exceeding limit of ${question.word_count_max}.`,
        question_id: region.questionId,
      });
    }
  }

  return {
    answer: {
      question_id: region.questionId,
      answer_text: answerText,
      is_disabled: region.isDisabled,
    },
    warnings,
  };
}

/* ------------------------------------------------------------------ */
/*  Main parser                                                        */
/* ------------------------------------------------------------------ */

export async function parseDocx(
  buffer: Buffer | ArrayBuffer,
  questions: ImportQuestion[],
): Promise<ParseResult> {
  const errors: ImportError[] = [];
  const warnings: ImportError[] = [];
  const answers: ParsedAnswer[] = [];

  // 1. Unzip
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch {
    errors.push({ type: "error", message: "Could not read file — it may be corrupted or not a valid .docx." });
    return { ok: false, metadata: null, answers: [], errors, warnings: [] };
  }

  // 2. Extract metadata from custom XML
  const metaResult = await extractMetadataFromZip(zip);
  if (metaResult.errors.length > 0) {
    return { ok: false, metadata: null, answers: [], errors: metaResult.errors, warnings: [] };
  }
  const metadata = metaResult.metadata!;

  // 3. Extract raw text via mammoth
  const mammothResult = await mammoth.extractRawText({ buffer: buffer instanceof ArrayBuffer ? Buffer.from(buffer) : buffer });
  const rawText = mammothResult.value;

  // 4. Split into lines and find question regions
  const textLines = rawText.split("\n");

  // Build question lookup
  const questionMap = new Map<string, ImportQuestion>();
  for (const q of questions) {
    questionMap.set(q.id, q);
  }

  const { regions, unmatchedIds } = findQuestionRegions(textLines, questions);

  // 5. Report missing questions as errors
  for (const id of unmatchedIds) {
    const q = questionMap.get(id)!;
    errors.push({
      type: "error",
      message: `Missing answer for question: "${q.question}"`,
      question_id: id,
    });
  }

  // 6. Extract answers from regions
  for (const region of regions) {
    const question = questionMap.get(region.questionId)!;
    const { answer, warnings: answerWarnings, errors: answerErrors } = extractAnswerFromRegion(region, question);
    answers.push(answer);
    warnings.push(...answerWarnings);
    if (answerErrors) errors.push(...answerErrors);
  }

  return {
    ok: errors.length === 0,
    metadata,
    answers,
    errors,
    warnings,
  };
}
