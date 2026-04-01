/**
 * Claude API wrapper using tool use for structured JSON output.
 * Falls back to text parsing if tool use doesn't return a tool call.
 */

import Anthropic from "@anthropic-ai/sdk";
import { NonRetriableError } from "inngest";
import type { ZodSchema } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

// ---------------------------------------------------------------------------
// Permissive JSON parser (fallback for text responses)
// ---------------------------------------------------------------------------

function fixUnescapedQuotes(text: string): string {
  const structural = new Set([":", ",", "}", "]", "{", "["]);
  const result: string[] = [];
  let inString = false;
  let i = 0;

  while (i < text.length) {
    const ch = text[i];

    if (!inString) {
      result.push(ch);
      if (ch === '"') inString = true;
      i++;
    } else {
      if (ch === "\\") {
        result.push(ch);
        if (i + 1 < text.length) {
          result.push(text[i + 1]);
          i += 2;
        } else {
          i++;
        }
      } else if (ch === '"') {
        let ahead = i + 1;
        while (ahead < text.length && (text[ahead] === " " || text[ahead] === "\t")) ahead++;
        const nextChar = ahead < text.length ? text[ahead] : "";
        const nextIsNewline = nextChar === "\n" || nextChar === "\r";

        if (structural.has(nextChar) || nextIsNewline || ahead >= text.length) {
          result.push(ch);
          inString = false;
        } else {
          result.push('\\"');
        }
        i++;
      } else if (ch === "\n" || ch === "\r") {
        if (ch === "\r" && i + 1 < text.length && text[i + 1] === "\n") {
          result.push("\\n");
          i += 2;
        } else {
          result.push("\\n");
          i++;
        }
      } else {
        result.push(ch);
        i++;
      }
    }
  }

  return result.join("");
}

function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  const match = trimmed.match(/^```(?:json)?\s*\n?([\s\S]+)\n?```\s*$/);
  if (match) return match[1].trim();
  if (trimmed.startsWith("```")) {
    const firstNewline = trimmed.indexOf("\n");
    if (firstNewline === -1) return trimmed;
    const afterFirstLine = trimmed.substring(firstNewline + 1);
    const lastFence = afterFirstLine.lastIndexOf("```");
    if (lastFence !== -1) return afterFirstLine.substring(0, lastFence).trim();
    return afterFirstLine.trim();
  }
  return trimmed;
}

export function parseJsonPermissive(text: string): unknown {
  const cleaned = stripCodeFences(text);

  try {
    return JSON.parse(cleaned);
  } catch {
    let fixed = cleaned.replace(/"((?:[^"\\]|\\[\s\S]|\r|\n)*)"/g, (_match, content: string) => {
      const escaped = content
        .replace(/\r\n/g, "\\n")
        .replace(/\n/g, "\\n")
        .replace(/\r/g, "\\r")
        .replace(/\t/g, "\\t");
      return `"${escaped}"`;
    });
    try {
      return JSON.parse(fixed);
    } catch {
      fixed = fixUnescapedQuotes(cleaned);
      return JSON.parse(fixed);
    }
  }
}

// ---------------------------------------------------------------------------
// Claude API call with tool use for structured output
// ---------------------------------------------------------------------------

type CacheBlock = { type: "text"; text: string; cache_control?: { type: "ephemeral" } };

export interface ClaudeUsageData {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
}

interface CallClaudeOptions<T> {
  prompt: string;
  systemPrompt?: string | CacheBlock[];
  schema: ZodSchema<T>;
  model: string;
  maxTokens: number;
  /** When true, return null on max_tokens truncation instead of throwing */
  allowPartial?: boolean;
  /** Called after each Claude API call with token usage data */
  onUsage?: (usage: ClaudeUsageData, isRetry: boolean) => void;
  /** Sampling temperature (0 = deterministic). Omitted from API call when undefined. */
  temperature?: number;
}

export const TOOL_NAME = "structured_output";

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_client) _client = new Anthropic();
  return _client;
}

export function buildTool<T>(schema: ZodSchema<T>): Anthropic.Tool {
  const jsonSchema = zodToJsonSchema(schema, { target: "openApi3" });
  return {
    name: TOOL_NAME,
    description: "Return the structured analysis result",
    input_schema: jsonSchema as Anthropic.Tool["input_schema"],
  };
}

// ---------------------------------------------------------------------------
// Error classification — transient errors should retry, permanent should not
// ---------------------------------------------------------------------------

