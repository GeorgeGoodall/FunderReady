# URL-Based Criteria Scraping — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow admins to enter a funder URL, scrape the page and linked pages for criteria content, and populate the criteria textarea for AI parsing.

**Architecture:** A new `/api/admin/scrape-criteria` SSE endpoint fetches a URL, extracts clean text using Readability + Turndown, uses Haiku AI to identify and follow criteria-related links (depth 2 max), and returns concatenated criteria text. The CriteriaInput component gains a URL input section visible only to admins.

**Tech Stack:** `@mozilla/readability` (content extraction), `turndown` (HTML→markdown), Anthropic Haiku (link filtering + relevance checks), SSE (progress streaming), Next.js API route

---

### Task 1: Install Dependencies

**Files:**
- Modify: `package.json`

**Step 1: Install readability and turndown**

```bash
cd app && npm install @mozilla/readability turndown && npm install -D @types/turndown
```

Note: `@mozilla/readability` uses JSDOM internally. JSDOM is already a dev dependency in this project (`jsdom@^28.1.0`), but Readability needs it at runtime. Install it as a production dependency too:

```bash
npm install jsdom
```

**Step 2: Verify install**

```bash
npm ls @mozilla/readability turndown jsdom
```

Expected: All three packages listed without errors.

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add readability, turndown, jsdom for URL scraping"
```

---

### Task 2: Core URL Scraper (`scrape-url.ts`)

**Files:**
- Create: `src/lib/scraping/scrape-url.ts`
- Create: `src/lib/scraping/__tests__/scrape-url.test.ts`

This module fetches a URL, extracts readable content using Readability, converts to markdown with Turndown, and extracts links with surrounding context.

**Step 1: Write the failing tests**

Create `src/lib/scraping/__tests__/scrape-url.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { scrapeUrl, type ScrapeResult } from "../scrape-url";

const SIMPLE_HTML = `
<!DOCTYPE html>
<html><head><title>Test Fund</title></head>
<body>
  <nav><a href="/home">Home</a></nav>
  <article>
    <h1>Grant Criteria</h1>
    <p>Applicants must demonstrate clear need for funding.</p>
    <p>Projects should deliver measurable outcomes.</p>
    <a href="/eligibility">Eligibility Requirements</a>
    <a href="/scoring">How We Score Applications</a>
    <a href="https://external.com/other">External Link</a>
    <a href="/logo.png">Download Logo</a>
  </article>
  <footer><a href="/privacy">Privacy</a></footer>
</body></html>
`;

describe("scrapeUrl", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("extracts readable text content from HTML", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "text/html" }),
      text: async () => SIMPLE_HTML,
    });

    const result = await scrapeUrl("https://example.com/grants");

    expect(result.content).toContain("clear need for funding");
    expect(result.content).toContain("measurable outcomes");
    expect(result.url).toBe("https://example.com/grants");
  });

  it("extracts links with context from same domain", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "text/html" }),
      text: async () => SIMPLE_HTML,
    });

    const result = await scrapeUrl("https://example.com/grants");

    // Should include same-domain links
    const hrefs = result.links.map((l) => l.url);
    expect(hrefs).toContain("https://example.com/eligibility");
    expect(hrefs).toContain("https://example.com/scoring");

    // Should exclude external domain links
    expect(hrefs).not.toContain("https://external.com/other");

    // Should exclude non-content links (images)
    const hasImage = result.links.some((l) => l.url.endsWith(".png"));
    expect(hasImage).toBe(false);

    // Each link should have text and context
    const eligLink = result.links.find((l) => l.url.includes("eligibility"));
    expect(eligLink?.text).toBe("Eligibility Requirements");
    expect(eligLink?.context).toBeTruthy();
  });

  it("throws on HTTP error responses", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      headers: new Headers({ "content-type": "text/html" }),
      text: async () => "Not found",
    });

    await expect(scrapeUrl("https://example.com/missing")).rejects.toThrow(
      /404/
    );
  });

  it("throws on non-HTML content types", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/pdf" }),
      text: async () => "%PDF-1.4...",
    });

    await expect(scrapeUrl("https://example.com/doc.pdf")).rejects.toThrow(
      /PDF/i
    );
  });

  it("returns empty content for pages with no readable text", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "text/html" }),
      text: async () =>
        "<!DOCTYPE html><html><head><title>App</title></head><body><script>loadApp()</script></body></html>",
    });

    const result = await scrapeUrl("https://example.com/spa");
    expect(result.content.trim()).toBe("");
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
cd app && npx vitest run src/lib/scraping/__tests__/scrape-url.test.ts
```

Expected: FAIL — module `../scrape-url` not found.

**Step 3: Write the implementation**

Create `src/lib/scraping/scrape-url.ts`:

```typescript
import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import TurndownService from "turndown";

export interface LinkWithContext {
  url: string;
  text: string;
  context: string; // ~200 chars of surrounding text
}

export interface ScrapeResult {
  url: string;
  content: string; // Clean markdown text
  links: LinkWithContext[];
}

const SKIP_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".ico",
  ".css", ".js", ".woff", ".woff2", ".ttf", ".eot",
  ".mp3", ".mp4", ".avi", ".mov", ".wmv",
  ".zip", ".tar", ".gz", ".rar",
]);

const FETCH_TIMEOUT_MS = 15_000;

function isSkippableUrl(href: string): boolean {
  try {
    const pathname = new URL(href).pathname.toLowerCase();
    return SKIP_EXTENSIONS.has(
      pathname.substring(pathname.lastIndexOf("."))
    );
  } catch {
    return false;
  }
}

function isSameDomain(baseUrl: string, candidateUrl: string): boolean {
  try {
    const base = new URL(baseUrl);
    const candidate = new URL(candidateUrl);
    return base.hostname === candidate.hostname;
  } catch {
    return false;
  }
}

