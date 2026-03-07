import { z } from "zod";
import { callClaude, type ClaudeUsageData } from "./anthropic";
import { logAiUsage } from "./log-usage";

const SYSTEM_PROMPT = `You extract the name of the funding programme or grant scheme from bid/tender documents.

Given the first few hundred words of a bid document (or just its filename), identify the specific fund, programme, or grant scheme the bid is for.

If you cannot identify a specific fund name, set name to "UNKNOWN".

Examples of good fund names:
- Community Ownership Fund
- National Lottery Heritage Fund
- Levelling Up Fund Round 2
- Arts Council National Lottery Project Grants

Do NOT return generic terms like "funding application" or "grant bid".`;

const DetectFundSchema = z.object({ name: z.string() });

const MODEL = "claude-haiku-4-5-20251001";

export async function detectFundName(text: string, userId?: string): Promise<string | null> {
  const result = await callClaude({
    prompt: `Identify the fund/programme name from this bid document content:\n\n${text.slice(0, 2000)}`,
    systemPrompt: SYSTEM_PROMPT,
    schema: DetectFundSchema,
    model: MODEL,
    maxTokens: 100,
    onUsage: (usage: ClaudeUsageData) => {
      void logAiUsage({
        userId,
        pipelineStep: "detect_fund",
        model: MODEL,
        usage,
      });
    },
  });

  const name = result.name.trim();
  if (name === "UNKNOWN" || name.length < 3) return null;

  return name;
}
