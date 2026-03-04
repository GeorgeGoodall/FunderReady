import Anthropic from "@anthropic-ai/sdk";
import { CriteriaSetSchema, type CriteriaSet } from "@/lib/schemas/criteria";
import { logAiUsage } from "./log-usage";

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_client) _client = new Anthropic();
  return _client;
}

const SYSTEM_PROMPT = `You are an expert at analysing funder criteria for bid/tender applications.

Given raw text (copied from a funder's guidance document, application form, or scoring matrix), extract structured evaluation criteria.

Return ONLY valid JSON matching this schema:
{
  "name": "Short name for this criteria set",
  "description": "Brief description of the funding programme",
  "criteria": [
    {
      "id": "c1",
      "criterion": "Clear statement of what the funder is looking for",
      "weight": "25%" (if mentioned, otherwise omit),
      "sub_questions": [
        { "text": "Specific sub-question 1", "required": true },
        { "text": "Specific sub-question 2", "required": false }
      ]
    }
  ]
}

Rules:
- Extract 1-20 criteria from the text
- Use sequential IDs: c1, c2, c3, etc.
- Each criterion should be a clear, assessable statement
- Include sub-questions only if they are explicitly stated or strongly implied
- For each sub_question, set "required" to true if the funder explicitly requires it (uses language like "must", "should", "required", "essential") or false if it is optional, nice-to-have, or conditional (uses language like "if applicable", "where relevant", "optional", "may")
- Default to required: true if the intent is ambiguous
- Include weight only if a percentage or score weighting is mentioned
- If the text is vague, infer reasonable criteria from context
- Do NOT invent criteria that aren't supported by the text`;

export async function parseCriteriaWithAI(rawText: string, userId?: string): Promise<CriteriaSet> {
  const client = getClient();
  const model = "claude-sonnet-4-6";

  const message = await client.messages.create({
    model,
    max_tokens: 8192,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Extract structured evaluation criteria from this funder guidance:\n\n${rawText}`,
      },
    ],
  });

  void logAiUsage({
    userId,
    pipelineStep: "parse_criteria",
    model,
    usage: {
      input_tokens: message.usage.input_tokens,
      output_tokens: message.usage.output_tokens,
      cache_creation_input_tokens: (message.usage as unknown as Record<string, number>).cache_creation_input_tokens ?? 0,
      cache_read_input_tokens: (message.usage as unknown as Record<string, number>).cache_read_input_tokens ?? 0,
    },
  });

  console.log(`[parse-criteria] stop_reason=${message.stop_reason}, usage: input=${message.usage.input_tokens} output=${message.usage.output_tokens}`);

  if (message.stop_reason === "max_tokens") {
    console.warn("[parse-criteria] Response truncated — output hit max_tokens limit");
  }

  const textBlock = message.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text response from AI");
  }

  // Extract JSON from response (may be wrapped in markdown code block)
  let jsonStr = textBlock.text.trim();
  const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1].trim();
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (err) {
    console.error("[parse-criteria] JSON parse failed. Raw AI response (first 500 chars):", jsonStr.slice(0, 500));
    console.error("[parse-criteria] Raw AI response (last 200 chars):", jsonStr.slice(-200));
    throw err;
  }

  try {
    return CriteriaSetSchema.parse(parsed);
  } catch (err) {
    console.error("[parse-criteria] Zod validation failed. Parsed JSON keys:", Object.keys(parsed as Record<string, unknown>));
    throw err;
  }
}
