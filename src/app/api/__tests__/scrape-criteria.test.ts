import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Supabase
const mockGetUser = vi.fn();
const mockServiceFrom = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
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

function setupAdminAuth() {
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
}

/** Read entire SSE stream and parse events */
async function readSSEStream(response: Response): Promise<Array<{ event: string; data: unknown }>> {
  const text = await response.text();
  const events: Array<{ event: string; data: unknown }> = [];
  const blocks = text.split("\n\n").filter(Boolean);

  for (const block of blocks) {
    const lines = block.split("\n");
    let eventType = "";
    let dataStr = "";

    for (const line of lines) {
      if (line.startsWith("event: ")) eventType = line.slice(7).trim();
      if (line.startsWith("data: ")) dataStr = line.slice(6);
    }

    if (eventType && dataStr) {
      events.push({ event: eventType, data: JSON.parse(dataStr) });
    }
  }

  return events;
}

describe("POST /api/admin/scrape-criteria", () => {
  beforeEach(() => {
    mockGetUser.mockReset();
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
    setupAdminAuth();

    const response = await POST(makeRequest({ url: "not-a-url" }));
    expect(response.status).toBe(400);
  });

  it("returns SSE stream with complete event containing crawl results", async () => {
    setupAdminAuth();

    const mockUsage = { totalCalls: 2, filterLinksCalls: 1, relevanceCheckCalls: 1, inputTokens: 200, outputTokens: 100, cacheWriteTokens: 0, cacheReadTokens: 0, costUsd: 0.001, costGbp: 0.0008 };
    const mockPageTree = { url: "https://example.com/grants", title: "Grants", relevant: true, children: [] };

    mockCrawl.mockResolvedValue({
      content: "# Criteria\n\n1. Clear need",
      pagesScraped: 1,
      urls: ["https://example.com/grants"],
      logPath: "/tmp/test.log",
      usage: mockUsage,
      pageTree: mockPageTree,
    });

    const response = await POST(
      makeRequest({ url: "https://example.com/grants" })
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/event-stream");

    const events = await readSSEStream(response);
    const completeEvent = events.find((e) => e.event === "complete");
    expect(completeEvent).toBeDefined();

    const data = completeEvent!.data as Record<string, unknown>;
    expect(data.content).toBe("# Criteria\n\n1. Clear need");
    expect(data.pagesScraped).toBe(1);
    expect(data.usage).toEqual(mockUsage);
    expect(data.pageTree).toEqual(mockPageTree);
  });

  it("emits error SSE event when crawl throws", async () => {
    setupAdminAuth();

    mockCrawl.mockRejectedValue(new Error("Connection refused"));

    const response = await POST(
      makeRequest({ url: "https://example.com/grants" })
    );

    expect(response.status).toBe(200);

    const events = await readSSEStream(response);
    const errorEvent = events.find((e) => e.event === "error");
    expect(errorEvent).toBeDefined();
    expect((errorEvent!.data as Record<string, unknown>).message).toBe("Connection refused");
  });
});
