/**
 * Prompt templates for the form-based application review pipeline.
 * Reuses shared components from prompt-templates.ts.
 */

import type { AnswerAnalysis } from "./schemas";
import {
  SYSTEM_PERSONA,
  SCORING_RUBRIC,
  FEW_SHOT_COMMENTS,
  COMMENT_CATEGORIES_DESC,
  ANTI_HALLUCINATION,
  formatCriteria,
  type Criterion,
} from "./prompt-templates";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AnswerContext {
  question_id: string;
  question_text: string;
  answer_text: string;
  field_type?: string;
  guidance?: string;
  word_count_min?: number;
  word_count_max?: number;
  priority?: number;
}

type CacheBlock = { type: "text"; text: string; cache_control?: { type: "ephemeral" } };

// ---------------------------------------------------------------------------
// Anti-hallucination rules adapted for form answers (no paragraph_id)
// ---------------------------------------------------------------------------

const ANSWER_ANTI_HALLUCINATION = `
## Critical Rules

1. Only cite evidence that appears in the answer text. If a criterion is not addressed, say "Not addressed" — do not invent or assume content.
2. If you are unsure whether something is covered, flag it as "Possibly addressed — verify" rather than making a definitive claim.
3. Every target_text value MUST be an exact quote from the answer text. Do not paraphrase or modify quotes.
4. Weight your feedback toward the highest-impact improvements. If you identify many issues, make clear which 3-5 would most improve the answer's chances.`;

// ---------------------------------------------------------------------------
// Cached system prompt for answer analysis
// ---------------------------------------------------------------------------

export function buildAnswerAnalysisSystemPrompt(criteria: Criterion[]): CacheBlock[] {
  const criteriaText = formatCriteria(criteria);
  return [
    {
      type: "text" as const,
      text: `${SYSTEM_PERSONA}\n\n${SCORING_RUBRIC}\n\n${FEW_SHOT_COMMENTS}\n\n${COMMENT_CATEGORIES_DESC}\n\n${ANSWER_ANTI_HALLUCINATION}\n\n## Funder Criteria\n\n${criteriaText}`,
      cache_control: { type: "ephemeral" as const },
    },
  ];
}

// ---------------------------------------------------------------------------
// Per-answer analysis prompt
// ---------------------------------------------------------------------------

export function buildAnswerAnalysisPrompt(
  answer: AnswerContext
): string {
  const wordCount = answer.answer_text.trim().split(/\s+/).length;

  let wordLimitSection = "";
  if (answer.word_count_max) {
    const pct = wordCount / answer.word_count_max;
    wordLimitSection = `\n## Word Count\n\nThis answer is ${wordCount} words out of a ${answer.word_count_max}-word limit (${Math.round(pct * 100)}% utilised).`;
    if (answer.word_count_min && wordCount < answer.word_count_min) {
      wordLimitSection += `\nThis answer is BELOW the minimum word count of ${answer.word_count_min}. The applicant needs to add more content.`;
    }
    if (pct > 0.85) {
      wordLimitSection += "\nPrioritise CONCISENESS comments. Do NOT suggest adding content unless replacing something of equal or greater length.";
    } else if (pct >= 0.7) {
      wordLimitSection += "\nBalance suggestions for additions with trimming filler.";
    }
  }

  let guidanceSection = "";
  if (answer.guidance) {
    guidanceSection = `\n## Funder Guidance for This Question\n\n${answer.guidance}\n\nIMPORTANT: Treat the funder guidance above as mandatory requirements for this question. The answer MUST address every point raised in the guidance. Score down for any guidance points not addressed, and flag missing guidance points as weaknesses.`;
  }

  let prioritySection = "";
  if (answer.priority) {
    prioritySection = `\nPriority/weight: ${answer.priority}/5`;
  }

  const constrainedFieldTypes = new Set(["dropdown", "select", "radio", "checkbox", "yes_no", "date", "number"]);
  let fieldTypeSection = "";
  if (answer.field_type && constrainedFieldTypes.has(answer.field_type)) {
    fieldTypeSection = `\n## Field Type: ${answer.field_type}\n\nIMPORTANT: This question used a constrained input (${answer.field_type}). The applicant selected from predefined options and could NOT provide additional free-text detail. Do NOT criticise the answer for being brief, lacking detail, or failing to elaborate — the applicant had no ability to do so. Evaluate only whether the selected option is appropriate for the question. Keep inline_comments minimal or empty for constrained fields.`;
  }

  return `## Task: Analyse Answer to Question "${answer.question_id}"

## Question

${answer.question_text}${prioritySection}${fieldTypeSection}${guidanceSection}${wordLimitSection}

## Answer Text

${answer.answer_text}

## Required Output

Return a JSON object matching this exact structure:

\`\`\`json
{
  "question_id": "${answer.question_id}",
  "inline_comments": [
    {
      "target_text": "exact quote from the answer text",
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
  "answer_score": "Strong|Fair|Needs Improvement|Missing",
  "word_count_assessment": {
    "actual": ${wordCount},
    "limit": ${answer.word_count_max ?? "null"},
    "status": "${answer.word_count_max ? (wordCount > answer.word_count_max ? "over_limit" : "within_limit") : "no_limit"}"
  }
}
\`\`\`

Guidelines:
- Aim for 2-6 inline comments depending on answer length and quality
- target_text must be an EXACT quote from the answer text (at least 5 words)
- Cover all relevant criteria in criteria_relevance
- Be specific — avoid generic feedback
- Score the answer holistically based on how well it addresses the question AND the funder's criteria

Return ONLY the JSON object, no other text.`;
}