function resolveUrl(base: string, href: string): string | null {
  try {
    return new URL(href, base).href;
  } catch {
    return null;
  }
}

function extractSurroundingContext(
  element: Element,
  maxLength = 200
): string {
  const parent = element.closest("p, li, div, section, article, td") ?? element.parentElement;
  if (!parent) return "";
  const text = parent.textContent?.trim() ?? "";
  return text.slice(0, maxLength);
}

export async function scrapeUrl(url: string): Promise<ScrapeResult> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: {
      "User-Agent": "FunderReady/1.0 (criteria-scraper)",
      Accept: "text/html,application/xhtml+xml",
    },
  });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch URL (${response.status}). Please check the URL is correct and publicly accessible.`
    );
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/pdf")) {
    throw new Error(
      "PDF scraping isn't supported yet. Copy the criteria text from the PDF and paste it below."
    );
  }
  if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
    throw new Error(
      `Unsupported content type: ${contentType}. Expected an HTML page.`
    );
  }

  const html = await response.text();
  const dom = new JSDOM(html, { url });
  const document = dom.window.document;

  // Extract links before Readability modifies the DOM
  const anchors = Array.from(document.querySelectorAll("a[href]"));
  const links: LinkWithContext[] = [];

  for (const anchor of anchors) {
    const href = anchor.getAttribute("href");
    if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("javascript:")) {
      continue;
    }

    const resolved = resolveUrl(url, href);
    if (!resolved) continue;
    if (!isSameDomain(url, resolved)) continue;
    if (isSkippableUrl(resolved)) continue;
    if (resolved === url) continue; // Skip self-links

    links.push({
      url: resolved,
      text: anchor.textContent?.trim() ?? "",
      context: extractSurroundingContext(anchor),
    });
  }

  // Deduplicate links by URL
  const seen = new Set<string>();
  const uniqueLinks = links.filter((link) => {
    if (seen.has(link.url)) return false;
    seen.add(link.url);
    return true;
  });

  // Extract readable content
  const reader = new Readability(document);
  const article = reader.parse();

  let content = "";
  if (article?.content) {
    const turndown = new TurndownService({
      headingStyle: "atx",
      codeBlockStyle: "fenced",
    });
    content = turndown.turndown(article.content);
  }

  return { url, content, links: uniqueLinks };
}
```

**Step 4: Run tests to verify they pass**

```bash
cd app && npx vitest run src/lib/scraping/__tests__/scrape-url.test.ts
```

Expected: All 5 tests PASS.

**Step 5: Commit**

```bash
git add src/lib/scraping/
git commit -m "feat: add core URL scraper with readability and link extraction"
```

---

### Task 3: AI Link Filter (`filter-links.ts`)

**Files:**
- Create: `src/lib/ai/filter-links.ts`
- Create: `src/lib/ai/__tests__/filter-links.test.ts`

This module sends a list of links (with context) to Haiku and asks which ones are likely to contain fund evaluation criteria.

**Step 1: Write the failing tests**

Create `src/lib/ai/__tests__/filter-links.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCreate = vi.fn();

vi.mock("@anthropic-ai/sdk", () => ({
  default: class MockAnthropic {
    messages = { create: mockCreate };
  },
}));

vi.mock("../log-usage", () => ({
  logAiUsage: vi.fn(),
}));

import { filterLinksForCriteria, type LinkCandidate } from "../filter-links";

const mockUsage = { input_tokens: 100, output_tokens: 50 };

describe("filterLinksForCriteria", () => {
  beforeEach(() => {
    mockCreate.mockReset();
  });

  it("returns indices of criteria-relevant links from AI response", async () => {
    const links: LinkCandidate[] = [
      { url: "https://ex.com/about", text: "About Us", context: "Learn about our organisation." },
      { url: "https://ex.com/criteria", text: "Assessment Criteria", context: "How we assess your application." },
      { url: "https://ex.com/contact", text: "Contact", context: "Get in touch with the team." },
      { url: "https://ex.com/scoring", text: "Read more", context: "Scoring matrix and weighting details." },
    ];

    mockCreate.mockResolvedValue({
      usage: mockUsage,
      content: [
        {
          type: "text",
          text: JSON.stringify({ relevant_indices: [1, 3] }),
        },
      ],
    });

    const result = await filterLinksForCriteria(links);

    expect(result).toEqual([
      { url: "https://ex.com/criteria", text: "Assessment Criteria", context: "How we assess your application." },
      { url: "https://ex.com/scoring", text: "Read more", context: "Scoring matrix and weighting details." },
    ]);
  });

  it("returns empty array when AI finds no relevant links", async () => {
    const links: LinkCandidate[] = [
      { url: "https://ex.com/about", text: "About Us", context: "Our history." },
    ];

    mockCreate.mockResolvedValue({
      usage: mockUsage,
      content: [
        { type: "text", text: JSON.stringify({ relevant_indices: [] }) },
      ],
    });

    const result = await filterLinksForCriteria(links);
    expect(result).toEqual([]);
  });

  it("returns empty array when given empty links list", async () => {
    const result = await filterLinksForCriteria([]);
    expect(result).toEqual([]);
    expect(mockCreate).not.toHaveBeenCalled();
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
cd app && npx vitest run src/lib/ai/__tests__/filter-links.test.ts
```

Expected: FAIL — module not found.

**Step 3: Write the implementation**

Create `src/lib/ai/filter-links.ts`:

```typescript
import Anthropic from "@anthropic-ai/sdk";
import { logAiUsage } from "./log-usage";

export interface LinkCandidate {
  url: string;
  text: string;
  context: string;
}

const SYSTEM_PROMPT = `You analyse lists of hyperlinks from funder/grant-maker web pages.

