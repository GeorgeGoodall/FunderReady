import { describe, it, expect } from "vitest";
import { calculateCreditsFromCost } from "../calculate-credits";

describe("calculateCreditsFromCost", () => {
  it("rounds up to nearest credit", () => {
    // $0.12 / $0.05 = 2.4 → 3 credits
    expect(calculateCreditsFromCost(0.12)).toBe(3);
  });

  it("exact multiple returns exact credits", () => {
    // $0.10 / $0.05 = 2.0 → 2 credits
    expect(calculateCreditsFromCost(0.10)).toBe(2);
  });

  it("returns 0 for zero cost", () => {
    expect(calculateCreditsFromCost(0)).toBe(0);
  });

  it("returns 1 for very small cost", () => {
    expect(calculateCreditsFromCost(0.001)).toBe(1);
  });

  it("handles typical small review cost", () => {
    // ~$0.15 → 3 credits
    expect(calculateCreditsFromCost(0.15)).toBe(3);
  });

  it("handles typical large review cost", () => {
    // ~$1.20 → 24 credits
    expect(calculateCreditsFromCost(1.20)).toBe(24);
  });
});
