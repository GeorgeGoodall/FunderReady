/**
 * Anthropic Message Batches API client.
 * Submits multiple answer analysis requests at once — 50% cheaper than real-time calls.
 * Each batch request is independently retried via inferWithClaude if it fails.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { ZodSchema } from "zod";
import { buildTool, TOOL_NAME, type ClaudeUsageData } from "./anthropic";

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_client) _client = new Anthropic();
  return _client;
}

export interface AnswerBatchRequest {
  questionId: string;
  systemPrompt: string | Array<{ type: "text"; text: string; cache_control?: { type: "ephemeral" } }>;
  userPrompt: string;
}

export interface BatchSubmitResult {
  batchId: string;
}

export interface BatchPollResult {
  done: boolean;
}

export async function submitAnswerBatch<T>(
  requests: AnswerBatchRequest[],
  model: string,
  maxTokens: number,
  schema: ZodSchema<T>
): Promise<BatchSubmitResult> {
  const tool = buildTool(schema);
  const client = getClient();

  const batch = await client.messages.batches.create({
    requests: requests.map((req) => ({
      custom_id: req.questionId,
      params: {
        model,
        max_tokens: maxTokens,
        messages: [{ role: "user" as const, content: req.userPrompt }],
        system: req.systemPrompt as Anthropic.MessageCreateParamsNonStreaming["system"],
        tools: [tool] as Anthropic.Tool[],
        tool_choice: { type: "tool" as const, name: TOOL_NAME },
      },
    })),
  });

  return { batchId: batch.id };
}

export async function pollBatch(batchId: string): Promise<BatchPollResult> {
  const client = getClient();
  const batch = await client.messages.batches.retrieve(batchId);
  return { done: batch.processing_status === "ended" };
}

// Re-export ClaudeUsageData so Task 4 (parseBatchResults) can use it from this module
export type { ClaudeUsageData };
