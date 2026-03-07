import { describe, it, expect } from "vitest";
import { estimateReviewCost, estimateReviewCostWithStats } from "../estimate-review-cost";
import type { EstimationStats } from "../estimation-stats";

const mockStats: EstimationStats = {
  steps: {
    answer_analysis: { avgCostUsd: 0.035, callCount: 50 },
    cross_reference: { avgCostUsd: 0.08, callCount: 15 },
    scoring: { avgCostUsd: 0.06, callCount: 15 },
  },
  avgAnswerChars: 500,
  fetchedAt: Date.now(),
};

describe("estimateReviewCostWithStats", () => {
  it("returns estimate based on historical stats", () => {
    const result = estimateReviewCostWithStats(
      5, 10,
      Array(5).fill("x".repeat(500)),
      mockStats
    );
    expect(result).not.toBeNull();
    expect(result!.low).toBeGreaterThan(0);
    expect(result!.high).toBeGreaterThan(result!.low);
  });

  it("scales up for longer-than-average answers", () => {
    const shortAnswers = Array(5).fill("x".repeat(250));
    const longAnswers = Array(5).fill("x".repeat(1000));

    const short = estimateReviewCostWithStats(5, 5, shortAnswers, mockStats);
    const long = estimateReviewCostWithStats(5, 5, longAnswers, mockStats);

    expect(long!.low).toBeGreaterThanOrEqual(short!.low);
    expect(long!.high).toBeGreaterThan(short!.high);
  });

  it("returns null when stats is null", () => {
    const result = estimateReviewCostWithStats(5, 10, [], null);
    expect(result).toBeNull();
  });

  it("applies 0.9x-1.2x range", () => {
    const result = estimateReviewCostWithStats(
      10, 10,
      Array(10).fill("x".repeat(500)),
      mockStats
    );
    expect(result!.low).toBeLessThanOrEqual(result!.high);
  });

  it("returns at least 1 for low when there are answers", () => {
    const result = estimateReviewCostWithStats(1, 1, ["hello"], mockStats);
    expect(result!.low).toBeGreaterThanOrEqual(1);
  });

  it("returns {low:0, high:0} when totalEnabled is 0", () => {
    const result = estimateReviewCostWithStats(0, 0, [], mockStats);
    expect(result).toEqual({ low: 0, high: 0 });
  });

  it("zero fresh answers still costs overhead for cross-ref and scoring", () => {
    const result = estimateReviewCostWithStats(
      0, 10,
      Array(10).fill("x".repeat(500)),
      mockStats
    );
    expect(result!.low).toBeGreaterThanOrEqual(1);
  });

  it("uses historical avg chars when no answer texts provided", () => {
    const result = estimateReviewCostWithStats(5, 5, [], mockStats);
    // Should not be null — stats exist, just no texts to compare
    expect(result).not.toBeNull();
  });
});

describe("estimateReviewCost (fallback)", () => {
  it("returns a range with low and high for a small app", () => {
    const result = estimateReviewCost(3);
    expect(result.low).toBeGreaterThan(0);
    expect(result.high).toBeGreaterThan(result.low);
  });

  it("returns higher range for more fresh answers", () => {
    const small = estimateReviewCost(3);
    const large = estimateReviewCost(25);
    expect(large.low).toBeGreaterThan(small.low);
    expect(large.high).toBeGreaterThan(small.high);
  });

  it("returns at least 1 for low", () => {
    const result = estimateReviewCost(1);
    expect(result.low).toBeGreaterThanOrEqual(1);
  });

  it("handles zero answers", () => {
    const result = estimateReviewCost(0);
    expect(result.low).toBe(0);
    expect(result.high).toBe(0);
  });

  it("re-review with no changes costs much less than first review", () => {
    const firstReview = estimateReviewCost(15, 15);
    const reReview = estimateReviewCost(1, 15);
    expect(reReview.high).toBeLessThan(firstReview.low);
  });

  it("re-review with all changes costs same as first review", () => {
    const firstReview = estimateReviewCost(15);
    const allChanged = estimateReviewCost(15, 15);
    expect(allChanged.low).toBe(firstReview.low);
    expect(allChanged.high).toBe(firstReview.high);
  });

  it("defaults totalEnabledCount to freshAnswerCount when not provided", () => {
    const withoutTotal = estimateReviewCost(10);
    const withTotal = estimateReviewCost(10, 10);
    expect(withoutTotal.low).toBe(withTotal.low);
    expect(withoutTotal.high).toBe(withTotal.high);
  });

  it("zero fresh answers still costs overhead for cross-ref and scoring", () => {
    const result = estimateReviewCost(0, 10);
    expect(result.low).toBeGreaterThanOrEqual(1);
    expect(result.high).toBeGreaterThan(0);
  });
});
