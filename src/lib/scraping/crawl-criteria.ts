import { scrapeUrl, normalizeUrl, type ScrapeResult } from "./scrape-url";
import { filterLinksForCriteria, type LinkCandidate } from "../ai/filter-links";
import { checkCriteriaRelevance } from "../ai/check-criteria-relevance";
import { createScrapeLogger, type ScrapeLogger } from "./scrape-logger";
import { ScrapeUsageTracker, type ScrapeUsageSummary } from "./scrape-usage";

const MAX_DEPTH = 5;
const MAX_PAGES = 40;
const MAX_AI_CALLS = 80;
const MAX_CONTENT_LENGTH = 50_000;

export type CrawlStage =
  | "fetching_main"
  | "analyzing_links"
  | "link_decision"
  | "crawling_page"
  | "checking_relevance"
  | "relevance_result"
  | "filtering_content"
  | "usage_update"
  | "complete"
  | "error";

export interface CrawlProgress {
  stage: CrawlStage;
  message: string;
  currentPage?: number;
  totalPages?: number;
  detail?: Record<string, unknown> | ScrapeUsageSummary;
}

export interface PageNode {
  url: string;
  title: string;
  relevant: boolean;
  children: PageNode[];
}

export interface CrawlResult {
  content: string;
  pagesScraped: number;
  urls: string[];
  logPath: string;
  usage: ScrapeUsageSummary;
  pageTree: PageNode;
}

interface CrawlOptions {
  onProgress?: (progress: CrawlProgress) => void;
  userId?: string;
  logger?: ScrapeLogger;
  signal?: AbortSignal;
}

