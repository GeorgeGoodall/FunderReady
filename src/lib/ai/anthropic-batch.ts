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
  schema: ZodSchema<T>,
  temperature?: number
): Promise<BatchSubmitResult> {
  if (requests.length === 0) {
    throw new Error("submitAnswerBatch: requests array must not be empty");
  }
  const tool = buildTool(schema);
  const client = getClient();

  const batch = await client.messages.batches.create({
    requests: requests.map((req) => ({
      custom_id: req.questionId,
      params: {
        model,
        max_tokens: maxTokens,
        ...(temperature !== undefined ? { temperature } : {}),
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

// Re-export ClaudeUsageData so callers of parseBatchResults can type-annotate ParsedBatchSuccess
export type { ClaudeUsageData };

export interface ParsedBatchSuccess<T> {
  questionId: string;
  analysis: T;
  usage: ClaudeUsageData;
}

export interface ParseBatchResultsOutput<T> {
  successes: ParsedBatchSuccess<T>[];
  failures: string[];
}

export async function parseBatchResults<T>(
  batchId: string,
  schema: ZodSchema<T>
): Promise<ParseBatchResultsOutput<T>> {
  const client = getClient();
  const successes: ParsedBatchSuccess<T>[] = [];
  const failures: string[] = [];

  for await (const item of await client.messages.batches.results(batchId)) {
    const { custom_id: questionId, result } = item as {
      custom_id: string;
      result: { type: string; message?: Anthropic.Message; error?: unknown };
    };

    if (result.type !== "succeeded" || !result.message) {
      failures.push(questionId);
      continue;
    }

    const toolBlock = result.message.content.find(
      (b: Anthropic.ContentBlock) => b.type === "tool_use"
    );

    if (!toolBlock || toolBlock.type !== "tool_use") {
      failures.push(questionId);
      continue;
    }

    const parsed = schema.safeParse(toolBlock.input);
    if (!parsed.success) {
      failures.push(questionId);
      continue;
    }

    const u = result.message.usage as unknown as Record<string, number>;
    successes.push({
      questionId,
      analysis: parsed.data,
      usage: {
        input_tokens: result.message.usage.input_tokens,
        output_tokens: result.message.usage.output_tokens,
        cache_creation_input_tokens: u.cache_creation_input_tokens ?? 0,
        cache_read_input_tokens: u.cache_read_input_tokens ?? 0,
      },
    });
  }

  return { successes, failures };
}