// ---------------------------------------------------------------------------
// Cross-reference prompt (uses question_ids instead of section_ids)
// ---------------------------------------------------------------------------

export function formatAnswerAnalysesSummary(
  analyses: AnswerAnalysis[],
  questions: Array<{ id: string; question: string }>
): string {
  return analyses
    .map((a) => {
      const q = questions.find((q) => q.id === a.question_id);
      const relevance = a.criteria_relevance
        .filter((r) => r.relevance !== "not_relevant")
        .map((r) => {
          const note = r.notes ? ` — ${r.notes}` : "";
          return `${r.criterion_id} (${r.relevance}${note})`;
        })
        .join(", ");
      const lines = [`## ${a.question_id}: ${q?.question ?? "Unknown question"}`];
      lines.push(`Score: ${a.answer_score}`);
      if (relevance) lines.push(`Criteria: ${relevance}`);
      if (a.strengths.length) lines.push(`Strengths: ${a.strengths.join("; ")}`);
      if (a.weaknesses.length) lines.push(`Weaknesses: ${a.weaknesses.join("; ")}`);
      if (a.inline_comments.length) {
        const commentSummaries = a.inline_comments
          .map((c) => `- [${c.category}] ${c.issue}`)
          .join("\n");
        lines.push(`Issues flagged:\n${commentSummaries}`);
      }
      return lines.join("\n");
    })
    .join("\n\n");
}

export function buildApplicationCrossReferencePrompt(
  analyses: AnswerAnalysis[],
  questions: Array<{ id: string; question: string }>,
  criteria: Criterion[],
  disabledQuestions: Array<{ question_id: string; question_text: string }> = []
): string {
  const criteriaText = formatCriteria(criteria);
  const analysesText = formatAnswerAnalysesSummary(analyses, questions);

  const questionsList = questions
    .map((q) => `${q.id}: "${q.question}"`)
    .join("\n");

  let disabledSection = "";
  if (disabledQuestions.length > 0) {
    const list = disabledQuestions
      .map((q, i) => `${i + 1}. ${q.question_id}: "${q.question_text}"`)
      .join("\n");
    disabledSection = `\n## Questions Marked Not Applicable\n\nThe following questions were marked not applicable by the applicant and excluded from the review:\n\n${list}\n\nIf any criteria appear unaddressed, it may be because the relevant question was disabled. Do not flag the absence of these questions as a gap or missing criterion — they were intentionally excluded.\n`;
  }

  return `${SYSTEM_PERSONA}

## Task: Cross-Reference Pass

You have already analysed each answer in this application individually. Now look at the application holistically to find issues that are only visible across answers.

## Funder Criteria

${criteriaText}

## Application Questions

${questionsList}
${disabledSection}
## Answer Analyses (from prior review)

${analysesText}

## What to Look For

1. **Contradictions** — Numbers, claims, or commitments that conflict between answers
2. **Gaps** — Criteria partially addressed across answers but never fully in one place
3. **Missing criteria** — Criteria not addressed anywhere in the application
4. **Inconsistencies** — Terminology, tone, or naming that shifts between answers
5. **Repetition without new evidence** — Restating the same point in multiple answers without strengthening it
6. **Misplaced content** — Content in one answer that belongs in another question's answer

## Required Output

Return a JSON object:

\`\`\`json
{
  "findings": [
    {
      "type": "contradiction|gap|missing_criterion|unresolved_reference|inconsistency|repetition",
      "description": "Clear description of the issue",
      "sections_involved": ["q1", "q3"],
      "criteria_involved": ["c1"],
      "severity": "high|medium|low",
      "suggestion": "How to fix this"
    }
  ],
  "overall_coherence": "strong|adequate|weak",
  "summary": "2-3 sentence summary of the application's overall coherence"
}
\`\`\`

Note: Use question IDs (q1, q2, etc.) in "sections_involved" to reference answers.

Return ONLY the JSON object, no other text.`;
}

