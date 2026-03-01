import { describe, it, expect, vi, beforeEach } from "vitest";
import { NonRetriableError } from "inngest";
import { z } from "zod";

const { mockCreate, MockAPIError } = vi.hoisted(() => {
  const mockCreate = vi.fn();
  // Minimal APIError class that matches the real SDK's shape
  class MockAPIError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
      this.name = "APIError";
    }
  }
  return { mockCreate, MockAPIError };
});

vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: class MockAnthropic {
      messages = { create: mockCreate };
      static APIError = MockAPIError;
    },
  };
});

import { callClaude, parseJsonPermissive } from "../anthropic";

const TestSchema = z.object({
  name: z.string(),
  value: z.number(),
});

const mockUsage = {
  input_tokens: 100,
  output_tokens: 50,
  cache_creation_input_tokens: 10,
  cache_read_input_tokens: 5,
};

describe("callClaude", () => {
  beforeEach(() => {
    mockCreate.mockReset();
  });

  it("returns validated data from tool use on first try", async () => {
    mockCreate.mockResolvedValue({
      content: [
        { type: "tool_use", id: "t1", name: "structured_output", input: { name: "test", value: 42 } },
      ],
      usage: mockUsage,
    });

    const result = await callClaude({
      prompt: "test prompt",
      schema: TestSchema,
      model: "claude-haiku-4-5-20251001",
      maxTokens: 512,
    });

    expect(result).toEqual({ name: "test", value: 42 });
    expect(mockCreate).toHaveBeenCalledTimes(1);

    // Verify tool_choice was forced
    expect(mockCreate.mock.calls[0][0].tool_choice).toEqual({
      type: "tool",
      name: "structured_output",
    });
  });

  it("retries once on tool use schema validation failure", async () => {
    // First call returns invalid input
    mockCreate.mockResolvedValueOnce({
      content: [
        { type: "tool_use", id: "t1", name: "structured_output", input: { name: "test" } }, // missing value
      ],
      usage: mockUsage,
    });
    // Retry returns valid
    mockCreate.mockResolvedValueOnce({
      content: [
        { type: "tool_use", id: "t2", name: "structured_output", input: { name: "test", value: 42 } },
      ],
      usage: mockUsage,
    });

    const result = await callClaude({
      prompt: "test",
      schema: TestSchema,
      model: "claude-haiku-4-5-20251001",
      maxTokens: 512,
    });

    expect(result).toEqual({ name: "test", value: 42 });
    expect(mockCreate).toHaveBeenCalledTimes(2);

    // Verify retry includes error feedback in messages
    const retryCall = mockCreate.mock.calls[1];
    const lastMessage = retryCall[0].messages[retryCall[0].messages.length - 1];
    const contentText = Array.isArray(lastMessage.content)
      ? lastMessage.content.map((c: { content?: string }) => c.content ?? "").join(" ")
      : String(lastMessage.content);
    expect(contentText.toLowerCase()).toContain("validation errors");
  });

  it("throws NonRetriableError on second failure after retry", async () => {
    mockCreate.mockResolvedValue({
      content: [
        { type: "tool_use", id: "t1", name: "structured_output", input: { name: "test" } }, // always missing value
      ],
      usage: mockUsage,
    });

    await expect(
      callClaude({
        prompt: "test",
        schema: TestSchema,
        model: "claude-haiku-4-5-20251001",
        maxTokens: 512,
      })
    ).rejects.toThrow(NonRetriableError);

    expect(mockCreate).toHaveBeenCalledTimes(2);
  });

  it("falls back to text parsing when no tool block returned", async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: "text", text: '{"name": "fallback", "value": 7}' }],
      usage: mockUsage,
    });

    const result = await callClaude({
      prompt: "test",
      schema: TestSchema,
      model: "claude-haiku-4-5-20251001",
      maxTokens: 512,
    });

    expect(result).toEqual({ name: "fallback", value: 7 });
  });

  it("throws NonRetriableError when response has neither tool use nor text", async () => {
    mockCreate.mockResolvedValue({
      content: [],
    });

    await expect(
      callClaude({
        prompt: "test",
        schema: TestSchema,
        model: "claude-haiku-4-5-20251001",
        maxTokens: 512,
      })
    ).rejects.toThrow(NonRetriableError);
  });

  it("passes system prompt and tools config", async () => {
    mockCreate.mockResolvedValue({
      content: [
        { type: "tool_use", id: "t1", name: "structured_output", input: { name: "sys", value: 1 } },
      ],
      usage: mockUsage,
    });

    await callClaude({
      prompt: "test",
      systemPrompt: "You are helpful",
      schema: TestSchema,
      model: "claude-haiku-4-5-20251001",
      maxTokens: 512,
    });

    const call = mockCreate.mock.calls[0][0];
    expect(call.system).toBe("You are helpful");
    expect(call.tools).toHaveLength(1);
    expect(call.tools[0].name).toBe("structured_output");
  });

  it("throws NonRetriableError on max_tokens by default", async () => {
    mockCreate.mockResolvedValue({
      stop_reason: "max_tokens",
      content: [],
    });

    await expect(
      callClaude({
        prompt: "test",
        schema: TestSchema,
        model: "claude-haiku-4-5-20251001",
        maxTokens: 512,
      })
    ).rejects.toThrow(NonRetriableError);
  });

  it("returns null on max_tokens when allowPartial is true", async () => {
    mockCreate.mockResolvedValue({
      stop_reason: "max_tokens",
      content: [],
    });

    const result = await callClaude({
      prompt: "test",
      schema: TestSchema,
      model: "claude-haiku-4-5-20251001",
      maxTokens: 512,
      allowPartial: true,
    });

    expect(result).toBeNull();
  });

  it("passes structured system blocks with cache_control unchanged", async () => {
    mockCreate.mockResolvedValue({
      content: [
        { type: "tool_use", id: "t1", name: "structured_output", input: { name: "cached", value: 99 } },
      ],
      usage: mockUsage,
    });

    const systemBlocks = [
      {
        type: "text" as const,
        text: "You are a grant reviewer",
        cache_control: { type: "ephemeral" as const },
      },
    ];

    await callClaude({
      prompt: "test",
      systemPrompt: systemBlocks,
      schema: TestSchema,
      model: "claude-haiku-4-5-20251001",
      maxTokens: 512,
    });

    const call = mockCreate.mock.calls[0][0];
    expect(call.system).toEqual(systemBlocks);
    expect(call.system[0].cache_control).toEqual({ type: "ephemeral" });
  });

  it("calls onUsage with usage data on successful first call", async () => {
    mockCreate.mockResolvedValue({
      content: [
        { type: "tool_use", id: "t1", name: "structured_output", input: { name: "test", value: 1 } },
      ],
      usage: mockUsage,
    });

    const onUsage = vi.fn();
    await callClaude({
      prompt: "test",
      schema: TestSchema,
      model: "claude-haiku-4-5-20251001",
      maxTokens: 512,
      onUsage,
    });

    expect(onUsage).toHaveBeenCalledOnce();
    expect(onUsage).toHaveBeenCalledWith(
      {
        input_tokens: 100,
        output_tokens: 50,
        cache_creation_input_tokens: 10,
        cache_read_input_tokens: 5,
      },
      false
    );
  });

  it("calls onUsage twice when validation retry occurs", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [
        { type: "tool_use", id: "t1", name: "structured_output", input: { name: "test" } },
      ],
      usage: { input_tokens: 100, output_tokens: 50 },
    });
    mockCreate.mockResolvedValueOnce({
      content: [
        { type: "tool_use", id: "t2", name: "structured_output", input: { name: "test", value: 42 } },
      ],
      usage: { input_tokens: 200, output_tokens: 60 },
    });

    const onUsage = vi.fn();
    await callClaude({
      prompt: "test",
      schema: TestSchema,
      model: "claude-haiku-4-5-20251001",
      maxTokens: 512,
      onUsage,
    });

    expect(onUsage).toHaveBeenCalledTimes(2);
    // First call — not retry
    expect(onUsage.mock.calls[0][1]).toBe(false);
    // Second call — is retry
    expect(onUsage.mock.calls[1][1]).toBe(true);
  });

  it("passes temperature to API when specified", async () => {
    mockCreate.mockResolvedValue({
      content: [
        { type: "tool_use", id: "t1", name: "structured_output", input: { name: "test", value: 1 } },
      ],
      usage: mockUsage,
    });

    await callClaude({
      prompt: "test",
      schema: TestSchema,
      model: "claude-haiku-4-5-20251001",
      maxTokens: 512,
      temperature: 0,
    });

    const call = mockCreate.mock.calls[0][0];
    expect(call.temperature).toBe(0);
  });

  it("passes non-zero temperature values", async () => {
    mockCreate.mockResolvedValue({
      content: [
        { type: "tool_use", id: "t1", name: "structured_output", input: { name: "test", value: 1 } },
      ],
      usage: mockUsage,
    });

    await callClaude({
      prompt: "test",
      schema: TestSchema,
      model: "claude-haiku-4-5-20251001",
      maxTokens: 512,
      temperature: 0.7,
    });

    const call = mockCreate.mock.calls[0][0];
    expect(call.temperature).toBe(0.7);
  });

  it("passes temperature to validation retry call", async () => {
    // First call returns invalid input
    mockCreate.mockResolvedValueOnce({
      content: [
        { type: "tool_use", id: "t1", name: "structured_output", input: { name: "test" } },
      ],
      usage: mockUsage,
    });
    // Retry returns valid
    mockCreate.mockResolvedValueOnce({
      content: [
        { type: "tool_use", id: "t2", name: "structured_output", input: { name: "test", value: 42 } },
      ],
      usage: mockUsage,
    });

    await callClaude({
      prompt: "test",
      schema: TestSchema,
      model: "claude-haiku-4-5-20251001",
      maxTokens: 512,
      temperature: 0,
    });

    // Both the initial and retry calls should have temperature: 0
    expect(mockCreate.mock.calls[0][0].temperature).toBe(0);
    expect(mockCreate.mock.calls[1][0].temperature).toBe(0);
  });

  it("omits temperature from API call when not specified", async () => {
    mockCreate.mockResolvedValue({
      content: [
        { type: "tool_use", id: "t1", name: "structured_output", input: { name: "test", value: 1 } },
      ],
      usage: mockUsage,
    });

    await callClaude({
      prompt: "test",
      schema: TestSchema,
      model: "claude-haiku-4-5-20251001",
      maxTokens: 512,
    });

    const call = mockCreate.mock.calls[0][0];
    expect(call).not.toHaveProperty("temperature");
  });

  it("does not break when onUsage is not provided", async () => {
    mockCreate.mockResolvedValue({
      content: [
        { type: "tool_use", id: "t1", name: "structured_output", input: { name: "test", value: 1 } },
      ],
      usage: mockUsage,
    });

    const result = await callClaude({
      prompt: "test",
      schema: TestSchema,
      model: "claude-haiku-4-5-20251001",
      maxTokens: 512,
    });

    expect(result).toEqual({ name: "test", value: 1 });
  });
});

