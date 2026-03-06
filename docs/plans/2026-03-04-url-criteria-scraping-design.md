# URL-Based Criteria Scraping — Design Document

**Date:** 2026-03-04
**Status:** Approved

## Problem

Users must manually find, copy, and paste fund criteria text into FunderReady. For large funders with criteria spread across multiple web pages, this is tedious and error-prone. Users may miss criteria or paste incomplete information.

## Solution

Add a URL input to the criteria step (admin-only for v1). Given a funder URL, the system scrapes the page, intelligently crawls linked pages for criteria content, and populates the criteria textarea with the extracted text. The user reviews and then triggers the existing AI parser.

## Architecture

```
User enters URL (depth 0)
      |
      v
  /api/admin/scrape-criteria  (admin-only route)
      |
      v
  RECURSIVE CRAWL (max depth 2):
    1. fetch(url) + Readability + Turndown -> clean text + links
    2. Extract links with context (link text, URL, ~200 chars surrounding text)
    3. Haiku AI: "Which of these links lead to fund criteria content?"
    4. Fetch selected links
    5. Haiku AI per page: "Is this page about fund evaluation criteria?"
    6. If YES and depth < 2: recurse with this page (depth + 1)
    7. Deduplicate by URL, concatenate all relevant text
      |
      v
  Return scraped text to client
      |
      v
  Text populates CriteriaInput textarea
      |
      v
  User reviews/edits, then hits "Parse with AI" (existing flow)
```

### Key Architectural Decisions

- **Scraping and parsing are separate concerns.** The scrape API returns raw text; the existing `/api/parse-criteria` endpoint handles AI extraction. This keeps both independently testable and reusable.
- **Two AI gates prevent wasted tokens.** Haiku selects which links to follow, then Haiku validates each page's relevance. Only confirmed-relevant content reaches the Sonnet parser.
- **Depth-2 recursive crawl.** When a page is confirmed criteria-related, its links are also analyzed and followed (up to depth 2). This handles funders that split criteria across sub-pages.
- **Admin-only for v1.** Scraping is restricted to admin users. Non-admins see the current UI (manual paste only).
- **No JS rendering in v1.** Uses simple `fetch()` for HTTP requests. JS-rendered SPAs gracefully degrade with a message suggesting manual paste. Can add headless browser support later if needed.

## UI Design

### Admin View (CriteriaInput)

```
+--------------------------------------------------+
|  Funder Criteria                                  |
|                                                   |
|  +- Import from URL ----------------------------+ |
|  |  [ https://funder.org/criteria______ ]       | |
|  |                                               | |
|  |  [ Scrape Criteria ]                          | |
|  +-----------------------------------------------+ |
|                                                   |
|  -- or paste criteria text --                     |
|                                                   |
|  +-----------------------------------------------+ |
|  | Paste the funder's evaluation criteria here   | |
|  +-----------------------------------------------+ |
|                                                   |
|  [ Parse with AI ]    Enter manually instead      |
+--------------------------------------------------+
```

### Progress Display (during scraping)

```
+- Import from URL --------------------------------+
|  [ https://bbcchildreninneed.co.uk/grants ]      |
|                                                   |
|  * Scraping criteria...                           |
|  [check] Fetched main page                        |
|  [check] Found 3 relevant links                   |
|  * Checking linked page 2 of 3...                |
|                                                   |
|  [ Cancel ]                                       |
+---------------------------------------------------+
```

### Non-Admin View

Unchanged from current UI (textarea + Parse with AI + Enter manually).

### Post-Scrape Flow

Scraped text auto-populates the textarea. User reviews/edits the raw text, then clicks "Parse with AI" to trigger the existing AI parser.

## Technical Details

### New Dependencies

- `@mozilla/readability` — extracts main content from HTML, strips nav/ads/footers (same library as Firefox Reader View)
- `turndown` — converts HTML to clean markdown

### New Files

| File | Purpose |
|------|---------|
| `src/lib/scraping/scrape-url.ts` | Core: fetch URL, Readability extraction, Turndown conversion, link extraction with surrounding context |
| `src/lib/scraping/crawl-criteria.ts` | Orchestrator: recursive crawl with AI link selection, relevance filtering, URL dedup, depth/page limits |
| `src/lib/ai/filter-links.ts` | Haiku prompt: given links with context, return which are criteria-related |
| `src/lib/ai/check-criteria-relevance.ts` | Haiku prompt: is this page about fund criteria? Returns yes/no + confidence |
| `src/app/api/admin/scrape-criteria/route.ts` | Admin-only API route, SSE progress updates |

### Modified Files

| File | Change |
|------|--------|
| `src/components/CriteriaInput.tsx` | Add URL input section (admin-only), scraping state, progress display |

### AI Cost Per Scrape Request

| Step | Model | Calls | Cost |
|------|-------|-------|------|
| Link selection (per page) | Haiku | 1-3 | ~$0.001 each |
| Page relevance check | Haiku | 2-8 | ~$0.001 each |
| **Total Haiku cost** | | | **~$0.005-0.015** |
| Criteria parsing (existing) | Sonnet | 1 | Unchanged |

### Crawling Safeguards

- Max depth: 2 (original page -> linked page -> sub-linked page)
- Max total pages: 10 per request (across all depths)
- Per-page fetch timeout: 15 seconds
- Overall request timeout: 60 seconds
- URL deduplication (don't crawl same page twice)
- Same-domain links only (don't crawl external sites)
- Skip non-content URLs (images, stylesheets, media files)

### Progress Updates

Use Server-Sent Events (SSE) to stream progress to the client:
- `fetching_main` — fetching the original URL
- `analyzing_links` — AI selecting relevant links
- `crawling_page` — fetching a linked page (includes page number and total)
- `checking_relevance` — AI checking if page is criteria-related
- `filtering_content` — assembling final text
- `complete` — done, includes the scraped text
- `error` — something went wrong, includes error message

### Error Handling

| Scenario | Response |
|----------|----------|
| URL returns 4xx/5xx | "Couldn't reach this URL. Please check it's correct and publicly accessible." |
| Fetch timeout (>15s) | "Page took too long to load. Try a more specific URL." |
| Page behind auth/login | Content filtered by Haiku. If nothing found: "No criteria found. Content may be behind a login." |
| JS-only page (no text) | "This page requires JavaScript to load. Please paste criteria manually." |
| PDF link | "PDF scraping isn't supported yet. Copy criteria from the PDF and paste below." |
| Content too long (>50k chars) | Truncate with note: "Content was large — only the first portion was included." |
| No criteria found after crawl | "No evaluation criteria found on this page or linked pages. Try a different URL or paste manually." |

### Admin Check

Same pattern as existing admin routes — query `profiles.is_admin` for the authenticated user. Return 403 if not admin.

## Future Enhancements (Not in v1)

- **JS rendering:** Add Puppeteer/Playwright or a scraping service for SPA support
- **PDF extraction:** Parse linked PDF documents for criteria content
- **Questions scraping:** Extend to also extract application questions (blocked by auth-wall issue)
- **Open to all users:** Remove admin restriction once the feature is validated
- **Caching:** Cache scraped content per URL to avoid re-scraping the same funder site
