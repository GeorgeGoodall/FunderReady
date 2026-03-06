import { describe, it, expect } from "vitest";
import { estimateReviewCost } from "../estimate-review-cost";

describe("estimateReviewCost", () => {
  it("returns a range with low and high for a small app", () => {
    const result = estimateReviewCost(3);
    expect(result.low).toBeGreaterThan(0);
    expect(result.high).toBeGreaterThan(result.low);
  });

  it("returns higher range for more answers", () => {
    const small = estimateReviewCost(3);
    const large = estimateReviewCost(25);
    expect(large.low).toBeGreaterThan(small.low);
    expect(large.high).toBeGreaterThan(small.high);
  });

  it("high estimate includes buffer above low", () => {
    const result = estimateReviewCost(10);
    expect(result.high).toBeGreaterThan(result.low);
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

  it("produces reasonable estimates for typical sizes", () => {
    // Small (3-5 Qs): ~3-5 credits
    const small = estimateReviewCost(5);
    expect(small.low).toBeGreaterThanOrEqual(3);
    expect(small.high).toBeLessThanOrEqual(10);

    // Medium (10-15 Qs): ~8-12 credits
    const medium = estimateReviewCost(12);
    expect(medium.low).toBeGreaterThanOrEqual(7);
    expect(medium.high).toBeLessThanOrEqual(20);

    // Large (25-30 Qs): ~20-30 credits
    const large = estimateReviewCost(28);
    expect(large.low).toBeGreaterThanOrEqual(15);
    expect(large.high).toBeLessThanOrEqual(35);
  });
});