function isTransientError(error: unknown): boolean {
  if (error instanceof Anthropic.APIError) {
    // 429 = rate limited, 529 = overloaded, 5xx = server errors
    return error.status === 429 || error.status === 529 || error.status >= 500;
  }
  // Network/connection errors are transient
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return msg.includes("econnreset") ||
      msg.includes("etimedout") ||
      msg.includes("fetch failed") ||
      msg.includes("socket hang up");
  }
  return false;
}

export async function callClaude<T>(options: CallClaudeOptions<T> & { allowPartial: true }): Promise<T | null>;
export async function callClaude<T>(options: CallClaudeOptions<T>): Promise<T>;
export async function callClaude<T>(options: CallClaudeOptions<T>): Promise<T | null> {
  const { prompt, systemPrompt, schema, model, maxTokens, allowPartial, onUsage, temperature } = options;

  const client = getClient();
  const tool = buildTool(schema);

  function emitUsage(msg: Anthropic.Message, isRetry: boolean) {
    if (onUsage && msg.usage) {
      const usage = msg.usage as unknown as Record<string, number>;
      onUsage(
        {
          input_tokens: msg.usage.input_tokens,
          output_tokens: msg.usage.output_tokens,
          cache_creation_input_tokens: usage.cache_creation_input_tokens ?? 0,
          cache_read_input_tokens: usage.cache_read_input_tokens ?? 0,
        },
        isRetry
      );
    }
  }

  let message: Anthropic.Message;
  try {
    message = await client.messages.create({
      model,
      max_tokens: maxTokens,
      ...(temperature !== undefined && { temperature }),
      system: (Array.isArray(systemPrompt) ? systemPrompt.length > 0 : !!systemPrompt) ? systemPrompt : undefined,
      messages: [{ role: "user", content: prompt }],
      tools: [tool],
      tool_choice: { type: "tool", name: TOOL_NAME },
    });
    emitUsage(message, false);
  } catch (error) {
    if (isTransientError(error)) {
      throw error; // Let Inngest retry
    }
    throw new NonRetriableError(
      `Claude API error (permanent): ${error instanceof Error ? error.message : String(error)}`,
      { cause: error instanceof Error ? error : undefined }
    );
  }

  // Check for truncated response — permanent, won't fix itself on retry
  if (message.stop_reason === "max_tokens") {
    if (allowPartial) {
      return null;
    }
    throw new NonRetriableError(
      `Claude response truncated (hit max_tokens=${maxTokens}). Increase maxTokens for this call.`
    );
  }

  // Extract tool use result
  const toolBlock = message.content.find((block) => block.type === "tool_use");
  if (toolBlock && toolBlock.type === "tool_use") {
    const result = schema.safeParse(toolBlock.input);
    if (result.success) {
      return result.data;
    }

    // Tool use returned but failed Zod — retry with error feedback
    const errors = result.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("\n");

    let retryMessage: Anthropic.Message;
    try {
      retryMessage = await client.messages.create({
        model,
        max_tokens: maxTokens,
        ...(temperature !== undefined && { temperature }),
        system: (Array.isArray(systemPrompt) ? systemPrompt.length > 0 : !!systemPrompt) ? systemPrompt : undefined,
        messages: [
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
        ],
        tools: [tool],
        tool_choice: { type: "tool", name: TOOL_NAME },
      });
    } catch (error) {
      if (isTransientError(error)) {
        throw error;
      }
      throw new NonRetriableError(
        `Claude API error on validation retry (permanent): ${error instanceof Error ? error.message : String(error)}`,
        { cause: error instanceof Error ? error : undefined }
      );
    }

    emitUsage(retryMessage, true);

    const retryToolBlock = retryMessage.content.find((block) => block.type === "tool_use");
    if (retryToolBlock && retryToolBlock.type === "tool_use") {
      const retryResult = schema.safeParse(retryToolBlock.input);
      if (retryResult.success) {
        return retryResult.data;
      }
      // Failed validation twice — this is deterministic, don't retry
      throw new NonRetriableError(
        `Claude tool use failed validation after retry. ` +
        `Original errors: ${errors}. ` +
        `Retry errors: ${retryResult.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ")}`
      );
    }
    throw new NonRetriableError(`Claude retry did not return a tool use block`);
  }

  // Fallback: try parsing text response (shouldn't happen with tool_choice forced)
  const textBlock = message.content.find((block) => block.type === "text");
  if (textBlock && textBlock.type === "text") {
    try {
      const parsed = parseJsonPermissive(textBlock.text);
      return schema.parse(parsed);
    } catch (error) {
      throw new NonRetriableError(
        `Claude returned text instead of tool use and parsing failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  throw new NonRetriableError("No tool use or text response from Claude");
}