// ---------------------------------------------------------------------------
// Scoring prompt (produces both answer_scores and criteria_scores)
// ---------------------------------------------------------------------------

export function buildApplicationScoringPrompt(
  analyses: AnswerAnalysis[],
  crossReference: unknown,
  questions: Array<{ id: string; question: string }>,
  criteria: Criterion[],
  overallWordLimit?: number,
  disabledQuestions: Array<{ question_id: string; question_text: string }> = []
): string {
  const criteriaText = formatCriteria(criteria);
  const analysesText = formatAnswerAnalysesSummary(analyses, questions);

  // Compact cross-ref JSON, limit findings
  const crossRefObj = crossReference as { findings?: unknown[] };
  const trimmedCrossRef = crossRefObj.findings && crossRefObj.findings.length > 20
    ? { ...crossRefObj, findings: crossRefObj.findings.slice(0, 20) }
    : crossReference;
  const crossRefText = JSON.stringify(trimmedCrossRef);

  let wordCountSection = "";
  if (overallWordLimit) {
    const totalWords = analyses.reduce(
      (sum, a) => sum + (a.word_count_assessment?.actual ?? 0),
      0
    );
    wordCountSection = `\n## Word Count Summary\n\nTotal words across all answers: ${totalWords}\nOverall word limit: ${overallWordLimit}\nUsage: ${Math.round((totalWords / overallWordLimit) * 100)}%\n`;
  }

  let disabledNote = "";
  if (disabledQuestions.length > 0) {
    const list = disabledQuestions.map((q) => `- ${q.question_id}: "${q.question_text}"`).join("\n");
    disabledNote = `\n## Excluded Questions (Not Applicable)\n\nThe following questions were marked not applicable and excluded from this review:\n\n${list}\n\nScore criteria based only on enabled answers. Criteria with no coverage from enabled answers will score as Missing — this is expected when related questions have been disabled.\n`;
  }

  return `${SYSTEM_PERSONA}

${SCORING_RUBRIC}

## Task: Final Scoring & Synthesis

You have completed a detailed answer-by-answer analysis and a cross-reference pass. Now produce the final scoring.

## Funder Criteria

${criteriaText}

## Answer Analyses

${analysesText}

## Cross-Reference Findings

${crossRefText}
${disabledNote}${wordCountSection}
## Required Output

Return a JSON object:

\`\`\`json
{
  "answer_scores": [
    {
      "question_id": "q1",
      "question_text": "The question text",
      "score": "Strong|Fair|Needs Improvement|Missing",
      "summary": "1-2 sentence summary of this answer's quality"
    }
  ],
  "criteria_scores": [
    {
      "criterion_id": "c1",
      "criterion": "Name of the criterion",
      "score": "Strong|Fair|Needs Improvement|Missing",
      "bid_evidence": ["Answer q1: specific evidence cited"],
      "gaps": ["What's missing or weak"],
      "summary": "1-2 sentence summary of how the application addresses this criterion"
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
      "how_bid_addresses": "How the application currently addresses it",
      "whats_missing": "What's missing or weak",
      "example_language": "Suggested text the applicant could use or adapt"
    }
  ]
}
\`\`\`

Guidelines:
- Include an answer_score for EVERY question that was analysed
- Score each criterion based on ALL evidence across answers, not just one answer
- overall_score should be 0-100, reflecting the weighted assessment
- top_strengths and top_improvements should be the 3 highest-impact items
- improvement_appendix should cover every criterion, even those scored Strong
- Be specific with example language — give the applicant something they can use
- Reference answers by question_id (e.g., "Answer q1: ...")

Return ONLY the JSON object, no other text.`;
}
