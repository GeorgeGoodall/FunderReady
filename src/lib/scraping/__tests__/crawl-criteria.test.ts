import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the dependencies
vi.mock("../scrape-url", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../scrape-url")>();
  return {
    ...actual,
    scrapeUrl: vi.fn(),
  };
});

vi.mock("../../ai/filter-links", () => ({
  filterLinksForCriteria: vi.fn(),
}));

vi.mock("../../ai/check-criteria-relevance", () => ({
  checkCriteriaRelevance: vi.fn(),
}));

vi.mock("../scrape-logger", () => ({
  createScrapeLogger: () => ({
    log: vi.fn(),
    getLogPath: () => "/tmp/test.log",
  }),
}));

import { crawlForCriteria, type CrawlProgress } from "../crawl-criteria";
import { scrapeUrl } from "../scrape-url";
import { filterLinksForCriteria } from "../../ai/filter-links";
import { checkCriteriaRelevance } from "../../ai/check-criteria-relevance";
import type { FilterLinksResult } from "../../ai/filter-links";
import type { RelevanceResult } from "../../ai/check-criteria-relevance";
import type { LinkCandidate } from "../../ai/filter-links";

const mockScrapeUrl = vi.mocked(scrapeUrl);
const mockFilterLinks = vi.mocked(filterLinksForCriteria);
const mockCheckRelevance = vi.mocked(checkCriteriaRelevance);

const mockUsage = { input_tokens: 100, output_tokens: 50, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };

function makeFilterResult(
  selected: LinkCandidate[],
  allLinks: LinkCandidate[]
): FilterLinksResult {
  const selectedIndices = selected.map((s) =>
    allLinks.findIndex((l) => l.url === s.url)
  );
  return { selected, allLinks, selectedIndices, rawAiResponse: "{}", usage: mockUsage };
}

function makeRelevanceResult(
  relevant: boolean,
  confidence = 0.9
): RelevanceResult {
  return { relevant, confidence, rawAiResponse: "{}", usage: mockUsage };
}

