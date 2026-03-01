import { describe, it, expect } from "vitest";
import { calculateCost, MODEL_PRICING, USD_TO_GBP } from "../pricing";

describe("calculateCost", () => {
  it("calculates correct cost for Sonnet", () => {
    const result = calculateCost("claude-sonnet-4-6", {
      input_tokens: 1000,
      output_tokens: 500,
    });

    // input: 1000 * 3.00 / 1M = 0.003
    // output: 500 * 15.00 / 1M = 0.0075
    expect(result.cost_usd).toBeCloseTo(0.0105, 6);
    expect(result.cost_gbp).toBeCloseTo(0.0105 * USD_TO_GBP, 6);
  });

  it("calculates correct cost for Haiku", () => {
    const result = calculateCost("claude-haiku-4-5-20251001", {
      input_tokens: 2000,
      output_tokens: 1000,
    });

    // input: 2000 * 0.80 / 1M = 0.0016
    // output: 1000 * 4.00 / 1M = 0.004
    expect(result.cost_usd).toBeCloseTo(0.0056, 6);
    expect(result.cost_gbp).toBeCloseTo(0.0056 * USD_TO_GBP, 6);
  });

  it("includes cache token costs", () => {
    const result = calculateCost("claude-sonnet-4-6", {
      input_tokens: 1000,
      output_tokens: 500,
      cache_creation_input_tokens: 2000,
      cache_read_input_tokens: 5000,
    });

    // input: 1000 * 3.00 / 1M = 0.003
    // output: 500 * 15.00 / 1M = 0.0075
    // cache_write: 2000 * 3.75 / 1M = 0.0075
    // cache_read: 5000 * 0.30 / 1M = 0.0015
    expect(result.cost_usd).toBeCloseTo(0.003 + 0.0075 + 0.0075 + 0.0015, 6);
  });

  it("returns zero cost for unknown model", () => {
    const result = calculateCost("unknown-model", {
      input_tokens: 1000,
      output_tokens: 500,
    });

    expect(result.cost_usd).toBe(0);
    expect(result.cost_gbp).toBe(0);
  });

  it("handles zero tokens", () => {
    const result = calculateCost("claude-sonnet-4-6", {
      input_tokens: 0,
      output_tokens: 0,
    });

    expect(result.cost_usd).toBe(0);
    expect(result.cost_gbp).toBe(0);
  });

  it("handles missing cache tokens (undefined)", () => {
    const result = calculateCost("claude-sonnet-4-6", {
      input_tokens: 1000,
      output_tokens: 500,
      cache_creation_input_tokens: undefined,
      cache_read_input_tokens: undefined,
    });

    expect(result.cost_usd).toBeCloseTo(0.0105, 6);
  });

  it("has pricing entries for expected models", () => {
    expect(MODEL_PRICING["claude-sonnet-4-6"]).toBeDefined();
    expect(MODEL_PRICING["claude-haiku-4-5-20251001"]).toBeDefined();
  });
});
