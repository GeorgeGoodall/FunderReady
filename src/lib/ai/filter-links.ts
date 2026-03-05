import { GoogleGenAI } from "@google/genai";
import { geminiWithRetry } from "./gemini";
import { logAiUsage } from "./log-usage";
import type { TokenUsage } from "./pricing";

export interface LinkCandidate {
  url: string;
  text: string;
  context: string;
}

const SYSTEM_PROMPT = `You analyse lists of hyperlinks from funder/grant-maker web pages.

Given a numbered list of links (each with its text, URL, and surrounding page context), identify which links are likely to lead to pages containing fund evaluation criteria, scoring matrices, assessment guidance, or eligibility requirements.

Return ONLY valid JSON: { "relevant_indices": [0, 2, 5] }

The indices are 0-based and refer to the link positions in the input list.

Rules:
- Include links about: criteria, scoring, assessment, eligibility, guidance, how to apply, what we look for, outcomes
- Exclude links about: contact us, privacy, terms, news, blog, social media, careers, login, download logos, newsletters
- When link text is generic (e.g. "Read more", "Learn more"), use the surrounding context to decide
- When unsure, include the link (false positives are better than false negatives)
- Return an empty array if no links are relevant`;

let _client: GoogleGenAI | null = null;
function getClient(): GoogleGenAI {
  if (!_client) _client = new GoogleGenAI({ apiKey: process.env.GOOGLE_AI_API_KEY! });
  return _client;
}

export interface FilterLinksResult {
  selected: LinkCandidate[];
  allLinks: LinkCandidate[];
  selectedIndices: number[];
  rawAiResponse: string;
  usage: TokenUsage;
}

export async function filterLinksForCriteria(
  links: LinkCandidate[],
  userId?: string
): Promise<FilterLinksResult> {
  const zeroUsage: TokenUsage = { input_tokens: 0, output_tokens: 0 };
  if (links.length === 0)
    return { selected: [], allLinks: links, selectedIndices: [], rawAiResponse: "", usage: zeroUsage };

  const client = getClient();
  const model = "gemini-2.5-flash-lite";

  const linksDescription = links
    .map(
      (link, i) =>
        `[${i}] URL: ${link.url}\n    Text: "${link.text}"\n    Context: "${link.context}"`
    )
    .join("\n\n");

  const userPrompt = `Which of these links are likely to lead to fund evaluation criteria or assessment guidance?\n\n${linksDescription}`;

  const response = await geminiWithRetry(client, {
    model,
    contents: userPrompt,
    config: { systemInstruction: SYSTEM_PROMPT, maxOutputTokens: 256 },
  });

  const usage: TokenUsage = {
    input_tokens: response.usageMetadata?.promptTokenCount ?? 0,
    output_tokens: response.usageMetadata?.candidatesTokenCount ?? 0,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
  };

  void logAiUsage({
    userId,
    pipelineStep: "filter_links",
    model,
    usage,
  });

  const rawAiResponse = response.text ?? "";

  if (!rawAiResponse)
    return { selected: [], allLinks: links, selectedIndices: [], rawAiResponse, usage };

  try {
    let jsonStr = rawAiResponse.trim();
    const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) jsonStr = jsonMatch[1].trim();

    const parsed = JSON.parse(jsonStr) as { relevant_indices: number[] };
    if (!Array.isArray(parsed.relevant_indices))
      return { selected: [], allLinks: links, selectedIndices: [], rawAiResponse, usage };

    const selectedIndices = parsed.relevant_indices.filter(
      (i) => i >= 0 && i < links.length
    );
    return {
      selected: selectedIndices.map((i) => links[i]),
      allLinks: links,
      selectedIndices,
      rawAiResponse,
      usage,
    };
  } catch {
    return { selected: [], allLinks: links, selectedIndices: [], rawAiResponse, usage };
  }
}