// ---------------------------------------------------------------------------
// Transient vs permanent error handling (isTransientError)
// ---------------------------------------------------------------------------

describe("callClaude — transient error handling", () => {
  beforeEach(() => {
    mockCreate.mockReset();
  });

  it("re-throws 429 rate limit errors (allows Inngest retry)", async () => {
    mockCreate.mockRejectedValue(new MockAPIError(429, "Rate limited"));

    await expect(
      callClaude({ prompt: "test", schema: TestSchema, model: "claude-haiku-4-5-20251001", maxTokens: 512 })
    ).rejects.toThrow("Rate limited");

    // Should NOT wrap in NonRetriableError
    await expect(
      callClaude({ prompt: "test", schema: TestSchema, model: "claude-haiku-4-5-20251001", maxTokens: 512 })
    ).rejects.not.toBeInstanceOf(NonRetriableError);
  });

  it("re-throws 529 overloaded errors (allows Inngest retry)", async () => {
    mockCreate.mockRejectedValue(new MockAPIError(529, "Overloaded"));

    await expect(
      callClaude({ prompt: "test", schema: TestSchema, model: "claude-haiku-4-5-20251001", maxTokens: 512 })
    ).rejects.toThrow("Overloaded");

    await expect(
      callClaude({ prompt: "test", schema: TestSchema, model: "claude-haiku-4-5-20251001", maxTokens: 512 })
    ).rejects.not.toBeInstanceOf(NonRetriableError);
  });

  it("re-throws 500 server errors (allows Inngest retry)", async () => {
    mockCreate.mockRejectedValue(new MockAPIError(500, "Internal server error"));

    await expect(
      callClaude({ prompt: "test", schema: TestSchema, model: "claude-haiku-4-5-20251001", maxTokens: 512 })
    ).rejects.toThrow("Internal server error");

    await expect(
      callClaude({ prompt: "test", schema: TestSchema, model: "claude-haiku-4-5-20251001", maxTokens: 512 })
    ).rejects.not.toBeInstanceOf(NonRetriableError);
  });

  it("re-throws network errors with ECONNRESET (allows Inngest retry)", async () => {
    mockCreate.mockRejectedValue(new Error("socket hang up ECONNRESET"));

    await expect(
      callClaude({ prompt: "test", schema: TestSchema, model: "claude-haiku-4-5-20251001", maxTokens: 512 })
    ).rejects.toThrow("ECONNRESET");

    await expect(
      callClaude({ prompt: "test", schema: TestSchema, model: "claude-haiku-4-5-20251001", maxTokens: 512 })
    ).rejects.not.toBeInstanceOf(NonRetriableError);
  });

  it("re-throws network errors with ETIMEDOUT (allows Inngest retry)", async () => {
    mockCreate.mockRejectedValue(new Error("connect ETIMEDOUT 1.2.3.4:443"));

    await expect(
      callClaude({ prompt: "test", schema: TestSchema, model: "claude-haiku-4-5-20251001", maxTokens: 512 })
    ).rejects.toThrow("ETIMEDOUT");

    await expect(
      callClaude({ prompt: "test", schema: TestSchema, model: "claude-haiku-4-5-20251001", maxTokens: 512 })
    ).rejects.not.toBeInstanceOf(NonRetriableError);
  });

  it("re-throws fetch failed errors (allows Inngest retry)", async () => {
    mockCreate.mockRejectedValue(new Error("fetch failed"));

    await expect(
      callClaude({ prompt: "test", schema: TestSchema, model: "claude-haiku-4-5-20251001", maxTokens: 512 })
    ).rejects.toThrow("fetch failed");

    await expect(
      callClaude({ prompt: "test", schema: TestSchema, model: "claude-haiku-4-5-20251001", maxTokens: 512 })
    ).rejects.not.toBeInstanceOf(NonRetriableError);
  });

  it("wraps 400 bad request as NonRetriableError (permanent)", async () => {
    mockCreate.mockRejectedValue(new MockAPIError(400, "Invalid request"));

    await expect(
      callClaude({ prompt: "test", schema: TestSchema, model: "claude-haiku-4-5-20251001", maxTokens: 512 })
    ).rejects.toBeInstanceOf(NonRetriableError);
  });

  it("wraps 401 auth error as NonRetriableError (permanent)", async () => {
    mockCreate.mockRejectedValue(new MockAPIError(401, "Invalid API key"));

    await expect(
      callClaude({ prompt: "test", schema: TestSchema, model: "claude-haiku-4-5-20251001", maxTokens: 512 })
    ).rejects.toBeInstanceOf(NonRetriableError);
  });

  it("wraps 403 forbidden as NonRetriableError (permanent)", async () => {
    mockCreate.mockRejectedValue(new MockAPIError(403, "Forbidden"));

    await expect(
      callClaude({ prompt: "test", schema: TestSchema, model: "claude-haiku-4-5-20251001", maxTokens: 512 })
    ).rejects.toBeInstanceOf(NonRetriableError);
  });

  it("wraps unknown non-Error throws as NonRetriableError", async () => {
    mockCreate.mockRejectedValue("string error");

    await expect(
      callClaude({ prompt: "test", schema: TestSchema, model: "claude-haiku-4-5-20251001", maxTokens: 512 })
    ).rejects.toBeInstanceOf(NonRetriableError);
  });

  it("re-throws transient errors on validation retry path too", async () => {
    // First call succeeds with invalid data
    mockCreate.mockResolvedValueOnce({
      content: [
        { type: "tool_use", id: "t1", name: "structured_output", input: { name: "test" } }, // missing value
      ],
      usage: mockUsage,
    });
    // Retry call hits a transient error
    mockCreate.mockRejectedValueOnce(new MockAPIError(429, "Rate limited on retry"));

    await expect(
      callClaude({ prompt: "test", schema: TestSchema, model: "claude-haiku-4-5-20251001", maxTokens: 512 })
    ).rejects.toThrow("Rate limited on retry");

    await expect(
      callClaude({ prompt: "test", schema: TestSchema, model: "claude-haiku-4-5-20251001", maxTokens: 512 }).catch((e) => {
        if (e instanceof NonRetriableError) throw new Error("Should not be NonRetriableError");
        throw e;
      })
    ).rejects.toThrow();
  });
});

describe("parseJsonPermissive", () => {
  it("parses valid JSON", () => {
    expect(parseJsonPermissive('{"a": 1}')).toEqual({ a: 1 });
  });

  it("strips ```json code fences", () => {
    const fenced = '```json\n{"a": 1}\n```';
    expect(parseJsonPermissive(fenced)).toEqual({ a: 1 });
  });

  it("strips code fences with trailing whitespace/text", () => {
    const fenced = '```json\n{"a": 1}\n```\n';
    expect(parseJsonPermissive(fenced)).toEqual({ a: 1 });
  });

  it("handles literal newlines in strings", () => {
    const broken = '{"text": "line1\nline2"}';
    const result = parseJsonPermissive(broken) as { text: string };
    expect(result.text).toBe("line1\nline2");
  });

  it("handles unescaped quotes in strings", () => {
    const broken = '{"text": "He said "hello" to me"}';
    const result = parseJsonPermissive(broken) as { text: string };
    expect(result.text).toContain("hello");
  });

  it("throws on completely invalid input", () => {
    expect(() => parseJsonPermissive("not json at all {{{")).toThrow();
  });
});
