import { describe, it, expect } from "vitest";
import { estimateReviewCost } from "../estimate-review-cost";

describe("estimateReviewCost", () => {
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

  it("re-review with no changes costs much less than first review", () => {
    const firstReview = estimateReviewCost(15, 15); // all fresh
    const reReview = estimateReviewCost(1, 15); // only 1 changed
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
