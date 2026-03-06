import { ParseCriteriaResponseSchema, type ParseCriteriaResponse } from "@/lib/schemas/criteria";
import type { ZodSchema } from "zod";
import { callClaude, type ClaudeUsageData } from "./anthropic";
import { logAiUsage } from "./log-usage";

const SYSTEM_PROMPT = `You are an expert at analysing funder criteria for bid/tender applications.

Given raw text (copied from a funder's guidance document, application form, or scoring matrix), extract structured evaluation criteria.

Rules:
- Extract 1-20 criteria from the text
- Use sequential IDs: c1, c2, c3, etc.
- Each criterion should be a clear, assessable statement
- Include sub-questions only if they are explicitly stated or strongly implied
- For each sub_question, set "required" to true if the funder explicitly requires it (uses language like "must", "should", "required", "essential") or false if it is optional, nice-to-have, or conditional (uses language like "if applicable", "where relevant", "optional", "may")
- Default to required: true if the intent is ambiguous
- Include weight only if a percentage or score weighting is mentioned
- If the text is vague, infer reasonable criteria from context
- Do NOT invent criteria that aren't supported by the text
- If the text mentions application opening dates, closing dates, or deadlines, extract them as ISO 8601 datetime strings (e.g. "2026-04-30T00:00:00Z"). Only include dates you are confident about.`;

const MODEL = "claude-sonnet-4-6";

export async function parseCriteriaWithAI(rawText: string, userId?: string): Promise<ParseCriteriaResponse> {
  return callClaude({
    prompt: `Extract structured evaluation criteria from this funder guidance:\n\n${rawText}`,
    systemPrompt: SYSTEM_PROMPT,
    schema: ParseCriteriaResponseSchema as ZodSchema<ParseCriteriaResponse>,
    model: MODEL,
    maxTokens: 8192,
    onUsage: (usage: ClaudeUsageData, isRetry: boolean) => {
      if (!isRetry) {
        void logAiUsage({
          userId,
          pipelineStep: "parse_criteria",
          model: MODEL,
          usage,
        });
      }
    },
  });
}