describe("crawlForCriteria", () => {
  beforeEach(() => {
    mockScrapeUrl.mockReset();
    mockFilterLinks.mockReset();
    mockCheckRelevance.mockReset();
  });

  it("scrapes main page and returns content when no links found", async () => {
    mockScrapeUrl.mockResolvedValue({
      url: "https://example.com/grants",
      content: "# Grant Criteria\n\nMust demonstrate need.",
      links: [],
    });

    const result = await crawlForCriteria("https://example.com/grants");

    expect(result.content).toContain("Must demonstrate need");
    expect(result.pagesScraped).toBe(1);
    expect(mockFilterLinks).not.toHaveBeenCalled();
  });

  it("follows criteria-relevant links at depth 1", async () => {
    const allLinks = [
      { url: "https://example.com/grants/criteria", text: "Assessment Criteria", context: "How we score." },
      { url: "https://example.com/grants/about", text: "About Us", context: "Our team." },
    ];

    mockScrapeUrl.mockResolvedValueOnce({
      url: "https://example.com/grants",
      content: "# Overview\n\nWe fund great projects.",
      links: allLinks,
    });

    mockScrapeUrl.mockResolvedValueOnce({
      url: "https://example.com/grants/criteria",
      content: "# Criteria\n\n1. Clear need (25%)\n2. Outcomes (25%)",
      links: [],
    });

    mockFilterLinks.mockResolvedValue(
      makeFilterResult([allLinks[0]], allLinks)
    );

    mockCheckRelevance.mockResolvedValue(makeRelevanceResult(true));

    const result = await crawlForCriteria("https://example.com/grants");

    expect(result.content).toContain("We fund great projects");
    expect(result.content).toContain("Clear need (25%)");
    expect(result.pagesScraped).toBe(2);
  });

  it("does not exceed max depth of 5", async () => {
    // Build a chain: d0 → d1 → d2 → d3 → d4 → d5 → d6
    // With MAX_DEPTH=5, links at depth 5 should NOT be followed (d6 unreachable)
    for (let i = 0; i <= 5; i++) {
      mockScrapeUrl.mockResolvedValueOnce({
        url: `https://example.com/grants/d${i}`,
        content: `Depth ${i} content.`,
        links: [{ url: `https://example.com/grants/d${i + 1}`, text: `Link to d${i + 1}`, context: "Details." }],
      });
    }

    for (let i = 0; i <= 5; i++) {
      const link = { url: `https://example.com/grants/d${i + 1}`, text: `Link to d${i + 1}`, context: "Details." };
      mockFilterLinks.mockResolvedValueOnce(makeFilterResult([link], [link]));
    }

    mockCheckRelevance.mockResolvedValue(makeRelevanceResult(true));

    const result = await crawlForCriteria("https://example.com/grants/d0");

    expect(result.content).toContain("Depth 0 content");
    expect(result.content).toContain("Depth 4 content");
    // d6 should NOT be reached (depth 5 links not followed)
    expect(mockScrapeUrl).not.toHaveBeenCalledWith("https://example.com/grants/d6");
  });

  it("filters out off-domain links before AI analysis", async () => {
    const links = [
      { url: "https://example.com/grants/criteria", text: "Criteria", context: "Assessment." },
      { url: "https://other-domain.com/page", text: "External", context: "Off-site." },
    ];

    mockScrapeUrl.mockResolvedValueOnce({
      url: "https://example.com/grants",
      content: "Main content.",
      links,
    });

    mockScrapeUrl.mockResolvedValueOnce({
      url: "https://example.com/grants/criteria",
      content: "Criteria content.",
      links: [],
    });

    const sameDomainLink = links[0];
    mockFilterLinks.mockResolvedValue(
      makeFilterResult([sameDomainLink], [sameDomainLink])
    );
    mockCheckRelevance.mockResolvedValue(makeRelevanceResult(true));

    const result = await crawlForCriteria("https://example.com/grants");

    expect(result.content).toContain("Criteria content");
    // Off-domain URL should never be fetched
    expect(mockScrapeUrl).not.toHaveBeenCalledWith("https://other-domain.com/page");
    // AI filter should only receive same-domain links
    expect(mockFilterLinks).toHaveBeenCalledWith(
      [sameDomainLink],
      undefined
    );
  });

  it("does not exceed max pages limit", async () => {
    const manyLinks = Array.from({ length: 20 }, (_, i) => ({
      url: `https://example.com/grants/page${i}`,
      text: `Page ${i}`,
      context: "Criteria related.",
    }));

    mockScrapeUrl.mockResolvedValue({
      url: "https://example.com/grants/page",
      content: "Page content.",
      links: manyLinks,
    });

    mockFilterLinks.mockImplementation(async (links) =>
      makeFilterResult(
        (links as LinkCandidate[]).slice(0, 15),
        links as LinkCandidate[]
      )
    );
    mockCheckRelevance.mockResolvedValue(makeRelevanceResult(true));

    const result = await crawlForCriteria("https://example.com/grants/page");

    expect(result.pagesScraped).toBeLessThanOrEqual(40);
  });

  it("deduplicates URLs across the crawl", async () => {
    const dupeLinks = [
      { url: "https://example.com/grants/criteria", text: "Criteria", context: "Assessment." },
      { url: "https://example.com/grants/criteria", text: "Criteria Again", context: "Duplicate." },
    ];

    mockScrapeUrl.mockResolvedValueOnce({
      url: "https://example.com/grants",
      content: "Main content.",
      links: dupeLinks,
    });

    mockScrapeUrl.mockResolvedValueOnce({
      url: "https://example.com/grants/criteria",
      content: "Criteria content.",
      links: [],
    });

    mockFilterLinks.mockResolvedValue(makeFilterResult(dupeLinks, dupeLinks));

    mockCheckRelevance.mockResolvedValue(makeRelevanceResult(true));

    await crawlForCriteria("https://example.com/grants");

    expect(mockScrapeUrl).toHaveBeenCalledTimes(2);
  });

  it("emits progress events via callback", async () => {
    mockScrapeUrl.mockResolvedValue({
      url: "https://example.com/grants",
      content: "Content.",
      links: [],
    });

    const events: CrawlProgress[] = [];
    await crawlForCriteria("https://example.com/grants", {
      onProgress: (event) => events.push(event),
    });

    expect(events.some((e) => e.stage === "fetching_main")).toBe(true);
    expect(events.some((e) => e.stage === "complete")).toBe(true);
  });

  it("returns usage summary in crawl result", async () => {
    const allLinks = [
      { url: "https://example.com/grants/criteria", text: "Criteria", context: "Assessment." },
    ];

    mockScrapeUrl.mockResolvedValueOnce({
      url: "https://example.com/grants",
      content: "Main content.",
      links: allLinks,
    });

    mockScrapeUrl.mockResolvedValueOnce({
      url: "https://example.com/grants/criteria",
      content: "Criteria content.",
      links: [],
    });

    mockFilterLinks.mockResolvedValue(makeFilterResult(allLinks, allLinks));
    mockCheckRelevance.mockResolvedValue(makeRelevanceResult(true));

    const result = await crawlForCriteria("https://example.com/grants");

    expect(result.usage).toBeDefined();
    expect(result.usage.totalCalls).toBe(2); // 1 filter + 1 relevance
    expect(result.usage.filterLinksCalls).toBe(1);
    expect(result.usage.relevanceCheckCalls).toBe(1);
    expect(result.usage.inputTokens).toBe(200); // 100 * 2
    expect(result.usage.outputTokens).toBe(100); // 50 * 2
    expect(result.usage.costUsd).toBeGreaterThan(0);
  });

  it("emits usage_update progress events", async () => {
    const allLinks = [
      { url: "https://example.com/grants/criteria", text: "Criteria", context: "Assessment." },
    ];

    mockScrapeUrl.mockResolvedValueOnce({
      url: "https://example.com/grants",
      content: "Main content.",
      links: allLinks,
    });

    mockScrapeUrl.mockResolvedValueOnce({
      url: "https://example.com/grants/criteria",
      content: "Criteria content.",
      links: [],
    });

    mockFilterLinks.mockResolvedValue(makeFilterResult(allLinks, allLinks));
    mockCheckRelevance.mockResolvedValue(makeRelevanceResult(true));

    const events: CrawlProgress[] = [];
    await crawlForCriteria("https://example.com/grants", {
      onProgress: (e) => events.push(e),
    });

    const usageEvents = events.filter((e) => e.stage === "usage_update");
    expect(usageEvents.length).toBe(2); // one after filter, one after relevance
    expect(usageEvents[0].detail).toHaveProperty("totalCalls", 1);
    expect(usageEvents[1].detail).toHaveProperty("totalCalls", 2);
  });

  it("includes usage in complete event detail", async () => {
    mockScrapeUrl.mockResolvedValue({
      url: "https://example.com/grants",
      content: "Content.",
      links: [],
    });

    const events: CrawlProgress[] = [];
    await crawlForCriteria("https://example.com/grants", {
      onProgress: (e) => events.push(e),
    });

    const completeEvent = events.find((e) => e.stage === "complete");
    expect(completeEvent?.detail).toHaveProperty("usage");
    expect(((completeEvent?.detail as Record<string, unknown>)?.usage as Record<string, unknown>).totalCalls).toBe(0);
  });

  it("recurses through non-relevant hub pages to find criteria deeper down", async () => {
    // Root → Hub (not relevant) → Criteria (relevant)
    // The hub page itself isn't criteria, but it links to a criteria page
    const hubLink = { url: "https://example.com/programmes", text: "Our Programmes", context: "View our funding programmes." };
    const criteriaLink = { url: "https://example.com/programmes/criteria", text: "Assessment Criteria", context: "How we score." };

    // Root page with link to hub
    mockScrapeUrl.mockResolvedValueOnce({
      url: "https://example.com",
      content: "Welcome to our grants.",
      links: [hubLink],
    });

    // Hub page — not criteria itself, but links to criteria
    mockScrapeUrl.mockResolvedValueOnce({
      url: "https://example.com/programmes",
      content: "We run several programmes. Click below for details.",
      links: [criteriaLink],
    });

    // Criteria page
    mockScrapeUrl.mockResolvedValueOnce({
      url: "https://example.com/programmes/criteria",
      content: "Applications scored: 1. Need (25%) 2. Outcomes (25%)",
      links: [],
    });

    // AI selects hub link from root, then criteria link from hub
    mockFilterLinks.mockResolvedValueOnce(makeFilterResult([hubLink], [hubLink]));
    mockFilterLinks.mockResolvedValueOnce(makeFilterResult([criteriaLink], [criteriaLink]));

    // Hub is NOT relevant, but criteria page IS
    mockCheckRelevance.mockResolvedValueOnce(makeRelevanceResult(false, 0.2));
    mockCheckRelevance.mockResolvedValueOnce(makeRelevanceResult(true, 0.95));

    const result = await crawlForCriteria("https://example.com");

    // Hub content should NOT be collected
    expect(result.content).not.toContain("We run several programmes");
    // Criteria content SHOULD be collected (reached via hub)
    expect(result.content).toContain("Applications scored");
    // pagesScraped = collected pages (root + criteria, not hub)
    expect(result.pagesScraped).toBe(2);
    // But all 3 pages were fetched
    expect(mockScrapeUrl).toHaveBeenCalledTimes(3);
  });

  it("filters out pages that fail relevance check", async () => {
    const links = [
      { url: "https://example.com/grants/criteria", text: "Criteria", context: "Assessment." },
      { url: "https://example.com/grants/about", text: "About", context: "Company info." },
    ];

    mockScrapeUrl.mockResolvedValueOnce({
      url: "https://example.com/grants",
      content: "Main content.",
      links,
    });

    mockScrapeUrl.mockResolvedValueOnce({
      url: "https://example.com/grants/criteria",
      content: "Criteria content.",
      links: [],
    });

    mockScrapeUrl.mockResolvedValueOnce({
      url: "https://example.com/grants/about",
      content: "About us content.",
      links: [],
    });

    mockFilterLinks.mockResolvedValue(makeFilterResult(links, links));

    mockCheckRelevance.mockResolvedValueOnce(makeRelevanceResult(true));
    mockCheckRelevance.mockResolvedValueOnce(makeRelevanceResult(false, 0.8));

    const result = await crawlForCriteria("https://example.com/grants");

    expect(result.content).toContain("Main content");
    expect(result.content).toContain("Criteria content");
    expect(result.content).not.toContain("About us content");
  });

  it("filters out links with different language path prefix", async () => {
    const links = [
      { url: "https://example.com/grants/criteria", text: "Criteria", context: "Assessment." },
      { url: "https://example.com/grantiau/meini-prawf", text: "Meini Prawf", context: "Welsh criteria." },
    ];

    mockScrapeUrl.mockResolvedValueOnce({
      url: "https://example.com/grants",
      content: "Main content.",
      links,
    });

    mockScrapeUrl.mockResolvedValueOnce({
      url: "https://example.com/grants/criteria",
      content: "Criteria content.",
      links: [],
    });

    const samePrefixLink = links[0];
    mockFilterLinks.mockResolvedValue(
      makeFilterResult([samePrefixLink], [samePrefixLink])
    );
    mockCheckRelevance.mockResolvedValue(makeRelevanceResult(true));

    const result = await crawlForCriteria("https://example.com/grants");

    expect(result.content).toContain("Criteria content");
    // Welsh path should never be fetched
    expect(mockScrapeUrl).not.toHaveBeenCalledWith("https://example.com/grantiau/meini-prawf");
    // AI filter should only receive same-prefix links
    expect(mockFilterLinks).toHaveBeenCalledWith(
      [samePrefixLink],
      undefined
    );
  });
});
