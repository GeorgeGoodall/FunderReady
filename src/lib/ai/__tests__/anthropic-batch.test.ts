import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock @anthropic-ai/sdk
// ---------------------------------------------------------------------------

const mockBatchCreate = vi.fn();
const mockBatchRetrieve = vi.fn();
const mockBatchResults = vi.fn();

vi.mock("@anthropic-ai/sdk", () => ({
  default: class MockAnthropic {
    messages = {
      batches: {
        create: mockBatchCreate,
        retrieve: mockBatchRetrieve,
        results: mockBatchResults,
      },
    };
  },
}));

import { submitAnswerBatch, pollBatch, parseBatchResults } from "../anthropic-batch";
import type { AnswerBatchRequest } from "../anthropic-batch";
import { z } from "zod";

const TestSchema = z.object({ score: z.number() });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("submitAnswerBatch", () => {
  it("submits one request per answer context with correct custom_id", async () => {
    mockBatchCreate.mockResolvedValue({ id: "msgbatch_abc123" });

    const requests: AnswerBatchRequest[] = [
      { questionId: "q1", systemPrompt: "system", userPrompt: "prompt 1" },
      { questionId: "q2", systemPrompt: "system", userPrompt: "prompt 2" },
    ];

    const result = await submitAnswerBatch(requests, "claude-sonnet-4-6", 12288, TestSchema);

    expect(result.batchId).toBe("msgbatch_abc123");
    expect(mockBatchCreate).toHaveBeenCalledTimes(1);

    const { requests: batchReqs } = mockBatchCreate.mock.calls[0][0];
    expect(batchReqs).toHaveLength(2);
    expect(batchReqs[0].custom_id).toBe("q1");
    expect(batchReqs[1].custom_id).toBe("q2");
  });

  it("includes tool use and model config in each request", async () => {
    mockBatchCreate.mockResolvedValue({ id: "msgbatch_xyz" });

    await submitAnswerBatch(
      [{ questionId: "q1", systemPrompt: "sys", userPrompt: "prompt" }],
      "claude-sonnet-4-6",
      1024,
      TestSchema
    );

    const req = mockBatchCreate.mock.calls[0][0].requests[0];
    expect(req.params.tool_choice).toEqual({ type: "tool", name: "structured_output" });
    expect(req.params.tools).toHaveLength(1);
    expect(req.params.tools[0].name).toBe("structured_output");
    expect(req.params.max_tokens).toBe(1024);
    expect(req.params.model).toBe("claude-sonnet-4-6");
  });

  it("throws if requests array is empty", async () => {
    await expect(
      submitAnswerBatch([], "claude-sonnet-4-6", 1024, TestSchema)
    ).rejects.toThrow("submitAnswerBatch: requests array must not be empty");
    expect(mockBatchCreate).not.toHaveBeenCalled();
  });

  it("sets the user prompt as the message content", async () => {
    mockBatchCreate.mockResolvedValue({ id: "msgbatch_xyz" });

    await submitAnswerBatch(
      [{ questionId: "q1", systemPrompt: "sys", userPrompt: "answer for q1" }],
      "claude-sonnet-4-6",
      1024,
      TestSchema
    );

    const req = mockBatchCreate.mock.calls[0][0].requests[0];
    expect(req.params.messages[0].content).toBe("answer for q1");
    expect(req.params.system).toBe("sys");
  });

  it("includes temperature in request params when provided", async () => {
    mockBatchCreate.mockResolvedValue({ id: "msgbatch_xyz" });

    await submitAnswerBatch(
      [{ questionId: "q1", systemPrompt: "sys", userPrompt: "prompt" }],
      "claude-sonnet-4-6",
      1024,
      TestSchema,
      0
    );

    const req = mockBatchCreate.mock.calls[0][0].requests[0];
    expect(req.params.temperature).toBe(0);
  });

  it("omits temperature from request params when not provided", async () => {
    mockBatchCreate.mockResolvedValue({ id: "msgbatch_xyz" });

    await submitAnswerBatch(
      [{ questionId: "q1", systemPrompt: "sys", userPrompt: "prompt" }],
      "claude-sonnet-4-6",
      1024,
      TestSchema
      // no temperature argument
    );

    const req = mockBatchCreate.mock.calls[0][0].requests[0];
    expect(req.params).not.toHaveProperty("temperature");
  });
});

describe("pollBatch", () => {
  it("returns done: false when processing_status is in_progress", async () => {
    mockBatchRetrieve.mockResolvedValue({ processing_status: "in_progress" });

    const result = await pollBatch("msgbatch_abc");
    expect(result.done).toBe(false);
    expect(mockBatchRetrieve).toHaveBeenCalledWith("msgbatch_abc");
  });

  it("returns done: true when processing_status is ended", async () => {
    mockBatchRetrieve.mockResolvedValue({ processing_status: "ended" });

    const result = await pollBatch("msgbatch_abc");
    expect(result.done).toBe(true);
  });
});

function makeSucceededItem(questionId: string, input: unknown, inputTokens = 100, outputTokens = 50) {
  return {
    custom_id: questionId,
    result: {
      type: "succeeded" as const,
      message: {
        content: [{ type: "tool_use", id: "toolu_1", name: "structured_output", input }],
        usage: { input_tokens: inputTokens, output_tokens: outputTokens },
      },
    },
  };
}

function makeErroredItem(questionId: string) {
  return {
    custom_id: questionId,
    result: { type: "errored" as const, error: { message: "API error" } },
  };
}

async function* asyncItems<T>(items: T[]) {
  for (const item of items) yield item;
}

describe("parseBatchResults", () => {
  beforeEach(() => {
    mockBatchResults.mockReset();
  });

  it("returns succeeded analyses with usage", async () => {
    mockBatchResults.mockResolvedValue(
      asyncItems([makeSucceededItem("q1", { score: 42 }, 100, 50)])
    );

    const { successes, failures } = await parseBatchResults("batch_1", TestSchema);

    expect(failures).toHaveLength(0);
    expect(successes).toHaveLength(1);
    expect(successes[0].questionId).toBe("q1");
    expect(successes[0].analysis).toEqual({ score: 42 });
    expect(successes[0].usage.input_tokens).toBe(100);
    expect(successes[0].usage.output_tokens).toBe(50);
  });

  it("adds errored results to failures", async () => {
    mockBatchResults.mockResolvedValue(asyncItems([makeErroredItem("q1")]));

    const { successes, failures } = await parseBatchResults("batch_1", TestSchema);

    expect(successes).toHaveLength(0);
    expect(failures).toContain("q1");
  });

  it("adds Zod validation failures to failures list", async () => {
    mockBatchResults.mockResolvedValue(
      asyncItems([makeSucceededItem("q1", { wrong: "type" })])
    );

    const { successes, failures } = await parseBatchResults("batch_1", TestSchema);

    expect(successes).toHaveLength(0);
    expect(failures).toContain("q1");
  });

  it("handles mixed success and failure", async () => {
    mockBatchResults.mockResolvedValue(
      asyncItems([
        makeSucceededItem("q1", { score: 7 }),
        makeErroredItem("q2"),
      ])
    );

    const { successes, failures } = await parseBatchResults("batch_1", TestSchema);

    expect(successes).toHaveLength(1);
    expect(successes[0].questionId).toBe("q1");
    expect(failures).toContain("q2");
  });

  it("calls results() with the provided batchId", async () => {
    mockBatchResults.mockResolvedValue(asyncItems([]));

    await parseBatchResults("msgbatch_specific", TestSchema);

    expect(mockBatchResults).toHaveBeenCalledWith("msgbatch_specific");
  });
});