Given a numbered list of links (each with its text, URL, and surrounding page context), identify which links are likely to lead to pages containing fund evaluation criteria, scoring matrices, assessment guidance, or eligibility requirements.

Return ONLY valid JSON: { "relevant_indices": [0, 2, 5] }

The indices are 0-based and refer to the link positions in the input list.

Rules:
- Include links about: criteria, scoring, assessment, eligibility, guidance, how to apply, what we look for, outcomes
- Exclude links about: contact us, privacy, terms, news, blog, social media, careers, login, download logos, newsletters
- When link text is generic (e.g. "Read more", "Learn more"), use the surrounding context to decide
- When unsure, include the link (false positives are better than false negatives)
- Return an empty array if no links are relevant`;

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_client) _client = new Anthropic();
  return _client;
}

export async function filterLinksForCriteria(
  links: LinkCandidate[],
  userId?: string
): Promise<LinkCandidate[]> {
  if (links.length === 0) return [];

  const client = getClient();
  const model = "claude-haiku-4-5-20251001";

  const linksDescription = links
    .map(
      (link, i) =>
        `[${i}] URL: ${link.url}\n    Text: "${link.text}"\n    Context: "${link.context}"`
    )
    .join("\n\n");

  const message = await client.messages.create({
    model,
    max_tokens: 256,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Which of these links are likely to lead to fund evaluation criteria or assessment guidance?\n\n${linksDescription}`,
      },
    ],
  });

  void logAiUsage({
    userId,
    pipelineStep: "filter_links",
    model,
    usage: {
      input_tokens: message.usage.input_tokens,
      output_tokens: message.usage.output_tokens,
      cache_creation_input_tokens:
        (message.usage as unknown as Record<string, number>)
          .cache_creation_input_tokens ?? 0,
      cache_read_input_tokens:
        (message.usage as unknown as Record<string, number>)
          .cache_read_input_tokens ?? 0,
    },
  });

  const textBlock = message.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") return [];

  try {
    let jsonStr = textBlock.text.trim();
    const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) jsonStr = jsonMatch[1].trim();

    const parsed = JSON.parse(jsonStr) as { relevant_indices: number[] };
    if (!Array.isArray(parsed.relevant_indices)) return [];

    return parsed.relevant_indices
      .filter((i) => i >= 0 && i < links.length)
      .map((i) => links[i]);
  } catch {
    return [];
  }
}
```

**Step 4: Run tests to verify they pass**

```bash
cd app && npx vitest run src/lib/ai/__tests__/filter-links.test.ts
```

Expected: All 3 tests PASS.

**Step 5: Commit**

```bash
git add src/lib/ai/filter-links.ts src/lib/ai/__tests__/filter-links.test.ts
git commit -m "feat: add AI link filter for criteria-relevant URLs"
```

---

### Task 4: AI Criteria Relevance Checker (`check-criteria-relevance.ts`)

**Files:**
- Create: `src/lib/ai/check-criteria-relevance.ts`
- Create: `src/lib/ai/__tests__/check-criteria-relevance.test.ts`

This module sends a page's text content to Haiku and asks whether it contains fund evaluation criteria.

**Step 1: Write the failing tests**

Create `src/lib/ai/__tests__/check-criteria-relevance.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCreate = vi.fn();

vi.mock("@anthropic-ai/sdk", () => ({
  default: class MockAnthropic {
    messages = { create: mockCreate };
  },
}));

vi.mock("../log-usage", () => ({
  logAiUsage: vi.fn(),
}));

import { checkCriteriaRelevance } from "../check-criteria-relevance";

const mockUsage = { input_tokens: 100, output_tokens: 20 };

