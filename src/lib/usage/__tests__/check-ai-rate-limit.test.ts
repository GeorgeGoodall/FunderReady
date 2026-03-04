import { describe, it, expect, vi, beforeEach } from "vitest";

const mockRpc = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: vi.fn(() => ({
    rpc: mockRpc,
  })),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("checkAndIncrementAiUsage", () => {
  async function importFn() {
    const mod = await import("../check-ai-rate-limit");
    return mod.checkAndIncrementAiUsage;
  }

  it("returns allowed when RPC succeeds", async () => {
    mockRpc.mockResolvedValue({ data: 5, error: null });
    const checkAndIncrementAiUsage = await importFn();
    const result = await checkAndIncrementAiUsage("user-1");

    expect(result).toEqual({ allowed: true, count: 5, limit: 30 });
    expect(mockRpc).toHaveBeenCalledWith("increment_ai_daily_usage", {
      p_user_id: "user-1",
      p_limit: 30,
    });
  });

  it("returns not allowed on AI_RATE_LIMIT_EXCEEDED", async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: "AI_RATE_LIMIT_EXCEEDED" },
    });
    const checkAndIncrementAiUsage = await importFn();
    const result = await checkAndIncrementAiUsage("user-1");

    expect(result).toEqual({ allowed: false, count: 30, limit: 30 });
  });

  it("fails open on unexpected errors", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: "connection timeout" },
    });
    const checkAndIncrementAiUsage = await importFn();
    const result = await checkAndIncrementAiUsage("user-1");

    expect(result).toEqual({ allowed: true, count: 0, limit: 30 });
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
