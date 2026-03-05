/**
 * Model pricing and cost calculation for AI usage tracking.
 * Prices are per million tokens (as published by Anthropic).
 */

export interface ModelPricing {
  input: number;
  output: number;
  cache_write: number;
  cache_read: number;
}

// Prices in USD per million tokens
export const MODEL_PRICING: Record<string, ModelPricing> = {
  "claude-sonnet-4-6": {
    input: 3.0,
    output: 15.0,
    cache_write: 3.75,
    cache_read: 0.3,
  },
  "claude-haiku-4-5-20251001": {
    input: 0.8,
    output: 4.0,
    cache_write: 1.0,
    cache_read: 0.08,
  },
  "gemini-2.5-flash-lite": {
    input: 0.075,
    output: 0.30,
    cache_write: 0,
    cache_read: 0,
  },
};

export const USD_TO_GBP = 0.79;

export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

export interface CostResult {
  cost_usd: number;
  cost_gbp: number;
}

export function calculateCost(model: string, usage: TokenUsage): CostResult {
  const pricing = MODEL_PRICING[model];
  if (!pricing) {
    // Unknown model — return zero cost rather than throwing
    return { cost_usd: 0, cost_gbp: 0 };
  }

  const cost_usd =
    (usage.input_tokens * pricing.input) / 1_000_000 +
    (usage.output_tokens * pricing.output) / 1_000_000 +
    ((usage.cache_creation_input_tokens ?? 0) * pricing.cache_write) / 1_000_000 +
    ((usage.cache_read_input_tokens ?? 0) * pricing.cache_read) / 1_000_000;

  return {
    cost_usd: Math.round(cost_usd * 1_000_000) / 1_000_000,
    cost_gbp: Math.round(cost_usd * USD_TO_GBP * 1_000_000) / 1_000_000,
  };
}
