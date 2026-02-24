/**
 * Prompt templates for all AI pipeline stages.
 * Ported from prototypes/end-to-end/prompt-templates.js
 */

import type { ParsedBid, Section } from "./parse-bid";
import type { SectionAnalysis } from "./schemas";

// ---------------------------------------------------------------------------
// Shared components
// ---------------------------------------------------------------------------

export const SYSTEM_PERSONA = `You are an experienced grant reviewer who has assessed hundreds of funding bids for major UK and international funders. You are rigorous but constructive. You score against the funder's criteria specifically, not your own preferences. You always provide specific, actionable feedback — never vague suggestions.`;

export const SCORING_RUBRIC = `
## Scoring Rubric

| Rating | Definition |
|--------|-----------|
| **Strong** | Fully addresses the criterion with specific evidence, clear logic, and appropriate detail. A panel member would be satisfied with no follow-up questions. |
| **Fair** | Addresses the criterion but with gaps — missing specifics, vague language, or incomplete reasoning. Would likely prompt follow-up questions from a reviewer. |
| **Needs Improvement** | Mentions the topic but fails to make a convincing case. Major gaps in evidence or logic. A panel member would score this poorly. |
| **Missing** | The criterion is not addressed in the bid at all. |`;

export const FEW_SHOT_COMMENTS = `
## Comment Examples

Here are examples of GOOD and POOR inline comments. Match the quality of the GOOD examples.

### POOR (do NOT produce comments like these):
- "[CLARITY] This could be clearer. Consider rewriting."
- "[ALIGNMENT] This section doesn't fully address the funder's criteria."
- "[EVIDENCE] More evidence needed here."

### GOOD (produce comments like these):
- "[EVIDENCE] You claim 'significant impact' but provide no figures. Add a specific metric, e.g., 'Our 2023 pilot reached 340 young people, with 78% reporting improved confidence (independent evaluation, Smith & Assoc, 2024).'"
- "[ALIGNMENT] The funder asks specifically about sustainability beyond the funding period. You describe project activities but don't explain how they'll continue after funding ends. Add a paragraph covering: ongoing funding sources, embedded partnerships, or how the model becomes self-sustaining."
- "[SPECIFICITY] 'Various community partners' is vague. Name 2-3 key partners and describe each partnership briefly, e.g., 'We partner with Southwark Council's Adult Social Care team, Pecan food bank, and the Maudsley NHS Foundation Trust.'"
- "[STRUCTURE] This paragraph covers three distinct service gaps but presents them as a single block of text. Break into a numbered or bulleted list — funders often skim-read, and clear structure helps your points land."`;

export const ANTI_HALLUCINATION = `
## Critical Rules

1. Only cite evidence that appears in the bid text. If a criterion is not addressed, say "Not addressed" — do not invent or assume content.
2. If you are unsure whether something is covered, flag it as "Possibly addressed — verify" rather than making a definitive claim.
3. Every target_text value MUST be an exact quote from the bid text. Do not paraphrase or modify quotes.
4. Every paragraph_id MUST correspond to a paragraph ID from the document map provided.
5. Weight your feedback toward the highest-impact improvements. If you identify many issues, make clear which 3-5 would most improve the bid's chances.`;

export const COMMENT_CATEGORIES_DESC = `
## Comment Categories

Use exactly one of these category tags for each comment:
- **ALIGNMENT** — How well the text addresses the funder's specific criteria
- **EVIDENCE** — Missing data, unsupported claims, weak evidence
- **CLARITY** — Unclear writing, jargon, ambiguous statements
- **STRUCTURE** — Organisation, formatting, readability issues
- **IMPACT** — Weak or missing impact/outcome descriptions
- **BUDGET** — Budget concerns, value for money issues
- **MISSING** — Important content that should be here but isn't
- **CONSISTENCY** — Contradictions or inconsistencies within the bid
- **SPECIFICITY** — Vague claims that need specific details`;

// ---------------------------------------------------------------------------
// Criteria type (from criteria schema)
// ---------------------------------------------------------------------------