describe("checkCriteriaRelevance", () => {
  beforeEach(() => {
    mockCreate.mockReset();
  });

  it("returns true for criteria-relevant content", async () => {
    mockCreate.mockResolvedValue({
      usage: mockUsage,
      content: [
        {
          type: "text",
          text: JSON.stringify({ relevant: true, confidence: 0.95 }),
        },
      ],
    });

    const result = await checkCriteriaRelevance(
      "Applications will be scored against the following criteria: 1. Demonstrates clear need (25%)..."
    );

    expect(result).toBe(true);
  });

  it("returns false for non-criteria content", async () => {
    mockCreate.mockResolvedValue({
      usage: mockUsage,
      content: [
        {
          type: "text",
          text: JSON.stringify({ relevant: false, confidence: 0.9 }),
        },
      ],
    });

    const result = await checkCriteriaRelevance(
      "Contact us at info@funder.org. Our office hours are 9am-5pm."
    );

    expect(result).toBe(false);
  });

  it("returns false on unparseable AI response", async () => {
    mockCreate.mockResolvedValue({
      usage: mockUsage,
      content: [{ type: "text", text: "I cannot determine..." }],
    });

    const result = await checkCriteriaRelevance("some text");
    expect(result).toBe(false);
  });

  it("returns false for empty content", async () => {
    const result = await checkCriteriaRelevance("");
    expect(result).toBe(false);
    expect(mockCreate).not.toHaveBeenCalled();
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
cd app && npx vitest run src/lib/ai/__tests__/check-criteria-relevance.test.ts
```

Expected: FAIL — module not found.

**Step 3: Write the implementation**

Create `src/lib/ai/check-criteria-relevance.ts`:

```typescript
import Anthropic from "@anthropic-ai/sdk";
import { logAiUsage } from "./log-usage";

const SYSTEM_PROMPT = `You determine whether a web page's text content contains fund/grant evaluation criteria.

Evaluation criteria includes: scoring matrices, assessment criteria, eligibility requirements, funding priorities, what assessors look for, marking schemes, weighting of criteria.

NOT evaluation criteria: general programme descriptions, news articles, FAQs about the application process, contact information, privacy policies, terms of service, staff bios.

Return ONLY valid JSON: { "relevant": true, "confidence": 0.85 }

- "relevant": true if the page contains evaluation criteria, false otherwise
- "confidence": a number between 0 and 1 indicating your confidence`;

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_client) _client = new Anthropic();
  return _client;
}

const CONTENT_PREVIEW_LENGTH = 3000;

export async function checkCriteriaRelevance(
  content: string,
  userId?: string
): Promise<boolean> {
  if (!content.trim()) return false;

  const client = getClient();
  const model = "claude-haiku-4-5-20251001";

  const message = await client.messages.create({
    model,
    max_tokens: 64,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Does this web page content contain fund evaluation criteria?\n\n${content.slice(0, CONTENT_PREVIEW_LENGTH)}`,
      },
    ],
  });

  void logAiUsage({
    userId,
    pipelineStep: "check_criteria_relevance",
    model,
    usage: {
      input_tokens: message.usage.input_tokens,
      output_tokens: message.usage.output_tokens,
      cache_creation_input_tokens:
        (message.usage as unknown as Record<string, number>)
          .cache_creation_input_tokens ?? 0,
      cache_read_input_tokens:
        (message.usage as unknown as Record<string, number>)
          .cache_read_input_tokens ?? 0,
    },
  });

  const textBlock = message.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") return false;

  try {
    let jsonStr = textBlock.text.trim();
    const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) jsonStr = jsonMatch[1].trim();

    const parsed = JSON.parse(jsonStr) as {
      relevant: boolean;
      confidence: number;
    };
    return parsed.relevant === true;
  } catch {
    return false;
  }
}
```

**Step 4: Run tests to verify they pass**

```bash
cd app && npx vitest run src/lib/ai/__tests__/check-criteria-relevance.test.ts
```

Expected: All 4 tests PASS.

**Step 5: Commit**

```bash
git add src/lib/ai/check-criteria-relevance.ts src/lib/ai/__tests__/check-criteria-relevance.test.ts
git commit -m "feat: add AI criteria relevance checker"
```

---

### Task 5: Crawl Orchestrator (`crawl-criteria.ts`)

**Files:**
- Create: `src/lib/scraping/crawl-criteria.ts`
- Create: `src/lib/scraping/__tests__/crawl-criteria.test.ts`

This is the core orchestrator that ties together scraping, link filtering, and relevance checking into a recursive crawl.

**Step 1: Write the failing tests**

Create `src/lib/scraping/__tests__/crawl-criteria.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the dependencies
vi.mock("../scrape-url", () => ({
  scrapeUrl: vi.fn(),
}));

vi.mock("../../ai/filter-links", () => ({
  filterLinksForCriteria: vi.fn(),
}));

vi.mock("../../ai/check-criteria-relevance", () => ({
  checkCriteriaRelevance: vi.fn(),
}));

import { crawlForCriteria, type CrawlProgress } from "../crawl-criteria";
import { scrapeUrl } from "../scrape-url";
import { filterLinksForCriteria } from "../../ai/filter-links";
import { checkCriteriaRelevance } from "../../ai/check-criteria-relevance";

const mockScrapeUrl = vi.mocked(scrapeUrl);
const mockFilterLinks = vi.mocked(filterLinksForCriteria);
const mockCheckRelevance = vi.mocked(checkCriteriaRelevance);

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
    // Main page
    mockScrapeUrl.mockResolvedValueOnce({
      url: "https://example.com/grants",
      content: "# Overview\n\nWe fund great projects.",
      links: [
        { url: "https://example.com/criteria", text: "Assessment Criteria", context: "How we score." },
        { url: "https://example.com/about", text: "About Us", context: "Our team." },
      ],
    });

    // Linked page (criteria)
    mockScrapeUrl.mockResolvedValueOnce({
      url: "https://example.com/criteria",
      content: "# Criteria\n\n1. Clear need (25%)\n2. Outcomes (25%)",
      links: [],
    });

    mockFilterLinks.mockResolvedValue([
      { url: "https://example.com/criteria", text: "Assessment Criteria", context: "How we score." },
    ]);

    mockCheckRelevance.mockResolvedValue(true);

    const result = await crawlForCriteria("https://example.com/grants");

    expect(result.content).toContain("We fund great projects");
    expect(result.content).toContain("Clear need (25%)");
    expect(result.pagesScraped).toBe(2);
  });

  it("does not exceed max depth of 2", async () => {
    // Depth 0 — main page
    mockScrapeUrl.mockResolvedValueOnce({
      url: "https://example.com/d0",
      content: "Depth 0 content.",
      links: [{ url: "https://example.com/d1", text: "Criteria", context: "Details." }],
    });

    // Depth 1
    mockScrapeUrl.mockResolvedValueOnce({
      url: "https://example.com/d1",
      content: "Depth 1 content.",
      links: [{ url: "https://example.com/d2", text: "Sub-criteria", context: "More details." }],
    });

    // Depth 2
    mockScrapeUrl.mockResolvedValueOnce({
      url: "https://example.com/d2",
      content: "Depth 2 content.",
      links: [{ url: "https://example.com/d3", text: "Even more", context: "Should not follow." }],
    });

    mockFilterLinks.mockResolvedValue([
      { url: "https://example.com/d1", text: "Criteria", context: "Details." },
    ]);
    // On second call for d1's links
    mockFilterLinks.mockResolvedValueOnce([
      { url: "https://example.com/d1", text: "Criteria", context: "Details." },
    ]);
    mockFilterLinks.mockResolvedValueOnce([
      { url: "https://example.com/d2", text: "Sub-criteria", context: "More details." },
    ]);

    mockCheckRelevance.mockResolvedValue(true);

    const result = await crawlForCriteria("https://example.com/d0");

    // Should have scraped d0, d1, d2 but NOT d3
    expect(result.pagesScraped).toBeLessThanOrEqual(3);
    expect(result.content).toContain("Depth 0 content");
    expect(result.content).toContain("Depth 1 content");
    // d3 should not be reached
    expect(mockScrapeUrl).not.toHaveBeenCalledWith("https://example.com/d3");
  });

  it("does not exceed max pages limit", async () => {
    // Set up to generate lots of links
    mockScrapeUrl.mockResolvedValue({
      url: "https://example.com/page",
      content: "Page content.",
      links: Array.from({ length: 20 }, (_, i) => ({
        url: `https://example.com/page${i}`,
        text: `Page ${i}`,
        context: "Criteria related.",
      })),
    });

    mockFilterLinks.mockImplementation(async (links) =>
      links.slice(0, 15)
    );
    mockCheckRelevance.mockResolvedValue(true);

    const result = await crawlForCriteria("https://example.com/page");

    // Should cap at MAX_PAGES (10)
    expect(result.pagesScraped).toBeLessThanOrEqual(10);
  });

  it("deduplicates URLs across the crawl", async () => {
    mockScrapeUrl.mockResolvedValueOnce({
      url: "https://example.com/main",
      content: "Main content.",
      links: [
        { url: "https://example.com/criteria", text: "Criteria", context: "Assessment." },
        { url: "https://example.com/criteria", text: "Criteria Again", context: "Duplicate." },
      ],
    });

    mockScrapeUrl.mockResolvedValueOnce({
      url: "https://example.com/criteria",
      content: "Criteria content.",
      links: [],
    });

    mockFilterLinks.mockResolvedValue([
      { url: "https://example.com/criteria", text: "Criteria", context: "Assessment." },
      { url: "https://example.com/criteria", text: "Criteria Again", context: "Duplicate." },
    ]);

    mockCheckRelevance.mockResolvedValue(true);

    const result = await crawlForCriteria("https://example.com/main");

    // scrapeUrl called for main + criteria (once, not twice)
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

  it("filters out pages that fail relevance check", async () => {
    mockScrapeUrl.mockResolvedValueOnce({
      url: "https://example.com/main",
      content: "Main content.",
      links: [
        { url: "https://example.com/criteria", text: "Criteria", context: "Assessment." },
        { url: "https://example.com/about", text: "About", context: "Company info." },
      ],
    });

    mockScrapeUrl.mockResolvedValueOnce({
      url: "https://example.com/criteria",
      content: "Criteria content.",
      links: [],
    });

    mockScrapeUrl.mockResolvedValueOnce({
      url: "https://example.com/about",
      content: "About us content.",
      links: [],
    });

    mockFilterLinks.mockResolvedValue([
      { url: "https://example.com/criteria", text: "Criteria", context: "Assessment." },
      { url: "https://example.com/about", text: "About", context: "Company info." },
    ]);

    // First page relevant, second not
    mockCheckRelevance.mockResolvedValueOnce(true);
    mockCheckRelevance.mockResolvedValueOnce(false);

    const result = await crawlForCriteria("https://example.com/main");

    expect(result.content).toContain("Main content");
    expect(result.content).toContain("Criteria content");
    expect(result.content).not.toContain("About us content");
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
cd app && npx vitest run src/lib/scraping/__tests__/crawl-criteria.test.ts
```

Expected: FAIL — module not found.

**Step 3: Write the implementation**

Create `src/lib/scraping/crawl-criteria.ts`:

```typescript
import { scrapeUrl, type ScrapeResult } from "./scrape-url";
import { filterLinksForCriteria, type LinkCandidate } from "../ai/filter-links";
import { checkCriteriaRelevance } from "../ai/check-criteria-relevance";

const MAX_DEPTH = 2;
const MAX_PAGES = 10;
const MAX_CONTENT_LENGTH = 50_000;

export type CrawlStage =
  | "fetching_main"
  | "analyzing_links"
  | "crawling_page"
  | "checking_relevance"
  | "filtering_content"
  | "complete"
  | "error";

export interface CrawlProgress {
  stage: CrawlStage;
  message: string;
  currentPage?: number;
  totalPages?: number;
}

export interface CrawlResult {
  content: string;
  pagesScraped: number;
  urls: string[];
}

interface CrawlOptions {
  onProgress?: (progress: CrawlProgress) => void;
  userId?: string;
}

export async function crawlForCriteria(
  startUrl: string,
  options: CrawlOptions = {}
): Promise<CrawlResult> {
  const { onProgress, userId } = options;
  const visitedUrls = new Set<string>();
  const collectedContent: { url: string; content: string }[] = [];
  let totalScraped = 0;

  function emit(progress: CrawlProgress) {
    onProgress?.(progress);
  }

  async function crawlPage(url: string, depth: number): Promise<void> {
    if (visitedUrls.has(url)) return;
    if (totalScraped >= MAX_PAGES) return;

    visitedUrls.add(url);
    totalScraped++;

    const isRoot = depth === 0;

    emit({
      stage: isRoot ? "fetching_main" : "crawling_page",
      message: isRoot
        ? "Fetching main page..."
        : `Fetching linked page (${totalScraped}/${MAX_PAGES} max)...`,
      currentPage: totalScraped,
      totalPages: MAX_PAGES,
    });

    let result: ScrapeResult;
    try {
      result = await scrapeUrl(url);
    } catch (error) {
      // Don't fail the whole crawl if a sub-page fails
      if (isRoot) throw error;
      return;
    }

    // Always include the root page's content
    if (isRoot) {
      collectedContent.push({ url, content: result.content });
    }

    // If the page has links and we haven't hit max depth, check for criteria links
    if (result.links.length > 0 && depth < MAX_DEPTH) {
      emit({
        stage: "analyzing_links",
        message: `Analyzing ${result.links.length} links for criteria content...`,
      });

      const relevantLinks = await filterLinksForCriteria(
        result.links as LinkCandidate[],
        userId
      );

      for (const link of relevantLinks) {
        if (visitedUrls.has(link.url)) continue;
        if (totalScraped >= MAX_PAGES) break;

        let linkedResult: ScrapeResult;
        try {
          visitedUrls.add(link.url);
          totalScraped++;

          emit({
            stage: "crawling_page",
            message: `Fetching: ${link.text || link.url}`,
            currentPage: totalScraped,
            totalPages: MAX_PAGES,
          });

          linkedResult = await scrapeUrl(link.url);
        } catch {
          continue;
        }

        emit({
          stage: "checking_relevance",
          message: `Checking if page contains criteria...`,
        });

        const isRelevant = await checkCriteriaRelevance(
          linkedResult.content,
          userId
        );

        if (isRelevant) {
          collectedContent.push({
            url: link.url,
            content: linkedResult.content,
          });

          // Recurse into this page's links at depth + 1
          if (depth + 1 < MAX_DEPTH && linkedResult.links.length > 0) {
            // Temporarily remove this URL from visited to let crawlPage re-add it
            // (it's already added, so we just recurse for its links)
            await crawlLinksFromPage(linkedResult, depth + 1);
          }
        }
      }
    }
  }

  async function crawlLinksFromPage(
    pageResult: ScrapeResult,
    depth: number
  ): Promise<void> {
    if (pageResult.links.length === 0) return;
    if (totalScraped >= MAX_PAGES) return;

    emit({
      stage: "analyzing_links",
      message: `Analyzing ${pageResult.links.length} sub-links for criteria content...`,
    });

    const relevantLinks = await filterLinksForCriteria(
      pageResult.links as LinkCandidate[],
      userId
    );

    for (const link of relevantLinks) {
      if (visitedUrls.has(link.url)) continue;
      if (totalScraped >= MAX_PAGES) break;

      visitedUrls.add(link.url);
      totalScraped++;

      emit({
        stage: "crawling_page",
        message: `Fetching: ${link.text || link.url}`,
        currentPage: totalScraped,
        totalPages: MAX_PAGES,
      });

      let linkedResult: ScrapeResult;
      try {
        linkedResult = await scrapeUrl(link.url);
      } catch {
        continue;
      }

      emit({
        stage: "checking_relevance",
        message: `Checking if page contains criteria...`,
      });

      const isRelevant = await checkCriteriaRelevance(
        linkedResult.content,
        userId
      );

      if (isRelevant) {
        collectedContent.push({
          url: link.url,
          content: linkedResult.content,
        });
      }
    }
  }

  await crawlPage(startUrl, 0);

  // Assemble final content
  emit({
    stage: "filtering_content",
    message: "Assembling criteria text...",
  });

  let finalContent = collectedContent
    .map((page) => {
      const header = `--- Source: ${page.url} ---`;
      return `${header}\n\n${page.content}`;
    })
    .join("\n\n");

  // Truncate if too long
  if (finalContent.length > MAX_CONTENT_LENGTH) {
    finalContent =
      finalContent.slice(0, MAX_CONTENT_LENGTH) +
      "\n\n[Content truncated — only the first portion was included]";
  }

  emit({
    stage: "complete",
    message: `Done. Scraped ${collectedContent.length} page(s).`,
  });

  return {
    content: finalContent,
    pagesScraped: collectedContent.length,
    urls: collectedContent.map((p) => p.url),
  };
}
```

**Step 4: Run tests to verify they pass**

```bash
cd app && npx vitest run src/lib/scraping/__tests__/crawl-criteria.test.ts
```

Expected: All 7 tests PASS.

**Step 5: Commit**

```bash
git add src/lib/scraping/crawl-criteria.ts src/lib/scraping/__tests__/crawl-criteria.test.ts
git commit -m "feat: add recursive criteria crawl orchestrator"
```

---

### Task 6: Admin API Route (`/api/admin/scrape-criteria`)

**Files:**
- Create: `src/app/api/admin/scrape-criteria/route.ts`
- Create: `src/app/api/__tests__/scrape-criteria.test.ts`

SSE endpoint that streams crawl progress to the client.

**Step 1: Write the failing tests**

Create `src/app/api/__tests__/scrape-criteria.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Supabase
const mockGetUser = vi.fn();
const mockFrom = vi.fn();
const mockServiceFrom = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  })),
  createServiceClient: vi.fn(() => ({
    from: mockServiceFrom,
  })),
}));

