/**
 * Markdown export for FunderReady applications.
 * Pure TypeScript — no browser deps, fully unit-testable.
 */

import type { Criterion, SubQuestion } from "@/lib/schemas/criteria";

export interface ExportCriterion {
  id: string;
  criterion: string;
  weight?: string;
  sub_questions?: Array<SubQuestion | string>;
}

/** Subset of ExtendedQuestion used for export rendering. */
export interface ExportQuestion {
  id: string;
  question: string;
  word_count_min?: number;
  word_count_max?: number;
  guidance?: string;
  field_type?: string;
  options?: string[];
  required?: boolean;
  section?: string;
}

export interface GenerateMarkdownParams {
  application: { id: string; title?: string | null };
  fund: { id: string; name: string; organisation?: { name: string } | null };
  criteria: ExportCriterion[];
  questions: ExportQuestion[];
  answerMap: Record<string, string>;
  optionsMap: Record<string, string[]>;
  disabledMap: Record<string, boolean>;
  questionsSetId: string;
  exportedAt?: Date;
}

function escapeCodeFences(text: string): string {
  return text.replace(/```/g, "\\```");
}

function formatFieldType(q: ExportQuestion): string {
  const parts: string[] = [];
  const ft = q.field_type ?? "text_long";
  parts.push(`**Type:** ${ft}`);
  if (q.word_count_min || q.word_count_max) {
    if (q.word_count_min && q.word_count_max) {
      parts.push(`**Word limit:** ${q.word_count_min}\u2013${q.word_count_max}`);
    } else if (q.word_count_max) {
      parts.push(`**Word limit:** ${q.word_count_max}`);
    } else if (q.word_count_min) {
      parts.push(`**Word limit:** ${q.word_count_min}+`);
    }
  }
  return parts.join(" | ");
}

function formatAnswerBlock(
  q: ExportQuestion,
  answerText: string,
  selectedOptions: string[] | undefined,
): string {
  const ft = q.field_type ?? "text_long";
  const lines: string[] = [];

  if (ft === "radio" || ft === "dropdown") {
    const options = q.options ?? [];
    for (const opt of options) {
      const selected = selectedOptions?.includes(opt);
      lines.push(selected ? `(x) ${opt}` : `( ) ${opt}`);
    }
    return lines.join("\n");
  }

  if (ft === "checkbox") {
    const options = q.options ?? [];
    for (const opt of options) {
      const selected = selectedOptions?.includes(opt);
      lines.push(selected ? `[x] ${opt}` : `[ ] ${opt}`);
    }
    return lines.join("\n");
  }

  // Text-based fields: fenced code block
  return "```\n" + escapeCodeFences(answerText) + "\n```";
}

export function generateMarkdown(params: GenerateMarkdownParams): string {
  const { application, fund, criteria, questions, answerMap, optionsMap, disabledMap, questionsSetId, exportedAt } = params;
  const lines: string[] = [];

  // YAML frontmatter
  lines.push("---");
  lines.push(`application_id: ${application.id}`);
  lines.push(`questions_set_id: ${questionsSetId}`);
  lines.push(`fund_id: ${fund.id}`);
  lines.push(`exported_at: ${(exportedAt ?? new Date()).toISOString()}`);
  lines.push("---");
  lines.push("");

  // Header
  lines.push("# FunderReady Application Export");
  lines.push("");
  lines.push(`**Fund:** ${fund.name}`);
  if (fund.organisation) {
    lines.push(`**Organisation:** ${fund.organisation.name}`);
  }
  lines.push("");

  // Criteria section
  if (criteria.length > 0) {
    lines.push("## Criteria");
    lines.push("");
    for (let i = 0; i < criteria.length; i++) {
      const c = criteria[i];
      const weightStr = c.weight ? ` (Weight: ${c.weight})` : "";
      lines.push(`${i + 1}. **${c.criterion}**${weightStr}`);
      if (c.sub_questions) {
        for (const sq of c.sub_questions) {
          const text = typeof sq === "string" ? sq : sq.text;
          lines.push(`   - ${text}`);
        }
      }
    }
    lines.push("");
    lines.push("---");
    lines.push("");
  }

  // Questions section — grouped by section
  lines.push("## Questions");
  lines.push("");

  let currentSection: string | null = null;
  let questionIndex = 0;

  for (const q of questions) {
    const section = q.section ?? null;
    if (section !== currentSection) {
      currentSection = section;
      if (currentSection) {
        lines.push(`<!-- section: ${currentSection} -->`);
        lines.push(`### ${currentSection}`);
        lines.push("");
      }
    }

    questionIndex++;
    const isDisabled = disabledMap[q.id] ?? false;
    const requiredStr = q.required !== false ? " *(required)*" : "";
    const disabledStr = isDisabled ? " [DISABLED]" : "";

    lines.push(`<!-- question_id: ${q.id} -->`);
    lines.push(`#### ${questionIndex}. ${q.question}${requiredStr}${disabledStr}`);
    lines.push("");

    // Metadata blockquote
    const metaParts = [formatFieldType(q)];
    lines.push(`> ${metaParts.join("\n> ")}`);
    if (q.guidance) {
      lines.push(`> **Guidance:** ${q.guidance}`);
    }
    lines.push("");

    // Answer block
    const answerText = answerMap[q.id] ?? "";
    const selectedOptions = optionsMap[q.id];
    const answerContent = formatAnswerBlock(q, answerText, selectedOptions);

    lines.push(`<!-- answer_start: ${q.id} -->`);
    lines.push(answerContent);
    lines.push(`<!-- answer_end: ${q.id} -->`);
    lines.push("");
    lines.push("---");
    lines.push("");
  }

  return lines.join("\n");
}

export function getExportFilename(
  fundName: string,
  title: string | null | undefined,
  applicationId: string,
): string {
  const sanitise = (s: string) =>
    s.replace(/[<>:"/\\|?*]/g, "-").replace(/\s+/g, " ").trim();

  const fundPart = sanitise(fundName);
  const titlePart = title ? sanitise(title) : applicationId.slice(0, 8);

  return `FunderReady - ${fundPart} - ${titlePart}.md`;
}
