import { describe, it, expect, vi, beforeEach } from "vitest";

const mockInsert = vi.fn().mockReturnValue({ error: null });

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => ({
    from: () => ({ insert: mockInsert }),
  }),
}));

import { logAiUsage } from "../log-usage";

describe("logAiUsage", () => {
  beforeEach(() => {
    mockInsert.mockClear();
    mockInsert.mockReturnValue({ error: null });
  });

  it("inserts correct payload", async () => {
    await logAiUsage({
      applicationReviewId: "review-123",
      userId: "user-456",
      pipelineStep: "answer_analysis",
      model: "claude-sonnet-4-6",
      usage: {
        input_tokens: 1000,
        output_tokens: 500,
        cache_creation_input_tokens: 200,
        cache_read_input_tokens: 100,
      },
      isRetry: false,
    });

    expect(mockInsert).toHaveBeenCalledOnce();
    const payload = mockInsert.mock.calls[0][0];
    expect(payload.application_review_id).toBe("review-123");
    expect(payload.user_id).toBe("user-456");
    expect(payload.pipeline_step).toBe("answer_analysis");
    expect(payload.model).toBe("claude-sonnet-4-6");
    expect(payload.input_tokens).toBe(1000);
    expect(payload.output_tokens).toBe(500);
    expect(payload.cache_creation_input_tokens).toBe(200);
    expect(payload.cache_read_input_tokens).toBe(100);
    expect(payload.is_retry).toBe(false);
    expect(payload.cost_usd).toBeGreaterThan(0);
    expect(payload.cost_gbp).toBeGreaterThan(0);
  });

  it("handles null optional fields", async () => {
    await logAiUsage({
      pipelineStep: "detect_fund",
      model: "claude-haiku-4-5-20251001",
      usage: {
        input_tokens: 500,
        output_tokens: 50,
      },
    });

    expect(mockInsert).toHaveBeenCalledOnce();
    const payload = mockInsert.mock.calls[0][0];
    expect(payload.application_review_id).toBeNull();
    expect(payload.user_id).toBeNull();
    expect(payload.is_retry).toBe(false);
    expect(payload.cache_creation_input_tokens).toBe(0);
    expect(payload.cache_read_input_tokens).toBe(0);
  });

  it("silently catches insert errors", async () => {
    mockInsert.mockImplementation(() => {
      throw new Error("DB connection failed");
    });

    // Should not throw
    await expect(
      logAiUsage({
        pipelineStep: "scoring",
        model: "claude-sonnet-4-6",
        usage: { input_tokens: 100, output_tokens: 50 },
      })
    ).resolves.toBeUndefined();
  });
});
