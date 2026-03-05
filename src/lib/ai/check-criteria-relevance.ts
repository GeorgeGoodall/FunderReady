import { GoogleGenAI } from "@google/genai";
import { geminiWithRetry } from "./gemini";
import { logAiUsage } from "./log-usage";
import type { TokenUsage } from "./pricing";

const SYSTEM_PROMPT = `You determine whether a web page's text content contains fund/grant evaluation criteria.

Evaluation criteria includes: scoring matrices, assessment criteria, eligibility requirements, funding priorities, what assessors look for, marking schemes, weighting of criteria.

NOT evaluation criteria: general programme descriptions, news articles, FAQs about the application process, contact information, privacy policies, terms of service, staff bios.

Return ONLY valid JSON: { "relevant": true, "confidence": 0.85 }

- "relevant": true if the page contains evaluation criteria, false otherwise
- "confidence": a number between 0 and 1 indicating your confidence`;

let _client: GoogleGenAI | null = null;
function getClient(): GoogleGenAI {
  if (!_client) _client = new GoogleGenAI({ apiKey: process.env.GOOGLE_AI_API_KEY! });
  return _client;
}

const CONTENT_PREVIEW_LENGTH = 3000;

export interface RelevanceResult {
  relevant: boolean;
  confidence: number;
  rawAiResponse: string;
  usage: TokenUsage;
}

export async function checkCriteriaRelevance(
  content: string,
  userId?: string
): Promise<RelevanceResult> {
  const zeroUsage: TokenUsage = { input_tokens: 0, output_tokens: 0 };
  if (!content.trim())
    return { relevant: false, confidence: 0, rawAiResponse: "", usage: zeroUsage };

  const client = getClient();
  const model = "gemini-2.5-flash-lite";

  const userPrompt = `Does this web page content contain fund evaluation criteria?\n\n${content.slice(0, CONTENT_PREVIEW_LENGTH)}`;

  const response = await geminiWithRetry(client, {
    model,
    contents: userPrompt,
    config: { systemInstruction: SYSTEM_PROMPT, maxOutputTokens: 64 },
  });

  const usage: TokenUsage = {
    input_tokens: response.usageMetadata?.promptTokenCount ?? 0,
    output_tokens: response.usageMetadata?.candidatesTokenCount ?? 0,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
  };

  void logAiUsage({
    userId,
    pipelineStep: "check_criteria_relevance",
    model,
    usage,
  });

  const rawAiResponse = response.text ?? "";

  if (!rawAiResponse)
    return { relevant: false, confidence: 0, rawAiResponse, usage };

  try {
    let jsonStr = rawAiResponse.trim();
    const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) jsonStr = jsonMatch[1].trim();

    const parsed = JSON.parse(jsonStr) as {
      relevant: boolean;
      confidence: number;
    };
    return {
      relevant: parsed.relevant === true,
      confidence: parsed.confidence ?? 0,
      rawAiResponse,
      usage,
    };
  } catch {
    return { relevant: false, confidence: 0, rawAiResponse, usage };
  }
}
