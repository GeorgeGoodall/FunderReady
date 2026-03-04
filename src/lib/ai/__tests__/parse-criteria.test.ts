import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../anthropic", () => ({
  callClaude: vi.fn(),
}));

vi.mock("../log-usage", () => ({
  logAiUsage: vi.fn(),
}));

import { callClaude } from "../anthropic";
import { parseCriteriaWithAI } from "../parse-criteria";
import { CriteriaSetSchema } from "@/lib/schemas/criteria";

const mockCallClaude = vi.mocked(callClaude);

describe("parseCriteriaWithAI", () => {
  beforeEach(() => {
    mockCallClaude.mockReset();
  });

  it("calls callClaude with correct schema, model, prompt, and maxTokens", async () => {
    const mockResult = {
      name: "Test Fund",
      description: "Test criteria set",
      criteria: [
        {
          id: "c1",
          criterion: "Demonstrates clear need",
          weight: "25%",
          sub_questions: [
            { text: "What evidence of need?", required: true },
            { text: "If applicable, who benefits?", required: false },
          ],
        },
        {
          id: "c2",
          criterion: "Measurable outcomes",
          sub_questions: [],
        },
      ],
    };
    mockCallClaude.mockResolvedValue(mockResult);

    const result = await parseCriteriaWithAI("1. Clear need (25%)\n2. Measurable outcomes", "user-123");

    expect(result).toBe(mockResult);
    expect(mockCallClaude).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining("1. Clear need (25%)"),
        schema: CriteriaSetSchema,
        model: "claude-sonnet-4-6",
        maxTokens: 8192,
      })
    );
  });

  it("returns the CriteriaSet as-is from callClaude", async () => {
    const mockResult = {
      name: "Test Fund",
      criteria: [
        {
          id: "c1",
          criterion: "Clear need",
          weight: "25%",
          sub_questions: [
            { text: "What evidence of need?", required: true },
          ],
        },
      ],
    };
    mockCallClaude.mockResolvedValue(mockResult);

    const result = await parseCriteriaWithAI("1. Clear need (25%)");

    expect(result.name).toBe("Test Fund");
    expect(result.criteria).toHaveLength(1);
    expect(result.criteria[0].id).toBe("c1");
    expect(result.criteria[0].weight).toBe("25%");
    expect(result.criteria[0].sub_questions[0]).toEqual({ text: "What evidence of need?", required: true });
  });

  it("passes onUsage callback that invokes logAiUsage", async () => {
    const { logAiUsage } = await import("../log-usage");
    mockCallClaude.mockResolvedValue({
      name: "Test",
      criteria: [{ id: "c1", criterion: "Test", sub_questions: [] }],
    });

    await parseCriteriaWithAI("test", "user-456");

    // Extract onUsage from callClaude args and invoke it
    const callArgs = mockCallClaude.mock.calls[0][0];
    expect(callArgs.onUsage).toBeTypeOf("function");

    const mockUsage = { input_tokens: 100, output_tokens: 50, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };
    callArgs.onUsage(mockUsage, false);
    expect(logAiUsage).toHaveBeenCalledWith({
      userId: "user-456",
      pipelineStep: "parse_criteria",
      model: "claude-sonnet-4-6",
      usage: mockUsage,
    });
  });

  it("does not log usage on retry calls", async () => {
    const { logAiUsage } = await import("../log-usage");
    (logAiUsage as ReturnType<typeof vi.fn>).mockClear();
    mockCallClaude.mockResolvedValue({
      name: "Test",
      criteria: [{ id: "c1", criterion: "Test", sub_questions: [] }],
    });

    await parseCriteriaWithAI("test", "user-789");

    const callArgs = mockCallClaude.mock.calls[0][0];
    callArgs.onUsage({ input_tokens: 10, output_tokens: 5, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }, true);
    expect(logAiUsage).not.toHaveBeenCalled();
  });

  it("propagates errors from callClaude", async () => {
    mockCallClaude.mockRejectedValue(new Error("Claude API error"));

    await expect(parseCriteriaWithAI("test input")).rejects.toThrow("Claude API error");
  });

  it("works without userId", async () => {
    mockCallClaude.mockResolvedValue({
      name: "Test",
      criteria: [{ id: "c1", criterion: "Test", sub_questions: [] }],
    });

    const result = await parseCriteriaWithAI("test input");
    expect(result.name).toBe("Test");
  });
});
