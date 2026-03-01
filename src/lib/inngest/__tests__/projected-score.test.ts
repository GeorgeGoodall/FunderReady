import { describe, it, expect } from "vitest";
import { computeProjectedScore } from "../application-review";

describe("computeProjectedScore", () => {
  it("returns current score when there are no gaps", () => {
    expect(computeProjectedScore(72, 0, 10)).toBe(72);
  });

  it("returns current score when gapCount is negative (guard)", () => {
    expect(computeProjectedScore(72, -1, 10)).toBe(72);
  });

  it("returns current score when totalCriteriaCount is zero (guard)", () => {
    expect(computeProjectedScore(72, 3, 0)).toBe(72);
  });

  it("adds the correct increment per gap", () => {
    // 10 criteria, 2 gaps → each gap = 10 points → projected = 60 + 20 = 80
    expect(computeProjectedScore(60, 2, 10)).toBe(80);
  });

  it("caps at 100 when arithmetic would exceed it", () => {
    // 4 criteria, 3 gaps from a score of 80 → 80 + 3*(25) = 155 → capped at 100
    expect(computeProjectedScore(80, 3, 4)).toBe(100);
  });

  it("handles single gap correctly", () => {
    // 5 criteria, 1 gap → increment = 20 → 50 + 20 = 70
    expect(computeProjectedScore(50, 1, 5)).toBe(70);
  });

  it("handles all criteria as gaps", () => {
    // 4 criteria, 4 gaps from score of 0 → 0 + 4*(25) = 100
    expect(computeProjectedScore(0, 4, 4)).toBe(100);
  });

  it("returns current score when totalCriteriaCount is negative (guard)", () => {
    expect(computeProjectedScore(72, 2, -5)).toBe(72);
  });

  it("handles fractional increment results", () => {
    // 3 criteria, 1 gap → increment = 100/3 ≈ 33.33 → 60 + 33.33 = 93.33
    const result = computeProjectedScore(60, 1, 3);
    expect(result).toBeCloseTo(93.33, 1);
  });

  it("caps at 100 when current score is already 100", () => {
    expect(computeProjectedScore(100, 2, 5)).toBe(100);
  });
});
