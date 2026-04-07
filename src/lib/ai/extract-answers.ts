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
// Section → question mapping — AI only produces indexes and IDs, no text
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

async function mapSectionsToQuestions(
  sections: DocumentSection[],
  questions: Array<{ id: string; question: string }>
): Promise<Array<{ section_index: number; question_id: string }>> {
  const sectionList = sections
    .map((s, i) => `[${i}] "${s.heading}" — ${s.content.slice(0, 120).trim()}${s.content.length > 120 ? "…" : ""}`)
    .join("\n");

  const questionList = questions
    .map((q) => `[${q.id}] ${q.question}`)
    .join("\n");

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

  const mappings = await mapSectionsToQuestions(sections, questions);

  return questions.map((q) => {
    const mapping = mappings.find((m) => m.question_id === q.id);
    const section = mapping !== undefined ? sections[mapping.section_index] : null;
    return {
      question_id: q.id,
      answer_text: section?.content ?? "",
    };
  });
}