export interface Criterion {
  id: string;
  criterion: string;
  weight?: string;
  sub_questions?: string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function formatCriteria(criteria: Criterion[]): string {
  return criteria
    .map((c) => {
      let text = `${c.id}. ${c.criterion}`;
      if (c.weight) text += ` (Weight: ${c.weight})`;
      if (c.sub_questions && c.sub_questions.length > 0) {
        text += "\n" + c.sub_questions.map((q) => `   - ${q}`).join("\n");
      }
      return text;
    })
    .join("\n\n");
}

export function formatDocumentMap(parsedBid: ParsedBid): string {
  return parsedBid.sections
    .map(
      (s) =>
        `${s.id}: "${s.title}" (Level ${s.level}, ${s.word_count} words, paragraphs: ${s.paragraph_ids.join(", ")})`
    )
    .join("\n");
}

export function formatSectionText(section: Section, paragraphs: ParsedBid["paragraphs"]): string {
  return section.paragraph_ids
    .map((pid) => {
      const para = paragraphs[pid];
      if (!para) return `[${pid}] (missing)`;
      return `[${pid}] ${para.text}`;
    })
    .join("\n\n");
}

// ---------------------------------------------------------------------------
// Lite document map (section ID + title only)
// ---------------------------------------------------------------------------

export function formatDocumentMapLite(parsedBid: ParsedBid): string {
  return parsedBid.sections
    .map((s) => `${s.id}: "${s.title}"`)
    .join("\n");
}

// ---------------------------------------------------------------------------
// Condensed analyses summary (for cross-ref and scoring prompts)
// ---------------------------------------------------------------------------

export function formatAnalysesSummary(analyses: SectionAnalysis[]): string {
  return analyses
    .map((a) => {
      const relevance = a.criteria_relevance
        .filter((r) => r.relevance !== "not_relevant")
        .map((r) => {
          const note = r.notes ? ` — ${r.notes}` : "";
          return `${r.criterion_id} (${r.relevance}${note})`;
        })
        .join(", ");
      const lines = [`## ${a.section_id}`];
      if (relevance) lines.push(`Criteria: ${relevance}`);
      if (a.strengths.length) lines.push(`Strengths: ${a.strengths.join("; ")}`);
      if (a.weaknesses.length) lines.push(`Weaknesses: ${a.weaknesses.join("; ")}`);
      if (a.inline_comments.length) {
        const commentSummaries = a.inline_comments
          .map((c) => `- [${c.category}] ${c.issue}`)
          .join("\n");
        lines.push(`Issues flagged:\n${commentSummaries}`);
      }
      if (a.questions_for_later_sections?.length) {
        lines.push(`Open questions: ${a.questions_for_later_sections.join("; ")}`);
      }
      return lines.join("\n");
    })
    .join("\n\n");
}

// ---------------------------------------------------------------------------
// Cached system prompts (for prompt caching)
// ---------------------------------------------------------------------------

type CacheBlock = { type: "text"; text: string; cache_control?: { type: "ephemeral" } };

export function buildSectionAnalysisSystemPrompt(criteria: Criterion[]): CacheBlock[] {
  const criteriaText = formatCriteria(criteria);
  return [
    {
      type: "text" as const,
      text: `${SYSTEM_PERSONA}\n\n${SCORING_RUBRIC}\n\n${FEW_SHOT_COMMENTS}\n\n${COMMENT_CATEGORIES_DESC}\n\n${ANTI_HALLUCINATION}\n\n## Funder Criteria\n\n${criteriaText}`,
      cache_control: { type: "ephemeral" as const },
    },
  ];
}

export function buildScoringSystemPrompt(): CacheBlock[] {
  return [
    {
      type: "text" as const,
      text: `${SYSTEM_PERSONA}\n\n${SCORING_RUBRIC}`,
      cache_control: { type: "ephemeral" as const },
    },
  ];
}

// ---------------------------------------------------------------------------
// Trivial section skip
// ---------------------------------------------------------------------------

export const MIN_SECTION_WORDS = 50;
export const MAX_BID_WORDS = 50_000;
export const MAX_SECTION_WORDS = 8_000;
export const TARGET_CHUNK_WORDS = 4_000;

export function createSkippedSectionAnalysis(section: Section): SectionAnalysis {
  return {
    section_id: section.id,
    inline_comments: [],
    criteria_relevance: [],
    strengths: [],
    weaknesses: [],
    questions_for_later_sections: [],
  };
}

// ---------------------------------------------------------------------------
// Section splitting for large sections
// ---------------------------------------------------------------------------

export interface SubSection {
  sectionId: string;
  partIndex: number;
  partTotal: number;
  paragraphIds: string[];
  wordCount: number;
}

export function splitLargeSection(
  section: Section,
  paragraphs: ParsedBid["paragraphs"]
): SubSection[] {
  const chunks: SubSection[] = [];
  let currentIds: string[] = [];
  let currentWords = 0;

  for (const pid of section.paragraph_ids) {
    const para = paragraphs[pid];
    const paraWords = para?.word_count ?? 0;

    // If adding this paragraph would exceed target and we already have content, start a new chunk
    if (currentIds.length > 0 && currentWords + paraWords > TARGET_CHUNK_WORDS) {
      chunks.push({
        sectionId: section.id,
        partIndex: chunks.length,
        partTotal: 0, // Will be set after
        paragraphIds: currentIds,
        wordCount: currentWords,
      });
      currentIds = [];
      currentWords = 0;
    }

    currentIds.push(pid);
    currentWords += paraWords;
  }

  // Push remaining
  if (currentIds.length > 0) {
    chunks.push({
      sectionId: section.id,
      partIndex: chunks.length,
      partTotal: 0,
      paragraphIds: currentIds,
      wordCount: currentWords,
    });
  }

  // Set partTotal on all chunks
  for (const chunk of chunks) {
    chunk.partTotal = chunks.length;
  }

  return chunks;
}

// ---------------------------------------------------------------------------
// Merge split section analyses back together
// ---------------------------------------------------------------------------

export function mergeSectionAnalyses(
  sectionId: string,
  analyses: SectionAnalysis[]
): SectionAnalysis {
  const merged: SectionAnalysis = {
    section_id: sectionId,
    inline_comments: [],
    criteria_relevance: [],
    strengths: [],
    weaknesses: [],
    questions_for_later_sections: [],
  };

  // Track highest relevance per criterion
  const relevanceMap = new Map<string, SectionAnalysis["criteria_relevance"][0]>();
  const relevanceRank: Record<string, number> = {
    directly_addresses: 3,
    partially_addresses: 2,
    not_relevant: 1,
  };

  for (const analysis of analyses) {
    merged.inline_comments.push(...analysis.inline_comments);
    merged.strengths.push(...analysis.strengths);
    merged.weaknesses.push(...analysis.weaknesses);
    if (analysis.questions_for_later_sections) {
      merged.questions_for_later_sections!.push(...analysis.questions_for_later_sections);
    }

    for (const cr of analysis.criteria_relevance) {
      const existing = relevanceMap.get(cr.criterion_id);
      if (!existing || relevanceRank[cr.relevance] > relevanceRank[existing.relevance]) {
        relevanceMap.set(cr.criterion_id, cr);
      }
    }
  }

  merged.criteria_relevance = Array.from(relevanceMap.values());

  return merged;
}

// ---------------------------------------------------------------------------
// Prompt A — Pre-Flight Check
// ---------------------------------------------------------------------------

export function buildPreFlightPrompt(parsedBid: ParsedBid): string {
  const firstWords = parsedBid.full_text.substring(0, 2000);

  return `${SYSTEM_PERSONA}

## Task: Pre-Flight Check

Quickly assess whether this document is a genuine funding bid that can be meaningfully reviewed.

## Document Text (first ~500 words)

${firstWords}

## Instructions

Analyse the text above and return a JSON object with these fields:

\`\`\`json
{
  "is_bid": true/false,
  "language": "en" or ISO language code,
  "substantive": true/false,
  "title": "extracted or inferred title",
  "word_count_estimate": number,
  "rejection_reason": "only if is_bid is false or substantive is false"
}
\`\`\`

- "is_bid": Is this a funding bid, grant application, or similar proposal?
- "language": What language is it written in?
- "substantive": Does it contain enough content for a meaningful review (more than just headers/form fields)?
- "title": The bid/project title if you can identify one.

Return ONLY the JSON object, no other text.`;
}

// ---------------------------------------------------------------------------
// Prompt B — Section Analysis
// ---------------------------------------------------------------------------

export function buildSectionAnalysisPrompt(
  parsedBid: ParsedBid,
  section: Section,
  completeDraft = true
): string {
  const sectionText = formatSectionText(section, parsedBid.paragraphs);
  const docMapLite = formatDocumentMapLite(parsedBid);

  return `## Task: Analyse Section "${section.title}"

You are reviewing a funding bid section by section. Analyse the section below against the funder's criteria.

## Document Map (full bid structure)

${docMapLite}

## Section to Analyse: ${section.id} — "${section.title}" (${section.word_count} words, paragraphs: ${section.paragraph_ids.join(", ")})

${sectionText}

## Required Output

Return a JSON object matching this exact structure:

\`\`\`json
{
  "section_id": "${section.id}",
  "inline_comments": [
    {
      "paragraph_id": "p1",
      "target_text": "exact quote from the paragraph text",
      "category": "EVIDENCE",
      "issue": "Clear description of the problem (1-2 sentences)",
      "suggestion": "Specific, actionable fix with example language where appropriate"
    }
  ],
  "criteria_relevance": [
    {
      "criterion_id": "c1",
      "relevance": "directly_addresses|partially_addresses|not_relevant",
      "notes": "Brief explanation"
    }
  ],
  "strengths": ["Specific strength 1", "Specific strength 2"],
  "weaknesses": ["Specific weakness 1", "Specific weakness 2"],
  "questions_for_later_sections": ["Question that later sections should answer"]
}
\`\`\`

Guidelines:
- Aim for 2-6 inline comments per section depending on length and quality
- target_text must be an EXACT quote from the paragraph text (at least 5 words)
- paragraph_id must match one of the IDs shown in the section text above
- Cover all relevant criteria in criteria_relevance
- Be specific — avoid generic feedback
${!completeDraft ? `
**IMPORTANT — Draft Bid Context:** The applicant has indicated this bid is a work in progress. Avoid using the MISSING comment category for content the applicant likely hasn't written yet. Instead, focus your inline comments on improving the quality of what IS written — clarity, evidence, alignment, structure, and specificity. If a section is thin or clearly incomplete, note it briefly in weaknesses but don't generate multiple MISSING comments for content that isn't there yet.` : ""}

Return ONLY the JSON object, no other text.`;
}

// ---------------------------------------------------------------------------
// Prompt C — Cross-Reference Pass
// ---------------------------------------------------------------------------

export function buildCrossReferencePrompt(
  parsedBid: ParsedBid,
  sectionAnalyses: SectionAnalysis[],
  criteria: Criterion[],
  completeDraft = true
): string {
  const docMap = formatDocumentMapLite(parsedBid);
  const criteriaText = formatCriteria(criteria);
  const analysesText = formatAnalysesSummary(sectionAnalyses);

  return `${SYSTEM_PERSONA}

## Task: Cross-Reference Pass

You have already analysed this bid section by section. Now look at the bid holistically to find issues that are only visible across sections.

## Funder Criteria

${criteriaText}

## Document Map

${docMap}

## Section Analyses (from prior review)

${analysesText}

## What to Look For

1. **Contradictions** — Numbers, claims, or commitments that conflict between sections
2. **Gaps** — Criteria partially addressed across sections but never fully in one place
3. **Missing criteria** — Criteria not addressed anywhere in the bid
4. **Unresolved references** — "See Section X" but Section X doesn't deliver
5. **Inconsistencies** — Terminology, tone, or naming that shifts between sections
6. **Repetition without new evidence** — Restating the same point without strengthening it
${!completeDraft ? `
**IMPORTANT — Draft Bid Context:** The applicant has indicated this bid is a work in progress and not all sections are complete. When identifying missing criteria, note them for the applicant's awareness but treat them as "not yet written" rather than omissions. Focus your analysis on the content that IS present — contradictions, gaps, and inconsistencies in existing text are more valuable feedback than listing sections the applicant already knows they haven't written yet. Mark missing_criterion findings as **low severity** unless the document structure suggests the criterion was meant to be addressed in an existing section.` : ""}

## Required Output

Return a JSON object:

\`\`\`json
{
  "findings": [
    {
      "type": "contradiction|gap|missing_criterion|unresolved_reference|inconsistency|repetition",
      "description": "Clear description of the issue",
      "sections_involved": ["s1", "s3"],
      "criteria_involved": ["c1"],
      "severity": "high|medium|low",
      "suggestion": "How to fix this"
    }
  ],
  "overall_coherence": "strong|adequate|weak",
  "summary": "2-3 sentence summary of the bid's overall coherence"
}
\`\`\`

Return ONLY the JSON object, no other text.`;
}

// ---------------------------------------------------------------------------
// Prompt D — Scoring & Synthesis
// ---------------------------------------------------------------------------

export function buildScoringPrompt(
  parsedBid: ParsedBid,
  sectionAnalyses: SectionAnalysis[],
  crossReference: unknown,
  criteria: Criterion[],
  completeDraft = true
): string {
  const docMap = formatDocumentMapLite(parsedBid);
  const criteriaText = formatCriteria(criteria);
  const analysesText = formatAnalysesSummary(sectionAnalyses);
  // Compact JSON to save tokens; limit findings to top 20 if there are more
  const crossRefObj = crossReference as { findings?: unknown[] };
  const trimmedCrossRef = crossRefObj.findings && crossRefObj.findings.length > 20
    ? { ...crossRefObj, findings: crossRefObj.findings.slice(0, 20) }
    : crossReference;
  const crossRefText = JSON.stringify(trimmedCrossRef);

  return `## Task: Final Scoring & Synthesis

You have completed a detailed section-by-section analysis and a cross-reference pass. Now produce the final scoring and improvement appendix.

## Funder Criteria

${criteriaText}

## Document Map

${docMap}

## Section Analyses

${analysesText}

## Cross-Reference Findings

${crossRefText}

## Required Output

Return a JSON object:

\`\`\`json
{
  "criteria_scores": [
    {
      "criterion_id": "c1",
      "criterion": "Name of the criterion",
      "score": "Strong|Fair|Needs Improvement|Missing",
      "bid_evidence": ["Section X, para Y: specific evidence cited"],
      "gaps": ["What's missing or weak"],
      "summary": "1-2 sentence summary of how the bid addresses this criterion"
    }
  ],
  "overall_score": 72,
  "overall_descriptor": "Needs Revisions — Good foundation with specific gaps to address",
  "submission_readiness": "Ready to submit|Nearly ready|Needs revisions|Major rework needed",
  "top_strengths": ["Strength 1", "Strength 2", "Strength 3"],
  "top_improvements": ["Improvement 1", "Improvement 2", "Improvement 3"],
  "improvement_appendix": [
    {
      "criterion_id": "c1",
      "criterion": "Name of the criterion",
      "what_funder_wants": "What the funder is looking for",
      "how_bid_addresses": "How the bid currently addresses it",
      "whats_missing": "What's missing or weak",
      "example_language": "Suggested text the applicant could use or adapt"
    }
  ]
}
\`\`\`

Guidelines:
- Score each criterion based on ALL evidence across sections, not just one section
- overall_score should be 0-100, reflecting the weighted assessment
- top_strengths and top_improvements should be the 3 highest-impact items
- improvement_appendix should cover every criterion, even those scored Strong (note what makes them strong)
- Be specific with example language — give the applicant something they can use
${!completeDraft ? `
**IMPORTANT — Draft Bid Context:** The applicant has indicated this bid is a work in progress. Not all sections may be complete. When scoring:
- If a criterion is not addressed because the relevant section appears unwritten or incomplete, still score it as "Missing" but frame the summary as guidance (e.g., "This section hasn't been written yet. When you write it, make sure to include…") rather than a criticism.
- Focus improvement_appendix entries for missing criteria on what TO INCLUDE when the applicant writes that section, with practical example language they can build on.
- Weight overall_score, submission_readiness, and top_improvements toward the content that IS present. The applicant knows unwritten sections need writing — help them improve what they've already drafted.
- Use submission_readiness of "Needs revisions" or "Major rework needed" based on the QUALITY of existing content, not the quantity of missing sections.` : ""}

Return ONLY the JSON object, no other text.`;
}
