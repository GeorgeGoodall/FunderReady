import { describe, it, expect, vi } from "vitest";
import { inferWithClaude } from "../infer-with-claude";
import { z } from "zod";
import { NonRetriableError } from "inngest";

const TestSchema = z.object({ value: z.string() });

function makeToolUseMessage(input: unknown, inputTokens = 100, outputTokens = 50) {
  return {
    content: [{ type: "tool_use" as const, id: "toolu_01", name: "structured_output", input }],
    usage: { input_tokens: inputTokens, output_tokens: outputTokens },
  };
}

function makeStep(responses: unknown[]) {
  let call = 0;
  return {
    ai: {
      infer: vi.fn().mockImplementation(() => Promise.resolve(responses[call++])),
    },
  };
}

describe("inferWithClaude", () => {
  it("returns result and usage on successful validation", async () => {
    const step = makeStep([makeToolUseMessage({ value: "hello" })]);

    const { result, usage } = await inferWithClaude(step, "test-step", {
      prompt: "test prompt",
      schema: TestSchema,
      model: "claude-sonnet-4-6",
      maxTokens: 1024,
    });

    expect(result).toEqual({ value: "hello" });
    expect(usage.input_tokens).toBe(100);
    expect(usage.output_tokens).toBe(50);
    expect(step.ai.infer).toHaveBeenCalledTimes(1);
    expect(step.ai.infer).toHaveBeenCalledWith(
      "test-step",
      expect.objectContaining({
        body: expect.objectContaining({
          tool_choice: { type: "tool", name: "structured_output" },
        }),
      })
    );
  });

  it("retries with error feedback when validation fails, returns retry result", async () => {
    const step = makeStep([
      makeToolUseMessage({ wrong: "shape" }), // fails validation
      makeToolUseMessage({ value: "fixed" }),  // retry succeeds
    ]);

    const { result } = await inferWithClaude(step, "test-step", {
      prompt: "test prompt",
      schema: TestSchema,
      model: "claude-sonnet-4-6",
      maxTokens: 1024,
    });

    expect(result).toEqual({ value: "fixed" });
    expect(step.ai.infer).toHaveBeenCalledTimes(2);
    expect(step.ai.infer).toHaveBeenNthCalledWith(
      2,
      "test-step-retry",
      expect.anything()
    );
  });

  it("throws NonRetriableError when retry also fails validation", async () => {
    const step = makeStep([
      makeToolUseMessage({ wrong: "shape" }),
      makeToolUseMessage({ also: "wrong" }),
    ]);

    await expect(
      inferWithClaude(step, "test-step", {
        prompt: "test prompt",
        schema: TestSchema,
        model: "claude-sonnet-4-6",
        maxTokens: 1024,
      })
    ).rejects.toThrow(NonRetriableError);

    expect(step.ai.infer).toHaveBeenCalledTimes(2);
  });

  it("combines usage from both calls when retry succeeds", async () => {
    const step = makeStep([
      makeToolUseMessage({ wrong: "shape" }, 100, 50),
      makeToolUseMessage({ value: "fixed" }, 200, 80),
    ]);

    const { usage } = await inferWithClaude(step, "test-step", {
      prompt: "test prompt",
      schema: TestSchema,
      model: "claude-sonnet-4-6",
      maxTokens: 1024,
    });

    expect(usage.input_tokens).toBe(300);
    expect(usage.output_tokens).toBe(130);
  });

  it("throws NonRetriableError when stop_reason is max_tokens", async () => {
    const truncatedMessage = {
      stop_reason: "max_tokens",
      content: [],
      usage: { input_tokens: 100, output_tokens: 50 },
    };
    const step = makeStep([truncatedMessage]);

    await expect(
      inferWithClaude(step, "test-step", {
        prompt: "test prompt",
        schema: TestSchema,
        model: "claude-sonnet-4-6",
        maxTokens: 1024,
      })
    ).rejects.toThrow(NonRetriableError);

    expect(step.ai.infer).toHaveBeenCalledTimes(1);
  });

  it("throws NonRetriableError when retry call returns stop_reason max_tokens", async () => {
    const truncatedRetryMessage = {
      stop_reason: "max_tokens",
      content: [],
      usage: { input_tokens: 200, output_tokens: 80 },
    };
    const step = makeStep([
      makeToolUseMessage({ wrong: "shape" }), // initial call: valid tool use block, fails Zod
      truncatedRetryMessage,                  // retry call: truncated
    ]);

    await expect(
      inferWithClaude(step, "test-step", {
        prompt: "test prompt",
        schema: TestSchema,
        model: "claude-sonnet-4-6",
        maxTokens: 1024,
      })
    ).rejects.toThrow(NonRetriableError);

    expect(step.ai.infer).toHaveBeenCalledTimes(2);
    expect(step.ai.infer).toHaveBeenNthCalledWith(
      2,
      "test-step-retry",
      expect.anything()
    );
  });

  it("includes system prompt in request body when provided", async () => {
    const step = makeStep([makeToolUseMessage({ value: "hello" })]);

    await inferWithClaude(step, "test-step", {
      prompt: "test prompt",
      systemPrompt: "my system",
      schema: TestSchema,
      model: "claude-sonnet-4-6",
      maxTokens: 1024,
    });

    expect(step.ai.infer).toHaveBeenCalledTimes(1);
    expect(step.ai.infer).toHaveBeenCalledWith(
      "test-step",
      expect.objectContaining({
        body: expect.objectContaining({ system: "my system" }),
      })
    );
  });

  it("sends the retry call with conversation history including tool_result error", async () => {
    const step = makeStep([
      makeToolUseMessage({ wrong: "shape" }),
      makeToolUseMessage({ value: "fixed" }),
    ]);

    await inferWithClaude(step, "test-step", {
      prompt: "user prompt",
      schema: TestSchema,
      model: "claude-sonnet-4-6",
      maxTokens: 1024,
    });

    const retryBody = step.ai.infer.mock.calls[1][1].body;
    expect(retryBody.messages).toHaveLength(3);
    expect(retryBody.messages[2].role).toBe("user");
    expect(retryBody.messages[2].content[0].type).toBe("tool_result");
    expect(retryBody.messages[2].content[0].is_error).toBe(true);
  });
});
