import { z } from "zod";
import { callClaude } from "./anthropic";

const MODEL = "claude-sonnet-4-6";

// ---------------------------------------------------------------------------
// Section parsing — no AI involved
// ---------------------------------------------------------------------------

interface DocumentSection {
  heading: string;
  content: string;
}

/**
 * Splits structured text (with # heading markers from htmlToMarkdownText)
 * into sections. Falls back to splitting by paragraph if no headings found.
 */
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

  // No headings — fall back to paragraph splitting
  if (nonEmpty.length === 0 || (nonEmpty.length === 1 && !sections.some((s) => /^#{1,6}\s/.test(s.heading)))) {
    return text
      .split(/\n{2,}/)
      .map((p, i) => ({ heading: `Paragraph ${i + 1}`, content: p.trim() }))
      .filter((s) => s.content);
  }

  return nonEmpty;
}

// ---------------------------------------------------------------------------
// String-match mapping — uses question/section titles to match without AI
// ---------------------------------------------------------------------------

/** Normalise text for comparison: lowercase, strip punctuation, collapse spaces. */
function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Returns a 0–1 similarity score between two strings based on word overlap
 * (Jaccard index). Common stop-words are excluded to avoid false positives.
 */
const STOP_WORDS = new Set(["a", "an", "the", "and", "or", "of", "to", "in", "is", "for", "on", "at", "by", "with", "this", "that", "are", "your", "our"]);

function wordSimilarity(a: string, b: string): number {
  const words = (text: string) =>
    new Set(normalise(text).split(" ").filter((w) => w.length > 1 && !STOP_WORDS.has(w)));
  const wa = words(a);
  const wb = words(b);
  if (wa.size === 0 && wb.size === 0) return 1;
  if (wa.size === 0 || wb.size === 0) return 0;
  const intersection = [...wa].filter((w) => wb.has(w)).length;
  const union = new Set([...wa, ...wb]).size;
  return intersection / union;
}

const MATCH_THRESHOLD = 0.5; // ≥50% word overlap → confident match

/**
 * Try to match sections to questions by string similarity against the known
 * question/section titles. Returns confident matches and the leftovers that
 * need AI disambiguation.
 */
function matchByTitle(
  sections: DocumentSection[],
  questions: Array<{ id: string; question: string }>
): {
  matched: Array<{ section_index: number; question_id: string }>;
  unmatchedSectionIndexes: number[];
  unmatchedQuestionIds: string[];
} {
  const matched: Array<{ section_index: number; question_id: string }> = [];
  const usedSectionIndexes = new Set<number>();
  const usedQuestionIds = new Set<string>();

  // Score every section × question pair
  const scores: Array<{ sectionIndex: number; questionId: string; score: number }> = [];
  for (let si = 0; si < sections.length; si++) {
    for (const q of questions) {
      const score = wordSimilarity(sections[si].heading, q.question);
      if (score >= MATCH_THRESHOLD) {
        scores.push({ sectionIndex: si, questionId: q.id, score });
      }
    }
  }

  // Greedy assignment: take highest-scoring pair first, one-to-one
  scores.sort((a, b) => b.score - a.score);
  for (const { sectionIndex, questionId, score: _ } of scores) {
    if (usedSectionIndexes.has(sectionIndex) || usedQuestionIds.has(questionId)) continue;
    matched.push({ section_index: sectionIndex, question_id: questionId });
    usedSectionIndexes.add(sectionIndex);
    usedQuestionIds.add(questionId);
  }

  const unmatchedSectionIndexes = sections
    .map((_, i) => i)
    .filter((i) => !usedSectionIndexes.has(i));
  const unmatchedQuestionIds = questions
    .map((q) => q.id)
    .filter((id) => !usedQuestionIds.has(id));

  return { matched, unmatchedSectionIndexes, unmatchedQuestionIds };
}

// ---------------------------------------------------------------------------
// AI fallback — only for sections/questions that couldn't be matched by title
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
  sections: DocumentSection[],
  allSections: DocumentSection[],
  sectionIndexes: number[],
  questions: Array<{ id: string; question: string }>
): Promise<Array<{ section_index: number; question_id: string }>> {
  if (sectionIndexes.length === 0 || questions.length === 0) return [];

  // Pass original section_index values so Claude's output maps back to allSections
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
// Public API
// ---------------------------------------------------------------------------

export async function extractAnswersFromDocument(
  documentText: string,
  questions: Array<{ id: string; question: string }>
): Promise<Array<{ question_id: string; answer_text: string }>> {
  const sections = parseDocumentSections(documentText);

  if (sections.length === 0) {
    return questions.map((q) => ({ question_id: q.id, answer_text: "" }));
  }

  // Step 1: match as many sections as possible using the known question/section
  // titles — no AI, no hallucination risk, and faster for well-structured docs
  const { matched, unmatchedSectionIndexes, unmatchedQuestionIds } = matchByTitle(
    sections,
    questions
  );

  // Step 2: AI fallback only for anything that didn't match by title
  const unmatchedQuestions = questions.filter((q) => unmatchedQuestionIds.includes(q.id));
  const aiMappings =
    unmatchedSectionIndexes.length > 0 && unmatchedQuestions.length > 0
      ? await mapRemainingWithAI(
          sections,
          sections,
          unmatchedSectionIndexes,
          unmatchedQuestions
        )
      : [];

  const allMappings = [...matched, ...aiMappings];

  return questions.map((q) => {
    const mapping = allMappings.find((m) => m.question_id === q.id);
    const section = mapping !== undefined ? sections[mapping.section_index] : null;
    return {
      question_id: q.id,
      answer_text: section?.content ?? "",
    };
  });
}
