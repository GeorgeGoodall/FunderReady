import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getEstimationStats, _resetCache } from "../estimation-stats";

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: vi.fn(),
}));

import { createServiceClient } from "@/lib/supabase/server";

function buildMockClient(overrides: {
  stepStats?: { data: unknown; error?: unknown };
  avgChars?: { data: unknown; error?: unknown };
  reviewCount?: { data: unknown; error?: unknown };
} = {}) {
  const rpcMock = vi.fn().mockImplementation((fn: string) => {
    if (fn === "get_estimation_step_stats") {
      return Promise.resolve(
        overrides.stepStats ?? {
          data: [
            { pipeline_step: "answer_analysis", avg_cost_usd: 0.035, call_count: 50 },
            { pipeline_step: "cross_reference", avg_cost_usd: 0.08, call_count: 15 },
            { pipeline_step: "scoring", avg_cost_usd: 0.06, call_count: 15 },
          ],
          error: null,
        }
      );
    }
    if (fn === "get_avg_answer_chars") {
      return Promise.resolve(
        overrides.avgChars ?? { data: [{ avg_chars: 450 }], error: null }
      );
    }
    if (fn === "get_completed_review_count") {
      return Promise.resolve(
        overrides.reviewCount ?? { data: [{ review_count: 25 }], error: null }
      );
    }
    return Promise.resolve({ data: null, error: null });
  });

  return { rpc: rpcMock };
}

describe("getEstimationStats", () => {
  beforeEach(() => {
    _resetCache();
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns null when fewer than 10 completed reviews", async () => {
    const mock = buildMockClient({
      reviewCount: { data: [{ review_count: 5 }], error: null },
    });
    (createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(mock);

    const stats = await getEstimationStats();
    expect(stats).toBeNull();
  });

  it("returns stats when enough reviews exist", async () => {
    const mock = buildMockClient();
    (createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(mock);

    const stats = await getEstimationStats();
    expect(stats).not.toBeNull();
    expect(stats!.avgAnswerChars).toBe(450);
    expect(stats!.steps.answer_analysis.avgCostUsd).toBe(0.035);
    expect(stats!.steps.cross_reference.avgCostUsd).toBe(0.08);
    expect(stats!.steps.scoring.avgCostUsd).toBe(0.06);
  });

  it("caches results for 24h (second call doesn't create new client)", async () => {
    const mock = buildMockClient();
    (createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(mock);

    await getEstimationStats();
    await getEstimationStats();

    expect(createServiceClient).toHaveBeenCalledTimes(1);
  });

  it("refreshes cache after 24h", async () => {
    const mock = buildMockClient();
    (createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(mock);

    // First call
    vi.useFakeTimers();
    const baseTime = Date.now();
    vi.setSystemTime(baseTime);

    await getEstimationStats();
    expect(createServiceClient).toHaveBeenCalledTimes(1);

    // Advance past TTL
    vi.setSystemTime(baseTime + 25 * 60 * 60 * 1000);

    await getEstimationStats();
    expect(createServiceClient).toHaveBeenCalledTimes(2);
  });

  it("returns null stats cached (doesn't re-query within TTL)", async () => {
    const mock = buildMockClient({
      reviewCount: { data: [{ review_count: 3 }], error: null },
    });
    (createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(mock);

    const first = await getEstimationStats();
    expect(first).toBeNull();

    const second = await getEstimationStats();
    expect(second).toBeNull();
    expect(createServiceClient).toHaveBeenCalledTimes(1);
  });

  it("uses default avgAnswerChars of 500 when RPC returns null", async () => {
    const mock = buildMockClient({
      avgChars: { data: [{ avg_chars: null }], error: null },
    });
    (createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(mock);

    const stats = await getEstimationStats();
    expect(stats!.avgAnswerChars).toBe(500);
  });

  it("returns stats at exactly 10 reviews (boundary)", async () => {
    const mock = buildMockClient({
      reviewCount: { data: [{ review_count: 10 }], error: null },
    });
    (createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(mock);

    const stats = await getEstimationStats();
    expect(stats).not.toBeNull();
  });

  it("returns null when step stats RPC fails", async () => {
    const mock = buildMockClient({
      stepStats: { data: null, error: { message: "connection error" } },
    });
    (createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(mock);

    const stats = await getEstimationStats();
    expect(stats).toBeNull();
  });

  it("returns null when step stats RPC returns empty array", async () => {
    const mock = buildMockClient({
      stepStats: { data: [], error: null },
    });
    (createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(mock);

    const stats = await getEstimationStats();
    expect(stats).toBeNull();
  });

  it("uses default for missing step in partial step data", async () => {
    const mock = buildMockClient({
      stepStats: {
        data: [
          { pipeline_step: "answer_analysis", avg_cost_usd: 0.04, call_count: 30 },
          { pipeline_step: "scoring", avg_cost_usd: 0.05, call_count: 10 },
        ],
        error: null,
      },
    });
    (createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(mock);

    const stats = await getEstimationStats();
    expect(stats).not.toBeNull();
    expect(stats!.steps.answer_analysis.avgCostUsd).toBe(0.04);
    expect(stats!.steps.cross_reference.avgCostUsd).toBe(0);
    expect(stats!.steps.cross_reference.callCount).toBe(0);
    expect(stats!.steps.scoring.avgCostUsd).toBe(0.05);
  });
});
