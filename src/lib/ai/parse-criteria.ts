import Anthropic from "@anthropic-ai/sdk";
import { CriteriaSetSchema, type CriteriaSet } from "@/lib/schemas/criteria";

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
      "sub_questions": ["Specific sub-question 1", "Specific sub-question 2"]
    }
  ]
}

Rules:
- Extract 1-20 criteria from the text
- Use sequential IDs: c1, c2, c3, etc.
- Each criterion should be a clear, assessable statement
- Include sub-questions only if they are explicitly stated or strongly implied
- Include weight only if a percentage or score weighting is mentioned
- If the text is vague, infer reasonable criteria from context
- Do NOT invent criteria that aren't supported by the text`;

export async function parseCriteriaWithAI(rawText: string): Promise<CriteriaSet> {
  const client = new Anthropic();

  const message = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Extract structured evaluation criteria from this funder guidance:\n\n${rawText}`,
      },
    ],
  });

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

  const parsed = JSON.parse(jsonStr);
  return CriteriaSetSchema.parse(parsed);
}
