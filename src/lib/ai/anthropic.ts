/**
 * Claude API wrapper using tool use for structured JSON output.
 * Falls back to text parsing if tool use doesn't return a tool call.
 */

import Anthropic from "@anthropic-ai/sdk";
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

interface CallClaudeOptions<T> {
  prompt: string;
  systemPrompt?: string | CacheBlock[];
  schema: ZodSchema<T>;
  model: string;
  maxTokens: number;
}

const TOOL_NAME = "structured_output";

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_client) _client = new Anthropic();
  return _client;
}

function buildTool<T>(schema: ZodSchema<T>): Anthropic.Tool {
  const jsonSchema = zodToJsonSchema(schema, { target: "openApi3" });
  return {
    name: TOOL_NAME,
    description: "Return the structured analysis result",
    input_schema: jsonSchema as Anthropic.Tool["input_schema"],
  };
}

export async function callClaude<T>(options: CallClaudeOptions<T>): Promise<T> {
  const { prompt, systemPrompt, schema, model, maxTokens } = options;

  const client = getClient();
  const tool = buildTool(schema);

  const message = await client.messages.create({
    model,
    max_tokens: maxTokens,
    system: systemPrompt || undefined,
    messages: [{ role: "user", content: prompt }],
    tools: [tool],
    tool_choice: { type: "tool", name: TOOL_NAME },
  });

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

    const retryMessage = await client.messages.create({
      model,
      max_tokens: maxTokens,
      system: systemPrompt || undefined,
      messages: [
        { role: "user", content: prompt },
        { role: "assistant", content: message.content },
        {
          role: "user",
          content: `Your tool call had validation errors:\n${errors}\n\nPlease call the tool again with corrected data.`,
        },
      ],
      tools: [tool],
      tool_choice: { type: "tool", name: TOOL_NAME },
    });

    const retryToolBlock = retryMessage.content.find((block) => block.type === "tool_use");
    if (retryToolBlock && retryToolBlock.type === "tool_use") {
      return schema.parse(retryToolBlock.input);
    }
  }

  // Fallback: try parsing text response (shouldn't happen with tool_choice forced)
  const textBlock = message.content.find((block) => block.type === "text");
  if (textBlock && textBlock.type === "text") {
    const parsed = parseJsonPermissive(textBlock.text);
    return schema.parse(parsed);
  }

  throw new Error("No tool use or text response from Claude");
}