export async function crawlForCriteria(
  startUrl: string,
  options: CrawlOptions = {}
): Promise<CrawlResult> {
  const { onProgress, userId, signal } = options;
  const logger = options.logger ?? createScrapeLogger(startUrl);
  const usageTracker = new ScrapeUsageTracker();
  const visitedUrls = new Set<string>();
  const collectedContent: { url: string; content: string }[] = [];
  let totalScraped = 0;
  let totalAiCalls = 0;

  // Page tree tracking — maps URL to its tree node
  const pageNodes = new Map<string, PageNode>();

  // Lock to the original domain — never navigate off-site
  const startDomain = new URL(startUrl).hostname;

  // Lock to the same language path prefix (e.g. "/grants/") to avoid
  // following translated duplicates (e.g. "/grantiau/...")
  const startPathSegment = new URL(startUrl).pathname.split("/").filter(Boolean)[0] ?? "";
  const startPathPrefix = startPathSegment ? `/${startPathSegment}/` : "/";

  function isAllowedUrl(url: string): boolean {
    try {
      const u = new URL(url);
      if (u.hostname !== startDomain) return false;
      // Exempt PDFs/documents from path prefix — they're often hosted
      // under /wp-content/uploads/ or similar, not the main site path
      const lowerPath = u.pathname.toLowerCase();
      if (lowerPath.endsWith(".pdf")) return true;
      if (!u.pathname.startsWith(startPathPrefix)) return false;
      return true;
    } catch {
      return false;
    }
  }

  function emit(progress: CrawlProgress) {
    onProgress?.(progress);
  }

  function getOrCreateNode(url: string, title: string, relevant: boolean): PageNode {
    const existing = pageNodes.get(url);
    if (existing) {
      existing.relevant = existing.relevant || relevant;
      return existing;
    }
    const node: PageNode = { url, title, relevant, children: [] };
    pageNodes.set(url, node);
    return node;
  }

  // BFS queue entry: links discovered on a page, plus their depth and source
  interface QueueEntry {
    links: ScrapeResult["links"];
    depth: number;
    sourceUrl: string;
  }

  const bfsQueue: QueueEntry[] = [];

  async function processQueue(): Promise<void> {
    while (bfsQueue.length > 0 && totalScraped < MAX_PAGES) {
      // Check abort signal (client disconnected or cancelled)
      if (signal?.aborted) {
        logger.log("ABORT", "Crawl aborted by signal");
        break;
      }

      // Check AI call budget
      if (totalAiCalls >= MAX_AI_CALLS) {
        logger.log("LIMIT", `Max AI calls (${MAX_AI_CALLS}) reached, stopping`);
        break;
      }

      const { links, depth, sourceUrl } = bfsQueue.shift()!;

      if (links.length === 0) continue;

      // Filter to original domain before AI analysis
      const sameDomainLinks = links.filter((l) => isAllowedUrl(l.url));
      const offDomainCount = links.length - sameDomainLinks.length;

      if (offDomainCount > 0) {
        logger.log("DOMAIN_FILTER", `Removed ${offDomainCount} off-domain links (keeping ${startDomain} only)`);
      }

      if (sameDomainLinks.length === 0) continue;

      const depthLabel = depth === 0 ? "root" : `depth ${depth}`;

      logger.log("LINKS_FOUND", `Found ${sameDomainLinks.length} same-domain links on ${sourceUrl} (${depthLabel})`, {
        urls: sameDomainLinks.map((l) => ({ url: l.url, text: l.text })),
      });

      emit({
        stage: "analyzing_links",
        message: `Analyzing ${sameDomainLinks.length} same-domain links from ${sourceUrl}...`,
      });

      const filterResult = await filterLinksForCriteria(
        sameDomainLinks as LinkCandidate[],
        userId
      );

      usageTracker.addFilterLinks(filterResult.usage);
      totalAiCalls++;
      const summaryAfterFilter = usageTracker.getSummary();
      logger.log("USAGE", `Running total: ${summaryAfterFilter.totalCalls} calls, ${summaryAfterFilter.inputTokens + summaryAfterFilter.outputTokens} tokens, $${summaryAfterFilter.costUsd.toFixed(6)}`);
      emit({
        stage: "usage_update",
        message: `${summaryAfterFilter.totalCalls} AI calls | ${(summaryAfterFilter.inputTokens + summaryAfterFilter.outputTokens).toLocaleString()} tokens | $${summaryAfterFilter.costUsd.toFixed(4)}`,
        detail: summaryAfterFilter,
      });

      logger.log(
        "LINK_FILTER",
        `AI selected ${filterResult.selected.length}/${sameDomainLinks.length} links as criteria-relevant`,
        {
          selectedIndices: filterResult.selectedIndices,
          selected: filterResult.selected.map((l) => ({
            url: l.url,
            text: l.text,
          })),
          rejected: sameDomainLinks
            .filter((_, i) => !filterResult.selectedIndices.includes(i))
            .map((l) => ({ url: l.url, text: l.text })),
        }
      );

      emit({
        stage: "link_decision",
        message: `AI selected ${filterResult.selected.length} of ${sameDomainLinks.length} links as criteria-relevant`,
        detail: {
          selected: filterResult.selected.map((l) => l.text || l.url),
          rejected: sameDomainLinks
            .filter((_, i) => !filterResult.selectedIndices.includes(i))
            .map((l) => l.text || l.url),
        },
      });

      for (const link of filterResult.selected) {
        if (signal?.aborted) break;
        if (totalAiCalls >= MAX_AI_CALLS) break;

        const normalizedLinkUrl = normalizeUrl(link.url);
        if (visitedUrls.has(normalizedLinkUrl)) {
          logger.log("SKIP", `Already visited: ${link.url}`);
          continue;
        }
        if (totalScraped >= MAX_PAGES) {
          logger.log("LIMIT", `Max pages (${MAX_PAGES}) reached, stopping`);
          break;
        }

        visitedUrls.add(normalizedLinkUrl);
        totalScraped++;

        logger.log("FETCH", `Fetching page ${totalScraped}/${MAX_PAGES}: ${link.url}`, {
          linkText: link.text,
          depth,
        });

        emit({
          stage: "crawling_page",
          message: `Fetching: ${link.text || link.url}`,
          currentPage: totalScraped,
          totalPages: MAX_PAGES,
        });

        let linkedResult: ScrapeResult;
        try {
          linkedResult = await scrapeUrl(link.url);
        } catch (err) {
          logger.log("FETCH_FAIL", `Failed to fetch ${link.url}: ${err instanceof Error ? err.message : String(err)}`);
          continue;
        }

        logger.log("FETCHED", `Got ${linkedResult.content.length} chars, ${linkedResult.links.length} links from ${link.url}`);

        emit({
          stage: "checking_relevance",
          message: `Checking if ${link.text || link.url} contains criteria...`,
        });

        const relevance = await checkCriteriaRelevance(
          linkedResult.content,
          userId
        );

        usageTracker.addRelevanceCheck(relevance.usage);
        totalAiCalls++;
        const summaryAfterRelevance = usageTracker.getSummary();
        logger.log("USAGE", `Running total: ${summaryAfterRelevance.totalCalls} calls, ${summaryAfterRelevance.inputTokens + summaryAfterRelevance.outputTokens} tokens, $${summaryAfterRelevance.costUsd.toFixed(6)}`);
        emit({
          stage: "usage_update",
          message: `${summaryAfterRelevance.totalCalls} AI calls | ${(summaryAfterRelevance.inputTokens + summaryAfterRelevance.outputTokens).toLocaleString()} tokens | $${summaryAfterRelevance.costUsd.toFixed(4)}`,
          detail: summaryAfterRelevance,
        });

        logger.log(
          "RELEVANCE",
          `${link.url} => relevant=${relevance.relevant}, confidence=${relevance.confidence}`,
          {
            url: link.url,
            relevant: relevance.relevant,
            confidence: relevance.confidence,
            contentPreview: linkedResult.content.slice(0, 200),
          }
        );

        emit({
          stage: "relevance_result",
          message: relevance.relevant
            ? `Included: "${link.text || link.url}" (confidence: ${(relevance.confidence * 100).toFixed(0)}%)`
            : `Skipped: "${link.text || link.url}" — not criteria (confidence: ${(relevance.confidence * 100).toFixed(0)}%)`,
          detail: {
            url: link.url,
            relevant: relevance.relevant,
            confidence: relevance.confidence,
          },
        });

        // Add to page tree
        const childNode = getOrCreateNode(link.url, link.text || link.url, relevance.relevant);
        const parentNode = pageNodes.get(sourceUrl);
        if (parentNode) parentNode.children.push(childNode);

        if (relevance.relevant) {
          collectedContent.push({
            url: link.url,
            content: linkedResult.content,
          });
        }

        // Enqueue child links for later processing (BFS) — even if the page
        // itself isn't criteria content, it may be a navigation/hub page
        // linking to criteria pages deeper down.
        if (depth + 1 < MAX_DEPTH && linkedResult.links.length > 0) {
          bfsQueue.push({ links: linkedResult.links, depth: depth + 1, sourceUrl: link.url });
        }
      }
    }
  }

  // --- Start crawl ---
  logger.log("START", `Crawling ${startUrl} (maxDepth=${MAX_DEPTH}, maxPages=${MAX_PAGES})`);

  visitedUrls.add(normalizeUrl(startUrl));
  totalScraped++;

  emit({
    stage: "fetching_main",
    message: "Fetching main page...",
    currentPage: totalScraped,
    totalPages: MAX_PAGES,
  });

  let rootResult: ScrapeResult;
  try {
    rootResult = await scrapeUrl(startUrl);
  } catch (error) {
    logger.log("ERROR", `Failed to fetch root page: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }

  logger.log("FETCHED", `Root page: ${rootResult.content.length} chars, ${rootResult.links.length} links`);

  collectedContent.push({ url: startUrl, content: rootResult.content });

  // Create root node in page tree (root is always relevant — its content is collected)
  const rootNode = getOrCreateNode(startUrl, startUrl, true);

  // Seed BFS queue with root page's links, then process breadth-first
  if (rootResult.links.length > 0) {
    bfsQueue.push({ links: rootResult.links, depth: 0, sourceUrl: startUrl });
  }
  await processQueue();

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

  if (finalContent.length > MAX_CONTENT_LENGTH) {
    finalContent =
      finalContent.slice(0, MAX_CONTENT_LENGTH) +
      "\n\n[Content truncated — only the first portion was included]";
  }

  const finalUsage = usageTracker.getSummary();

  logger.log("COST_SUMMARY", `Scrape complete — ${finalUsage.totalCalls} AI calls (${finalUsage.filterLinksCalls} filter, ${finalUsage.relevanceCheckCalls} relevance), ${finalUsage.inputTokens + finalUsage.outputTokens} tokens, $${finalUsage.costUsd.toFixed(6)} / £${finalUsage.costGbp.toFixed(6)}`, { ...finalUsage });

  logger.log("COMPLETE", `Finished. ${collectedContent.length} pages collected, ${finalContent.length} chars total`, {
    urls: collectedContent.map((p) => p.url),
  });

  emit({
    stage: "complete",
    message: `Done. Scraped ${collectedContent.length} page(s). Log: ${logger.getLogPath()}`,
    detail: { usage: finalUsage },
  });

  return {
    content: finalContent,
    pagesScraped: collectedContent.length,
    urls: collectedContent.map((p) => p.url),
    logPath: logger.getLogPath(),
    usage: finalUsage,
    pageTree: rootNode,
  };
}
