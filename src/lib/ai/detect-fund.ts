import Anthropic from "@anthropic-ai/sdk";

const SYSTEM_PROMPT = `You extract the name of the funding programme or grant scheme from bid/tender documents.

Given the first few hundred words of a bid document (or just its filename), identify the specific fund, programme, or grant scheme the bid is for.

Return ONLY the fund/programme name as a plain string. No quotes, no explanation, no formatting.
If you cannot identify a specific fund name, return exactly: UNKNOWN

Examples of good fund names:
- Community Ownership Fund
- National Lottery Heritage Fund
- Levelling Up Fund Round 2
- Arts Council National Lottery Project Grants

Do NOT return generic terms like "funding application" or "grant bid".`;

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_client) _client = new Anthropic();
  return _client;
}

export async function detectFundName(text: string): Promise<string | null> {
  const client = getClient();

  const message = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 100,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Identify the fund/programme name from this bid document content:\n\n${text.slice(0, 2000)}`,
      },
    ],
  });

  const textBlock = message.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") return null;

  const result = textBlock.text.trim();
  if (result === "UNKNOWN" || result.length < 3) return null;

  return result;
}
