/**
 * @deprecated Used by legacy document-upload review pipeline.
 * New form-based applications have pre-defined questions — no matching needed.
 *
 * Question-to-section matching — re-sections a parsed bid by matching
 * paragraphs/sections to funder questions.
 */

import type { ParsedBid, Section } from "./parse-bid";
import type { Question } from "@/lib/schemas/criteria";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface QuestionMatchResult {
  sections: Section[];
  unmatched_paragraph_ids: string[];
  match_confidence: "high" | "medium" | "low";
}

// ---------------------------------------------------------------------------
// Token helpers
// ---------------------------------------------------------------------------

const STOP_WORDS = new Set([
  "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for",
  "of", "with", "by", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "could",
  "should", "may", "might", "shall", "can", "this", "that", "these",
  "those", "it", "its", "you", "your", "we", "our", "how", "what",
  "which", "who", "whom", "where", "when", "why",
]);

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 1 && !STOP_WORDS.has(t))
  );
}

/**
 * Overlap coefficient (Szymkiewicz–Simpson): intersection / min(|a|, |b|).
 * Better than Jaccard for asymmetric text lengths (short headings vs long questions).
 * Measures what fraction of the smaller set's tokens appear in the larger set.
 */
function overlapCoefficient(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection++;
  }
  return intersection / Math.min(a.size, b.size);
}

// ---------------------------------------------------------------------------
// Pattern matching: detect numbered prefixes like "Q1:", "Question 1:", "1."
// ---------------------------------------------------------------------------

const NUMBERED_PREFIX_RE = /^(?:q(?:uestion)?\s*(\d+)|(\d+)[.)]\s)/i;

function extractNumberPrefix(text: string): number | null {
  const match = text.trim().match(NUMBERED_PREFIX_RE);
  if (!match) return null;
  return parseInt(match[1] ?? match[2], 10);
}

// ---------------------------------------------------------------------------
// Main matching function
// ---------------------------------------------------------------------------

const OVERLAP_THRESHOLD = 0.4;

export function matchQuestionsToSections(
  parsedBid: ParsedBid,
  questions: Question[]
): QuestionMatchResult {
  const sections = parsedBid.sections;
  if (questions.length === 0 || sections.length === 0) {
    return {
      sections: [...sections],
      unmatched_paragraph_ids: [],
      match_confidence: "low",
    };
  }

  // Pre-tokenize questions (include guidance text for richer matching)
  const questionTokens = questions.map((q) => {
    const combined = q.guidance
      ? `${q.question} ${q.guidance}`
      : q.question;
    return tokenize(combined);
  });

  // Track matches: sectionIndex → questionIndex
  const sectionToQuestion = new Map<number, number>();
  const matchedQuestions = new Set<number>();

  // -------------------------------------------------------------------------
  // Strategy 1: Token-overlap similarity (Jaccard)
  // -------------------------------------------------------------------------
  for (let si = 0; si < sections.length; si++) {
    const sectionTitle = sections[si].title;
    const sectionTokens = tokenize(sectionTitle);
    if (sectionTokens.size === 0) continue;

    let bestScore = 0;
    let bestQi = -1;

    for (let qi = 0; qi < questions.length; qi++) {
      if (matchedQuestions.has(qi)) continue;
      const score = overlapCoefficient(sectionTokens, questionTokens[qi]);
      if (score > bestScore) {
        bestScore = score;
        bestQi = qi;
      }
    }

    if (bestScore >= OVERLAP_THRESHOLD && bestQi >= 0) {
      sectionToQuestion.set(si, bestQi);
      matchedQuestions.add(bestQi);
    }
  }

  // -------------------------------------------------------------------------
  // Strategy 2: Numbered prefix matching (Q1: → question[0], etc.)
  // -------------------------------------------------------------------------
  for (let si = 0; si < sections.length; si++) {
    if (sectionToQuestion.has(si)) continue;
    const num = extractNumberPrefix(sections[si].title);
    if (num === null) continue;

    // Map number to question index (1-based → 0-based)
    const qi = num - 1;
    if (qi >= 0 && qi < questions.length && !matchedQuestions.has(qi)) {
      sectionToQuestion.set(si, qi);
      matchedQuestions.add(qi);
    }
  }

  // -------------------------------------------------------------------------
  // Strategy 3: Sequential fallback if <50% matched
  // -------------------------------------------------------------------------
  const matchedRatio = matchedQuestions.size / questions.length;
  let usedSequentialFallback = false;

  if (matchedRatio < 0.5) {
    // Reset and use sequential assignment
    sectionToQuestion.clear();
    matchedQuestions.clear();
    usedSequentialFallback = true;

    // Filter to substantive sections (skip preamble-like sections)
    const substantiveSections = sections
      .map((s, i) => ({ section: s, index: i }))
      .filter((s) => s.section.word_count >= 20);

    const count = Math.min(substantiveSections.length, questions.length);
    for (let i = 0; i < count; i++) {
      sectionToQuestion.set(substantiveSections[i].index, i);
      matchedQuestions.add(i);
    }
  }

  // -------------------------------------------------------------------------
  // Build result sections with question metadata
  // -------------------------------------------------------------------------
  const resultSections: Section[] = [];
  const unmatchedParagraphIds: string[] = [];

  for (let si = 0; si < sections.length; si++) {
    const section = sections[si];
    const qi = sectionToQuestion.get(si);

    if (qi !== undefined) {
      const question = questions[qi];
      resultSections.push({
        ...section,
        question_id: question.id,
        word_count_min: question.word_count_min,
        word_count_max: question.word_count_max,
      });
    } else {
      resultSections.push({ ...section });
      unmatchedParagraphIds.push(...section.paragraph_ids);
    }
  }

  // Determine confidence
  const finalMatchedRatio = matchedQuestions.size / questions.length;
  let confidence: "high" | "medium" | "low";
  if (usedSequentialFallback) {
    confidence = "low";
  } else if (finalMatchedRatio >= 0.8) {
    confidence = "high";
  } else if (finalMatchedRatio >= 0.5) {
    confidence = "medium";
  } else {
    confidence = "low";
  }

  return {
    sections: resultSections,
    unmatched_paragraph_ids: unmatchedParagraphIds,
    match_confidence: confidence,
  };
}
