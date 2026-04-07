import { z } from "zod";
import * as chrono from "chrono-node";
import { callClaude } from "./anthropic";

const MODEL = "claude-sonnet-4-6";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DocumentSection {
  heading: string;
  content: string;
}

export interface ExtractQuestion {
  id: string;
  question: string;
  field_type?: string;
  options?: string[];
}

export interface ExtractedAnswer {
  question_id: string;
  answer_text: string;
  selected_options?: string[];
}

// ---------------------------------------------------------------------------
// Section parsing — no AI involved
// ---------------------------------------------------------------------------

function parseDocumentSections(text: string): DocumentSection[] {
  const lines = text.split("\n");
  const sections: DocumentSection[] = [];
  let currentHeading: string | null = null;
  let currentLines: string[] = [];

  const flush = () => {
    const content = currentLines.join("\n").trim();
    if (content || currentHeading) {
      sections.push({
        heading: currentHeading ?? `Section ${sections.length + 1}`,
        content,
      });
    }
    currentLines = [];
  };

  for (const line of lines) {
    const headingMatch = line.match(/^#{1,6}\s+(.+)/);
    if (headingMatch) {
      flush();
      currentHeading = headingMatch[1].trim();
    } else {
      currentLines.push(line);
    }
  }
  flush();

  const nonEmpty = sections.filter((s) => s.content.trim());

  if (nonEmpty.length === 0 || (nonEmpty.length === 1 && !sections.some((s) => /^#{1,6}\s/.test(s.heading)))) {
    return text
      .split(/\n{2,}/)
      .map((p, i) => ({ heading: `Paragraph ${i + 1}`, content: p.trim() }))
      .filter((s) => s.content);
  }

  return nonEmpty;
}

// ---------------------------------------------------------------------------
// Option matching — no AI, string-based
// ---------------------------------------------------------------------------

const STOP_WORDS = new Set([
  "a", "an", "the", "and", "or", "of", "to", "in", "is", "for",
  "on", "at", "by", "with", "this", "that", "are", "your", "our",
]);

function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const OPTION_MATCH_THRESHOLD = 0.5;

function wordSimilarity(a: string, b: string): number {
  const words = (t: string) =>
    new Set(normalise(t).split(" ").filter((w) => w.length > 1 && !STOP_WORDS.has(w)));
  const wa = words(a);
  const wb = words(b);
  if (wa.size === 0 && wb.size === 0) return 1;
  if (wa.size === 0 || wb.size === 0) return 0;
  const intersection = [...wa].filter((w) => wb.has(w)).length;
  const union = new Set([...wa, ...wb]).size;
  return intersection / union;
}

/**
 * Attempts to match extracted section text against a question's known options.
 * Returns selected_options (and clears answer_text for clean option fields).
 *
 * Strategy:
 * - text_short / text_long / number / date / email / url / phone / time:
 *   answer_text as-is, no selected_options
 * - radio / dropdown:
 *   find the single best-matching option by substring or word overlap
 * - checkbox:
 *   find all options mentioned in the text
 * - radio_other / checkbox_other:
 *   same as radio/checkbox for standard options; if the text doesn't match
 *   any standard option, set selected_options: ["Other"] so the answer_text
 *   (the section content) flows into the "other" free-text field
 */
function resolveOptionField(
  text: string,
  options: string[],
  fieldType: string
): { answer_text: string; selected_options: string[] } {
  const isMulti = fieldType === "checkbox" || fieldType === "checkbox_other";
  const hasOther = fieldType === "radio_other" || fieldType === "checkbox_other";

  // Separate "Other" pseudo-option from real options
  const otherOption = options.find((o) => /^other$/i.test(o.trim()));
  const realOptions = options.filter((o) => !/^other$/i.test(o.trim()));

  const normText = normalise(text);
  const matched: string[] = [];

  for (const option of realOptions) {
    const normOption = normalise(option);
    const isMatch =
      normText.includes(normOption) ||
      normOption.includes(normText) ||
      wordSimilarity(text, option) >= OPTION_MATCH_THRESHOLD;

    if (isMatch) {
      matched.push(option);
      if (!isMulti) break; // single-select: first/best match only
    }
  }

  if (matched.length > 0) {
    // Found standard option matches — clear answer_text unless it's _other and
    // "Other" might also apply (leave answer_text for the "other" free field)
    return { answer_text: "", selected_options: matched };
  }

  if (hasOther && otherOption) {
    // No standard option matched — treat the whole section as an "other" answer
    return { answer_text: text, selected_options: [otherOption] };
  }

  // No options matched and no "other" fallback — return text so user can see it
  return { answer_text: text, selected_options: [] };
}

// ---------------------------------------------------------------------------
// String-match mapping — uses question/section titles to map without AI
// ---------------------------------------------------------------------------

function wordSimilarityForMapping(a: string, b: string): number {
  return wordSimilarity(a, b);
}

const MATCH_THRESHOLD = 0.5;

function matchByTitle(
  sections: DocumentSection[],
  questions: ExtractQuestion[]
): {
  matched: Array<{ section_index: number; question_id: string }>;
  unmatchedSectionIndexes: number[];
  unmatchedQuestionIds: string[];
} {
  const matched: Array<{ section_index: number; question_id: string }> = [];
  const usedSectionIndexes = new Set<number>();
  const usedQuestionIds = new Set<string>();

  const scores: Array<{ sectionIndex: number; questionId: string; score: number }> = [];
  for (let si = 0; si < sections.length; si++) {
    for (const q of questions) {
      const score = wordSimilarityForMapping(sections[si].heading, q.question);
      if (score >= MATCH_THRESHOLD) {
        scores.push({ sectionIndex: si, questionId: q.id, score });
      }
    }
  }

  scores.sort((a, b) => b.score - a.score);
  for (const { sectionIndex, questionId } of scores) {
    if (usedSectionIndexes.has(sectionIndex) || usedQuestionIds.has(questionId)) continue;
    matched.push({ section_index: sectionIndex, question_id: questionId });
    usedSectionIndexes.add(sectionIndex);
    usedQuestionIds.add(questionId);
  }

  return {
    matched,
    unmatchedSectionIndexes: sections.map((_, i) => i).filter((i) => !usedSectionIndexes.has(i)),
    unmatchedQuestionIds: questions.map((q) => q.id).filter((id) => !usedQuestionIds.has(id)),
  };
}

// ---------------------------------------------------------------------------
// AI fallback — only for unmatched sections/questions
// ---------------------------------------------------------------------------

const SectionMappingSchema = z.object({
  mappings: z.array(
    z.object({
      section_index: z.number().int().min(0),
      question_id: z.string(),
    })
  ),
});

const MAPPING_SYSTEM_PROMPT = `You match document sections to application form questions by semantic similarity.

Rules:
- Only map a section if it clearly corresponds to a question
- Each section may map to at most one question; each question may receive at most one section
- Return only the section_index (0-based integer) and question_id — no text content`;

async function mapRemainingWithAI(
  allSections: DocumentSection[],
  sectionIndexes: number[],
  questions: ExtractQuestion[]
): Promise<Array<{ section_index: number; question_id: string }>> {
  if (sectionIndexes.length === 0 || questions.length === 0) return [];

  const sectionList = sectionIndexes
    .map((i) => `[${i}] "${allSections[i].heading}" — ${allSections[i].content.slice(0, 120).trim()}${allSections[i].content.length > 120 ? "…" : ""}`)
    .join("\n");

  const questionList = questions.map((q) => `[${q.id}] ${q.question}`).join("\n");

  const result = await callClaude({
    systemPrompt: MAPPING_SYSTEM_PROMPT,
    prompt: `Document sections:\n${sectionList}\n\nApplication questions:\n${questionList}`,
    schema: SectionMappingSchema,
    model: MODEL,
    maxTokens: 1024,
    temperature: 0,
  });

  return result.mappings;
}

// ---------------------------------------------------------------------------
// Field-type normalisation
// ---------------------------------------------------------------------------

/**
 * Converts free-text extracted from a document into the canonical format
 * expected by each field type:
 *   date        → "YYYY-MM-DD"  (via chrono-node)
 *   time        → "HH:mm"       (via chrono-node)
 *   number      → numeric string (strip non-numeric except decimal point/minus)
 *   everything else → text as-is
 */
function normaliseValue(text: string, fieldType: string): string {
  const trimmed = text.trim();

  if (fieldType === "date") {
    const parsed = chrono.parseDate(trimmed);
    if (!parsed) return trimmed; // leave raw text; DatePicker will show empty
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, "0");
    const d = String(parsed.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  if (fieldType === "time") {
    const parsed = chrono.parseDate(trimmed);
    if (!parsed) return trimmed;
    const h = String(parsed.getHours()).padStart(2, "0");
    const min = String(parsed.getMinutes()).padStart(2, "0");
    return `${h}:${min}`;
  }

  if (fieldType === "number") {
    // Keep digits, decimal point and leading minus; strip everything else
    const numeric = trimmed.replace(/[^\d.-]/g, "");
    return numeric || trimmed;
  }

  return trimmed;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function extractAnswersFromDocument(
  documentText: string,
  questions: ExtractQuestion[]
): Promise<ExtractedAnswer[]> {
  const sections = parseDocumentSections(documentText);

  if (sections.length === 0) {
    return questions.map((q) => ({ question_id: q.id, answer_text: "" }));
  }

  const { matched, unmatchedSectionIndexes, unmatchedQuestionIds } = matchByTitle(
    sections,
    questions
  );

  const unmatchedQuestions = questions.filter((q) => unmatchedQuestionIds.includes(q.id));
  const aiMappings =
    unmatchedSectionIndexes.length > 0 && unmatchedQuestions.length > 0
      ? await mapRemainingWithAI(sections, unmatchedSectionIndexes, unmatchedQuestions)
      : [];

  const allMappings = [...matched, ...aiMappings];

  return questions.map((q) => {
    const mapping = allMappings.find((m) => m.question_id === q.id);
    const section = mapping !== undefined ? sections[mapping.section_index] : null;

    if (!section) {
      return { question_id: q.id, answer_text: "" };
    }

    const fieldType = q.field_type ?? "text_long";
    const isOptionField = [
      "radio", "checkbox", "dropdown", "radio_other", "checkbox_other",
    ].includes(fieldType);

    if (isOptionField && q.options && q.options.length > 0) {
      const resolved = resolveOptionField(section.content, q.options, fieldType);
      return {
        question_id: q.id,
        answer_text: resolved.answer_text,
        selected_options: resolved.selected_options,
      };
    }

    // Text / number / date / email / url / phone / time — answer_text only
    return { question_id: q.id, answer_text: normaliseValue(section.content, fieldType) };
  });
}
