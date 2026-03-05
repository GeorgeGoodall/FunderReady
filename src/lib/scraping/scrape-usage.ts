import { calculateCost, type TokenUsage } from "../ai/pricing";

const HAIKU_MODEL = "gemini-2.5-flash-lite";

export interface ScrapeUsageSummary {
  totalCalls: number;
  filterLinksCalls: number;
  relevanceCheckCalls: number;
  inputTokens: number;
  outputTokens: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
  costUsd: number;
  costGbp: number;
}

export class ScrapeUsageTracker {
  private filterLinksCalls = 0;
  private relevanceCheckCalls = 0;
  private inputTokens = 0;
  private outputTokens = 0;
  private cacheWriteTokens = 0;
  private cacheReadTokens = 0;
  private costUsd = 0;
  private costGbp = 0;

  private addUsage(usage: TokenUsage): void {
    this.inputTokens += usage.input_tokens;
    this.outputTokens += usage.output_tokens;
    this.cacheWriteTokens += usage.cache_creation_input_tokens ?? 0;
    this.cacheReadTokens += usage.cache_read_input_tokens ?? 0;

    const cost = calculateCost(HAIKU_MODEL, usage);
    this.costUsd += cost.cost_usd;
    this.costGbp += cost.cost_gbp;
  }

  addFilterLinks(usage: TokenUsage): void {
    this.filterLinksCalls++;
    this.addUsage(usage);
  }

  addRelevanceCheck(usage: TokenUsage): void {
    this.relevanceCheckCalls++;
    this.addUsage(usage);
  }

  getSummary(): ScrapeUsageSummary {
    return {
      totalCalls: this.filterLinksCalls + this.relevanceCheckCalls,
      filterLinksCalls: this.filterLinksCalls,
      relevanceCheckCalls: this.relevanceCheckCalls,
      inputTokens: this.inputTokens,
      outputTokens: this.outputTokens,
      cacheWriteTokens: this.cacheWriteTokens,
      cacheReadTokens: this.cacheReadTokens,
      costUsd: Math.round(this.costUsd * 1_000_000) / 1_000_000,
      costGbp: Math.round(this.costGbp * 1_000_000) / 1_000_000,
    };
  }
}
