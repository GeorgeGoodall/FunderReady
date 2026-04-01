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

import { submitAnswerBatch, pollBatch } from "../anthropic-batch";
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
