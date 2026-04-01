/**
 * Inngest step wrapper for Claude API calls with Zod validation and retry.
 * Use inside Inngest functions instead of callClaude() — Inngest makes the AI
 * call from their infrastructure so Cloudflare never holds the connection open.
 */

import { anthropic as anthropicModel, NonRetriableError } from "inngest";
import type Anthropic from "@anthropic-ai/sdk";
import type { ZodSchema } from "zod";
import { buildTool, TOOL_NAME, type ClaudeUsageData } from "./anthropic";

type CacheBlock = { type: "text"; text: string; cache_control?: { type: "ephemeral" } };

export interface InferWithClaudeOptions<T> {
  prompt: string;
  systemPrompt?: string | CacheBlock[];
  schema: ZodSchema<T>;
  model: string;
  maxTokens: number;
  temperature?: number;
}

export interface InferWithClaudeResult<T> {
  result: T;
  usage: ClaudeUsageData;
}

// Minimal duck type — accepts the step object from any Inngest function handler
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type InferStep = { ai: { infer(id: string, options: any): Promise<any> } };

function extractUsage(message: Anthropic.Message): ClaudeUsageData {
  const u = message.usage as unknown as Record<string, number>;
  return {
    input_tokens: message.usage.input_tokens,
    output_tokens: message.usage.output_tokens,
    cache_creation_input_tokens: u.cache_creation_input_tokens ?? 0,
    cache_read_input_tokens: u.cache_read_input_tokens ?? 0,
  };
}

function addUsage(a: ClaudeUsageData, b: ClaudeUsageData): ClaudeUsageData {
  return {
    input_tokens: a.input_tokens + b.input_tokens,
    output_tokens: a.output_tokens + b.output_tokens,
    cache_creation_input_tokens: a.cache_creation_input_tokens + b.cache_creation_input_tokens,
    cache_read_input_tokens: a.cache_read_input_tokens + b.cache_read_input_tokens,
  };
}

export async function inferWithClaude<T>(
  step: InferStep,
  stepId: string,
  options: InferWithClaudeOptions<T>
): Promise<InferWithClaudeResult<T>> {
  const { prompt, systemPrompt, schema, model, maxTokens, temperature } = options;
  const tool = buildTool(schema);

  function buildInferOptions(messages: Anthropic.MessageParam[]) {
    return {
      model: anthropicModel({
        model,
        defaultParameters: {
          max_tokens: maxTokens,
          ...(temperature !== undefined ? { temperature } : {}),
        },
      }),
      body: {
        messages,
        ...(systemPrompt ? { system: systemPrompt } : {}),
        tools: [tool],
        tool_choice: { type: "tool", name: TOOL_NAME },
      },
    };
  }

  const message: Anthropic.Message = await step.ai.infer(
    stepId,
    buildInferOptions([{ role: "user", content: prompt }])
  );

  const toolBlock = message.content.find((b) => b.type === "tool_use");
  if (!toolBlock || toolBlock.type !== "tool_use") {
    throw new NonRetriableError("inferWithClaude: no tool use block in response");
  }

  const parsed = schema.safeParse(toolBlock.input);
  if (parsed.success) {
    return { result: parsed.data, usage: extractUsage(message) };
  }

  // Validation failed — retry with error feedback (same strategy as callClaude)
  const errors = parsed.error.issues
    .map((i) => `${i.path.join(".")}: ${i.message}`)
    .join("\n");

  const retryMessage: Anthropic.Message = await step.ai.infer(
    `${stepId}-retry`,
    buildInferOptions([
      { role: "user", content: prompt },
      { role: "assistant", content: message.content },
      {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: toolBlock.id,
            is_error: true,
            content: `Validation errors:\n${errors}\n\nPlease call the tool again with corrected data.`,
          },
        ],
      },
    ])
  );

  const retryToolBlock = retryMessage.content.find((b) => b.type === "tool_use");
  if (!retryToolBlock || retryToolBlock.type !== "tool_use") {
    throw new NonRetriableError("inferWithClaude: retry did not return a tool use block");
  }

  const retryParsed = schema.safeParse(retryToolBlock.input);
  if (retryParsed.success) {
    return {
      result: retryParsed.data,
      usage: addUsage(extractUsage(message), extractUsage(retryMessage)),
    };
  }

  throw new NonRetriableError(
    `inferWithClaude validation failed after retry. ` +
      `Original errors: ${errors}. ` +
      `Retry errors: ${retryParsed.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join(", ")}`
  );
}