// Mock crawl
vi.mock("@/lib/scraping/crawl-criteria", () => ({
  crawlForCriteria: vi.fn(),
}));

import { POST } from "../../api/admin/scrape-criteria/route";
import { crawlForCriteria } from "@/lib/scraping/crawl-criteria";

const mockCrawl = vi.mocked(crawlForCriteria);

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/admin/scrape-criteria", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/admin/scrape-criteria", () => {
  beforeEach(() => {
    mockGetUser.mockReset();
    mockFrom.mockReset();
    mockServiceFrom.mockReset();
    mockCrawl.mockReset();
  });

  it("returns 401 for unauthenticated users", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const response = await POST(makeRequest({ url: "https://example.com" }));
    expect(response.status).toBe(401);
  });

  it("returns 403 for non-admin users", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
    });
    mockServiceFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { is_admin: false },
          }),
        }),
      }),
    });

    const response = await POST(makeRequest({ url: "https://example.com" }));
    expect(response.status).toBe(403);
  });

  it("returns 400 for invalid URL", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "admin-1" } },
    });
    mockServiceFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { is_admin: true },
          }),
        }),
      }),
    });

    const response = await POST(makeRequest({ url: "not-a-url" }));
    expect(response.status).toBe(400);
  });

  it("returns SSE stream for valid admin request", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "admin-1" } },
    });
    mockServiceFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { is_admin: true },
          }),
        }),
      }),
    });

    mockCrawl.mockResolvedValue({
      content: "# Criteria\n\n1. Clear need",
      pagesScraped: 1,
      urls: ["https://example.com"],
    });

    const response = await POST(
      makeRequest({ url: "https://example.com/grants" })
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/event-stream");
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
cd app && npx vitest run src/app/api/__tests__/scrape-criteria.test.ts
```

Expected: FAIL — module not found.

**Step 3: Write the implementation**

Create `src/app/api/admin/scrape-criteria/route.ts`:

```typescript
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { crawlForCriteria, type CrawlProgress } from "@/lib/scraping/crawl-criteria";
import { z } from "zod";

const RequestSchema = z.object({
  url: z.string().url("Please enter a valid URL"),
});

export async function POST(request: Request) {
  // Auth check
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Admin check
  const serviceClient = createServiceClient();
  const { data: profile } = await serviceClient
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();

  if (!profile?.is_admin) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Parse request
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({
        error: parsed.error.errors[0]?.message ?? "Invalid request",
      }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const { url } = parsed.data;

  // Set up SSE stream
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function sendEvent(event: string, data: unknown) {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        );
      }

      try {
        const result = await crawlForCriteria(url, {
          userId: user.id,
          onProgress: (progress: CrawlProgress) => {
            sendEvent("progress", progress);
          },
        });

        sendEvent("complete", {
          content: result.content,
          pagesScraped: result.pagesScraped,
          urls: result.urls,
        });
      } catch (error) {
        sendEvent("error", {
          message:
            error instanceof Error
              ? error.message
              : "An unexpected error occurred while scraping.",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
```

**Step 4: Run tests to verify they pass**

```bash
cd app && npx vitest run src/app/api/__tests__/scrape-criteria.test.ts
```

Expected: All 4 tests PASS.

**Step 5: Commit**

```bash
git add src/app/api/admin/scrape-criteria/ src/app/api/__tests__/scrape-criteria.test.ts
git commit -m "feat: add admin-only SSE endpoint for criteria scraping"
```

---

### Task 7: Update CriteriaInput Component

**Files:**
- Modify: `src/components/CriteriaInput.tsx`

The CriteriaInput component needs a new URL input section that's only visible to admin users. It consumes the SSE endpoint and populates the textarea.

**Step 1: Update the component**

The component needs a new `isAdmin` prop. Modify `src/components/CriteriaInput.tsx` to the following:

```typescript
"use client";

import { useState, useRef } from "react";
import type { CriteriaSet } from "@/lib/schemas/criteria";

interface CriteriaInputProps {
  onParsed: (criteriaSet: CriteriaSet) => void;
  isAdmin?: boolean;
}

interface ScrapeProgress {
  stage: string;
  message: string;
  currentPage?: number;
  totalPages?: number;
}

export function CriteriaInput({ onParsed, isAdmin }: CriteriaInputProps) {
  const [rawText, setRawText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Scraping state
  const [scrapeUrl, setScrapeUrl] = useState("");
  const [scraping, setScraping] = useState(false);
  const [scrapeProgress, setScrapeProgress] = useState<ScrapeProgress[]>([]);
  const [scrapeError, setScrapeError] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  const handleParse = async () => {
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/parse-criteria", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawText }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Failed to parse criteria");
        return;
      }

      onParsed(data.criteria);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleScrape = async () => {
    setScrapeError("");
    setScrapeProgress([]);
    setScraping(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/admin/scrape-criteria", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: scrapeUrl }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const data = await res.json();
        setScrapeError(data.error ?? "Failed to start scraping");
        setScraping(false);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        setScrapeError("No response stream available");
        setScraping(false);
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Parse SSE events from buffer
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        let eventType = "";
        for (const line of lines) {
          if (line.startsWith("event: ")) {
            eventType = line.slice(7).trim();
          } else if (line.startsWith("data: ") && eventType) {
            try {
              const data = JSON.parse(line.slice(6));

              if (eventType === "progress") {
                setScrapeProgress((prev) => [...prev, data as ScrapeProgress]);
              } else if (eventType === "complete") {
                setRawText(data.content);
                setScraping(false);
              } else if (eventType === "error") {
                setScrapeError(data.message);
                setScraping(false);
              }
            } catch {
              // Skip unparseable events
            }
            eventType = "";
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setScrapeError("Network error during scraping. Please try again.");
      }
    } finally {
      setScraping(false);
      abortRef.current = null;
    }
  };

  const handleCancelScrape = () => {
    abortRef.current?.abort();
    setScraping(false);
  };

  const isValidUrl = (url: string) => {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  };

  return (
    <div className="space-y-4">
      {isAdmin && (
        <>
          <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-700">
            <h3 className="mb-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Import from URL
            </h3>

            <div className="flex gap-2">
              <input
                type="url"
                value={scrapeUrl}
                onChange={(e) => setScrapeUrl(e.target.value)}
                placeholder="https://funder.org/criteria"
                disabled={scraping}
                className="flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm shadow-sm placeholder:text-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder:text-zinc-500"
              />
              {!scraping ? (
                <button
                  type="button"
                  onClick={handleScrape}
                  disabled={!isValidUrl(scrapeUrl)}
                  className="whitespace-nowrap rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Scrape Criteria
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleCancelScrape}
                  className="whitespace-nowrap rounded-lg bg-zinc-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-600"
                >
                  Cancel
                </button>
              )}
            </div>

            {scraping && scrapeProgress.length > 0 && (
              <div className="mt-3 space-y-1">
                {scrapeProgress.map((p, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400"
                  >
                    {i < scrapeProgress.length - 1 ? (
                      <span className="text-green-500">&#10003;</span>
                    ) : (
                      <span className="animate-pulse">&#9679;</span>
                    )}
                    <span>{p.message}</span>
                  </div>
                ))}
              </div>
            )}

            {scrapeError && (
              <div className="mt-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
                {scrapeError}
              </div>
            )}
          </div>

          <div className="relative flex items-center">
            <div className="flex-grow border-t border-zinc-300 dark:border-zinc-600" />
            <span className="mx-4 flex-shrink text-xs text-zinc-400 dark:text-zinc-500">
              or paste criteria text
            </span>
            <div className="flex-grow border-t border-zinc-300 dark:border-zinc-600" />
          </div>
        </>
      )}

      <div>
        <label htmlFor="criteria-text" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Funder Criteria
        </label>
        <textarea
          id="criteria-text"
          rows={8}
          value={rawText}
          onChange={(e) => setRawText(e.target.value)}
          placeholder="Paste the funder's evaluation criteria here. This could be from a scoring matrix, guidance notes, or application form. For example:&#10;&#10;1. Demonstrates clear need for the project (25%)&#10;   - What evidence is there of the need?&#10;   - Who are the beneficiaries?&#10;2. Delivers measurable outcomes (25%)&#10;   - What outcomes will be achieved?&#10;   - How will they be measured?"
          className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm shadow-sm placeholder:text-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder:text-zinc-500"
        />
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={handleParse}
          disabled={loading || rawText.trim().length < 10}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Parsing..." : "Parse with AI"}
        </button>
        <button
          type="button"
          onClick={() => onParsed({ name: "Criteria", criteria: [{ id: "c1", criterion: "", sub_questions: [] }] })}
          className="text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
        >
          Enter manually instead
        </button>
      </div>
    </div>
  );
}
```

**Step 2: Find and update all usages of CriteriaInput to pass `isAdmin`**

Search for `<CriteriaInput` in the codebase to find where it's rendered. Update the parent component to pass `isAdmin` from the user's profile. The parent component likely already has access to the user's profile or can query it.

```bash
cd app && grep -rn "CriteriaInput" src/ --include="*.tsx" --include="*.ts"
```

Update each usage to pass `isAdmin={profile?.is_admin ?? false}` or pass it through from a server component.

**Step 3: Run the full test suite to verify nothing breaks**

```bash
cd app && npx vitest run
```

Expected: All existing tests still pass.

**Step 4: Commit**

```bash
git add src/components/CriteriaInput.tsx
git commit -m "feat: add URL scraping UI to CriteriaInput (admin-only)"
```

---

### Task 8: Wire Up isAdmin Prop

**Files:**
- Modify: The parent page that renders `<CriteriaInput>` (likely `src/app/(dashboard)/applications/new/page.tsx` or a sub-component)

**Step 1: Find where CriteriaInput is rendered**

```bash
cd app && grep -rn "<CriteriaInput" src/ --include="*.tsx"
```

**Step 2: Pass `isAdmin` from the server component**

The parent page should already have a Supabase client from the auth check. Add:

```typescript
const { data: profile } = await supabase
  .from("profiles")
  .select("is_admin")
  .eq("id", user.id)
  .single();
```

Then pass `isAdmin={profile?.is_admin ?? false}` through to CriteriaInput. If CriteriaInput is rendered inside a client component that's nested within a server component, pass `isAdmin` as a prop down through the component tree.

**Step 3: Verify in browser**

1. Log in as admin → see the URL scraping section above the textarea
2. Log in as non-admin → see only the textarea (current behaviour unchanged)

**Step 4: Commit**

```bash
git add -A
git commit -m "feat: wire isAdmin prop through to CriteriaInput"
```

---

### Task 9: Integration Testing & Manual Verification

**Step 1: Run the full test suite**

```bash
cd app && npx vitest run
```

Expected: All tests pass, including the new ones from Tasks 2-6.

**Step 2: Run the linter**

```bash
cd app && npm run lint
```

Expected: No new lint errors.

**Step 3: Run the build**

```bash
cd app && npm run build
```

Expected: Production build succeeds.

**Step 4: Manual browser test**

1. Start dev server: `cd app && npm run dev`
2. Log in as admin user
3. Navigate to applications → new → reach the criteria step
4. Enter a real funder URL (e.g. `https://www.tnlcommunityfund.org.uk/funding/programmes/reaching-communities-england`)
5. Click "Scrape Criteria"
6. Watch progress indicators
7. Verify scraped text appears in the textarea
8. Click "Parse with AI" to confirm the existing flow still works
9. Verify non-admin users don't see the URL scraping section

**Step 5: Commit any fixes from integration testing**

```bash
git add -A
git commit -m "fix: integration testing fixes for URL criteria scraping"
```

---

## Summary

| Task | Description | New Files | Test Files |
|------|-------------|-----------|------------|
| 1 | Install dependencies | — | — |
| 2 | Core URL scraper | `scrape-url.ts` | `scrape-url.test.ts` |
| 3 | AI link filter | `filter-links.ts` | `filter-links.test.ts` |
| 4 | AI relevance checker | `check-criteria-relevance.ts` | `check-criteria-relevance.test.ts` |
| 5 | Crawl orchestrator | `crawl-criteria.ts` | `crawl-criteria.test.ts` |
| 6 | Admin API route | `route.ts` | `scrape-criteria.test.ts` |
| 7 | Update CriteriaInput UI | (modify) | — |
| 8 | Wire isAdmin prop | (modify) | — |
| 9 | Integration testing | — | — |
