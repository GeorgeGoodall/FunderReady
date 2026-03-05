import { describe, it, expect } from "vitest";
import { ScrapeUsageTracker } from "../scrape-usage";

describe("ScrapeUsageTracker", () => {
  it("starts with zero totals", () => {
    const tracker = new ScrapeUsageTracker();
    const summary = tracker.getSummary();

    expect(summary.totalCalls).toBe(0);
    expect(summary.filterLinksCalls).toBe(0);
    expect(summary.relevanceCheckCalls).toBe(0);
    expect(summary.inputTokens).toBe(0);
    expect(summary.outputTokens).toBe(0);
    expect(summary.costUsd).toBe(0);
    expect(summary.costGbp).toBe(0);
  });

  it("accumulates filter links usage", () => {
    const tracker = new ScrapeUsageTracker();
    tracker.addFilterLinks({ input_tokens: 100, output_tokens: 50 });
    tracker.addFilterLinks({ input_tokens: 200, output_tokens: 30 });

    const summary = tracker.getSummary();
    expect(summary.totalCalls).toBe(2);
    expect(summary.filterLinksCalls).toBe(2);
    expect(summary.relevanceCheckCalls).toBe(0);
    expect(summary.inputTokens).toBe(300);
    expect(summary.outputTokens).toBe(80);
    expect(summary.costUsd).toBeGreaterThan(0);
  });

  it("accumulates relevance check usage", () => {
    const tracker = new ScrapeUsageTracker();
    tracker.addRelevanceCheck({ input_tokens: 500, output_tokens: 20 });

    const summary = tracker.getSummary();
    expect(summary.totalCalls).toBe(1);
    expect(summary.filterLinksCalls).toBe(0);
    expect(summary.relevanceCheckCalls).toBe(1);
    expect(summary.inputTokens).toBe(500);
    expect(summary.outputTokens).toBe(20);
  });

  it("accumulates mixed calls correctly", () => {
    const tracker = new ScrapeUsageTracker();
    tracker.addFilterLinks({ input_tokens: 100, output_tokens: 50 });
    tracker.addRelevanceCheck({ input_tokens: 200, output_tokens: 20 });
    tracker.addRelevanceCheck({ input_tokens: 150, output_tokens: 15 });

    const summary = tracker.getSummary();
    expect(summary.totalCalls).toBe(3);
    expect(summary.filterLinksCalls).toBe(1);
    expect(summary.relevanceCheckCalls).toBe(2);
    expect(summary.inputTokens).toBe(450);
    expect(summary.outputTokens).toBe(85);
  });

  it("tracks cache tokens", () => {
    const tracker = new ScrapeUsageTracker();
    tracker.addFilterLinks({
      input_tokens: 100,
      output_tokens: 50,
      cache_creation_input_tokens: 80,
      cache_read_input_tokens: 20,
    });

    const summary = tracker.getSummary();
    expect(summary.cacheWriteTokens).toBe(80);
    expect(summary.cacheReadTokens).toBe(20);
  });
});
