import type { AnswerAnalysis } from "./schemas";
import type { Criterion } from "./prompt-templates";

const GAP_ANALYSIS_SYSTEM_PROMPT = `You are a funding application reviewer analysing a single free-form document against a set of scoring criteria.

Your task is to identify gaps and missing coverage — criteria that are not addressed or only partially addressed in the document.

Only produce findings of these two types:
- missing_criterion: a criterion that is not addressed anywhere in the document
- gap: a criterion that is only partially touched — some relevant content exists but key aspects are absent

Do not produce contradiction, inconsistency, repetition, or resolved_weakness findings — those require multiple documents to compare.

The input is a single free-form document, not a structured set of questions.`;

export function buildGapAnalysisPrompt(
  answerAnalysis: AnswerAnalysis | null,
  criteria: Criterion[]
): { systemPrompt: string; userPrompt: string } {
  const criteriaList = criteria
    .map((c) => `[${c.id}] ${c.criterion}`)
    .join("\n");

  // Summarise criteria relevance from the answer analysis
  const relevanceSummary = answerAnalysis
    ? answerAnalysis.criteria_relevance
        .map((r) => `- Criterion ${r.criterion_id}: ${r.relevance}`)
        .join("\n")
    : "No analysis available.";

  const weaknessesSummary =
    answerAnalysis?.weaknesses?.length
      ? `\nDocument weaknesses identified:\n${answerAnalysis.weaknesses.map((w) => `- ${w}`).join("\n")}`
      : "";

  const userPrompt = `Scoring criteria:\n${criteriaList}\n\nCriteria coverage analysis:\n${relevanceSummary}${weaknessesSummary}\n\nIdentify missing_criterion and gap findings only. Return your analysis as a JSON object with:\n- findings: array of objects, each with: type (one of "missing_criterion" or "gap"), description (string), sections_involved (array of criterion IDs), severity ("low" | "medium" | "high"), confidence ("low" | "medium" | "high")\n- overall_coherence: one of "strong", "adequate", or "weak"\n- summary: a brief string summary of the key gaps found`;

  return { systemPrompt: GAP_ANALYSIS_SYSTEM_PROMPT, userPrompt };
}
