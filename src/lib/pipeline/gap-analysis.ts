import type { AnswerAnalysis } from "./schemas";
import type { Criterion } from "./prompt-templates";

const GAP_ANALYSIS_SYSTEM_PROMPT = `You are a funding application reviewer analysing a single free-form document against a set of scoring criteria.

Your task is to identify gaps and missing coverage — criteria that are not addressed or only partially addressed in the document.

Only produce findings of these two types:
- missing_criterion: a criterion that is not addressed anywhere in the document
- gap: a criterion that is only partially touched — some relevant content exists but key aspects are absent

Do not produce contradiction, inconsistency, repetition, or resolved_weakness findings — those require multiple documents to compare.

The input is a single free-form document, not a structured set of questions.

You MUST respond with a JSON object in exactly this format:
{
  "findings": [
    {
      "type": "missing_criterion",
      "description": "The document does not address...",
      "sections_involved": ["c1"],
      "severity": "high",
      "confidence": "high"
    }
  ],
  "overall_coherence": "adequate",
  "summary": "The document covers X well but is missing Y and Z."
}

Rules:
- findings: array of gap/missing_criterion objects (may be empty if no gaps found)
- overall_coherence: MUST be exactly one of: "strong", "adequate", or "weak"
- summary: a single sentence summarising the key gaps
- Do not add any fields beyond those shown above`;

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

  const userPrompt = `Scoring criteria:\n${criteriaList}\n\nCriteria coverage analysis:\n${relevanceSummary}${weaknessesSummary}\n\nIdentify missing_criterion and gap findings for the criteria above. Return the JSON object as specified.`;

  return { systemPrompt: GAP_ANALYSIS_SYSTEM_PROMPT, userPrompt };
}
