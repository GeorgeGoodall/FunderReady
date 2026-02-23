import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Shared mocking helpers
// ---------------------------------------------------------------------------

// Mock Supabase — shared between all route tests
const mockGetUser = vi.fn();
const mockFrom = vi.fn();
const mockStorageFrom = vi.fn();

const mockServiceFrom = vi.fn();
const mockServiceStorageFrom = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
    storage: { from: mockStorageFrom },
  })),
  createServiceClient: vi.fn(() => ({
    from: mockServiceFrom,
    storage: { from: mockServiceStorageFrom },
  })),
}));

// Mock Inngest
const mockInngestSend = vi.fn();
vi.mock("@/lib/inngest/client", () => ({
  inngest: { send: mockInngestSend },
}));

// Mock AI
const mockParseCriteriaWithAI = vi.fn();
vi.mock("@/lib/ai/parse-criteria", () => ({
  parseCriteriaWithAI: (...args: unknown[]) => mockParseCriteriaWithAI(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Helper to build chained Supabase query mocks
// ---------------------------------------------------------------------------

function chainMock(resolvedValue: unknown) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  chain.select = vi.fn(() => chain);
  chain.insert = vi.fn(() => chain);
  chain.update = vi.fn(() => chain);
  chain.upsert = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.single = vi.fn(() => Promise.resolve(resolvedValue));
  chain.order = vi.fn(() => chain);
  return chain;
}

// Authenticated user helper
function authenticatedUser(id = "user-123") {
  mockGetUser.mockResolvedValue({ data: { user: { id } } });
}

function unauthenticatedUser() {
  mockGetUser.mockResolvedValue({ data: { user: null } });
}

// =====================================================================
// POST /api/parse-criteria
// =====================================================================

describe("POST /api/parse-criteria", () => {
  async function importRoute() {
    const mod = await import("../../api/parse-criteria/route");
    return mod.POST;
  }

  it("returns 401 when not authenticated", async () => {
    unauthenticatedUser();
    const POST = await importRoute();
    const req = new Request("http://localhost/api/parse-criteria", {
      method: "POST",
      body: JSON.stringify({ rawText: "Some criteria text here" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("returns 400 for invalid JSON body", async () => {
    authenticatedUser();
    const POST = await importRoute();
    const req = new Request("http://localhost/api/parse-criteria", {
      method: "POST",
      body: "not json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when rawText is too short", async () => {
    authenticatedUser();
    const POST = await importRoute();
    const req = new Request("http://localhost/api/parse-criteria", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rawText: "short" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 200 with parsed criteria on success", async () => {
    authenticatedUser();
    const mockCriteria = { name: "Test", criteria: [{ id: "c1", criterion: "Quality" }] };
    mockParseCriteriaWithAI.mockResolvedValue(mockCriteria);

    const POST = await importRoute();
    const req = new Request("http://localhost/api/parse-criteria", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rawText: "Quality of delivery — 30%" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.criteria).toEqual(mockCriteria);
    expect(mockParseCriteriaWithAI).toHaveBeenCalledWith("Quality of delivery — 30%");
  });

  it("returns 422 when AI returns invalid Zod structure", async () => {
    authenticatedUser();
    const { ZodError } = await import("zod");
    mockParseCriteriaWithAI.mockRejectedValue(new ZodError([]));

    const POST = await importRoute();
    const req = new Request("http://localhost/api/parse-criteria", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rawText: "Quality of delivery — 30%" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(422);
    expect((await res.json()).error).toContain("invalid criteria structure");
  });

  it("returns 422 when AI returns invalid JSON", async () => {
    authenticatedUser();
    mockParseCriteriaWithAI.mockRejectedValue(new SyntaxError("Unexpected token"));

    const POST = await importRoute();
    const req = new Request("http://localhost/api/parse-criteria", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rawText: "Quality of delivery — 30%" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(422);
    expect((await res.json()).error).toContain("invalid JSON");
  });

  it("returns 500 on unexpected error", async () => {
    authenticatedUser();
    mockParseCriteriaWithAI.mockRejectedValue(new Error("Network timeout"));

    const POST = await importRoute();
    const req = new Request("http://localhost/api/parse-criteria", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rawText: "Quality of delivery — 30%" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(500);
  });
});

// =====================================================================
// POST /api/submit-review
// =====================================================================

describe("POST /api/submit-review", () => {
  async function importRoute() {
    const mod = await import("../../api/submit-review/route");
    return mod.POST;
  }

  const validBody = {
    bidFileName: "test.docx",
    bidFilePath: "user-123/abc/test.docx",
    criteriaJson: {
      name: "Test criteria",
      criteria: [{ id: "c1", criterion: "Quality", sub_questions: [] }],
    },
  };

  it("returns 401 when not authenticated", async () => {
    unauthenticatedUser();
    const POST = await importRoute();
    const req = new Request("http://localhost/api/submit-review", {
      method: "POST",
      body: JSON.stringify(validBody),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid JSON body", async () => {
    authenticatedUser();
    const POST = await importRoute();
    const req = new Request("http://localhost/api/submit-review", {
      method: "POST",
      body: "bad json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when request body fails schema validation", async () => {
    authenticatedUser();
    const POST = await importRoute();
    const req = new Request("http://localhost/api/submit-review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bidFileName: "" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 403 when usage limit reached", async () => {
    authenticatedUser();

    // Profile query
    const profileChain = chainMock({ data: { subscription_tier: "free" } });
    mockServiceFrom.mockImplementation((table: string) => {
      if (table === "profiles") return profileChain;
      if (table === "usage") {
        // First call = upsert, second = select for limit check
        const usageChain = chainMock({
          data: { reviews_used: 3, reviews_limit: 3, bonus_reviews: 0 },
        });
        return usageChain;
      }
      return chainMock({ data: null });
    });

    // Review insert via user client (won't be reached)
    mockFrom.mockReturnValue(chainMock({ data: null }));

    const POST = await importRoute();
    const req = new Request("http://localhost/api/submit-review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validBody),
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
    expect((await res.json()).error).toContain("limit");
  });

  it("returns 201 and fires Inngest event on success", async () => {
    authenticatedUser();

    const profileChain = chainMock({ data: { subscription_tier: "free" } });
    const usageChain = chainMock({
      data: { reviews_used: 0, reviews_limit: 3, bonus_reviews: 0 },
    });
    mockServiceFrom.mockImplementation((table: string) => {
      if (table === "profiles") return profileChain;
      if (table === "usage") return usageChain;
      if (table === "review_results") return chainMock({ error: null });
      return chainMock({ data: null });
    });

    // Review insert
    const reviewChain = chainMock({ data: { id: "rev-1" }, error: null });
    mockFrom.mockReturnValue(reviewChain);

    mockInngestSend.mockResolvedValue(undefined);

    const POST = await importRoute();
    const req = new Request("http://localhost/api/submit-review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validBody),
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.reviewId).toBe("rev-1");

    expect(mockInngestSend).toHaveBeenCalledWith({
      name: "review/submitted",
      data: { reviewId: "rev-1", userId: "user-123" },
    });
  });

  it("selects sonnet model for pro tier", async () => {
    authenticatedUser();

    const profileChain = chainMock({ data: { subscription_tier: "pro" } });
    const usageChain = chainMock({
      data: { reviews_used: 0, reviews_limit: 50, bonus_reviews: 0 },
    });
    mockServiceFrom.mockImplementation((table: string) => {
      if (table === "profiles") return profileChain;
      if (table === "usage") return usageChain;
      if (table === "review_results") return chainMock({ error: null });
      return chainMock({ data: null });
    });

    const insertArgs: Record<string, unknown>[] = [];
    const reviewChain = chainMock({ data: { id: "rev-2" }, error: null });
    const origInsert = reviewChain.insert;
    reviewChain.insert = vi.fn((...args: unknown[]) => {
      insertArgs.push(args[0] as Record<string, unknown>);
      return origInsert(...args);
    });
    mockFrom.mockReturnValue(reviewChain);
    mockInngestSend.mockResolvedValue(undefined);

    const POST = await importRoute();
    const req = new Request("http://localhost/api/submit-review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validBody),
    });
    await POST(req);

    expect(insertArgs[0]).toMatchObject({ model_tier: "sonnet" });
  });

  it("accounts for bonus_reviews in limit calculation", async () => {
    authenticatedUser();

    const profileChain = chainMock({ data: { subscription_tier: "free" } });
    // Used 3 of 3 base limit, but has 2 bonus
    const usageChain = chainMock({
      data: { reviews_used: 3, reviews_limit: 3, bonus_reviews: 2 },
    });
    mockServiceFrom.mockImplementation((table: string) => {
      if (table === "profiles") return profileChain;
      if (table === "usage") return usageChain;
      if (table === "review_results") return chainMock({ error: null });
      return chainMock({ data: null });
    });

    const reviewChain = chainMock({ data: { id: "rev-3" }, error: null });
    mockFrom.mockReturnValue(reviewChain);
    mockInngestSend.mockResolvedValue(undefined);

    const POST = await importRoute();
    const req = new Request("http://localhost/api/submit-review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validBody),
    });
    const res = await POST(req);
    // Should succeed because 3 < 3 + 2 = 5
    expect(res.status).toBe(201);
  });
});

// =====================================================================
// GET /api/reviews/[id]/download
// =====================================================================

describe("GET /api/reviews/[id]/download", () => {
  async function importRoute() {
    const mod = await import("../../api/reviews/[id]/download/route");
    return mod.GET;
  }

  const params = Promise.resolve({ id: "rev-1" });

  it("returns 401 when not authenticated", async () => {
    unauthenticatedUser();
    const GET = await importRoute();
    const req = new Request("http://localhost/api/reviews/rev-1/download");
    const res = await GET(req, { params });
    expect(res.status).toBe(401);
  });

  it("returns 404 when review not found", async () => {
    authenticatedUser();
    mockFrom.mockReturnValue(chainMock({ data: null }));

    const GET = await importRoute();
    const req = new Request("http://localhost/api/reviews/rev-1/download");
    const res = await GET(req, { params });
    expect(res.status).toBe(404);
  });

  it("returns 400 when review is not completed", async () => {
    authenticatedUser();
    mockFrom.mockReturnValue(
      chainMock({
        data: { status: "analysing", output_file_path: null, bid_file_name: "test.docx" },
      })
    );

    const GET = await importRoute();
    const req = new Request("http://localhost/api/reviews/rev-1/download");
    const res = await GET(req, { params });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("not ready");
  });

  it("returns 400 when completed but no output_file_path", async () => {
    authenticatedUser();
    mockFrom.mockReturnValue(
      chainMock({
        data: { status: "completed", output_file_path: null, bid_file_name: "test.docx" },
      })
    );

    const GET = await importRoute();
    const req = new Request("http://localhost/api/reviews/rev-1/download");
    const res = await GET(req, { params });
    expect(res.status).toBe(400);
  });

  it("returns 500 when storage download fails", async () => {
    authenticatedUser();
    mockFrom.mockReturnValue(
      chainMock({
        data: {
          status: "completed",
          output_file_path: "user-123/rev-1/review-output.docx",
          bid_file_name: "My Bid.docx",
        },
      })
    );
    mockServiceStorageFrom.mockReturnValue({
      download: vi.fn().mockResolvedValue({ data: null, error: { message: "Not found" } }),
    });

    const GET = await importRoute();
    const req = new Request("http://localhost/api/reviews/rev-1/download");
    const res = await GET(req, { params });
    expect(res.status).toBe(500);
  });

  it("returns file with correct headers on success", async () => {
    authenticatedUser();
    mockFrom.mockReturnValue(
      chainMock({
        data: {
          status: "completed",
          output_file_path: "user-123/rev-1/review-output.docx",
          bid_file_name: "My Bid.docx",
        },
      })
    );

    const fakeBlob = new Blob(["fake docx content"]);
    mockServiceStorageFrom.mockReturnValue({
      download: vi.fn().mockResolvedValue({ data: fakeBlob, error: null }),
    });

    const GET = await importRoute();
    const req = new Request("http://localhost/api/reviews/rev-1/download");
    const res = await GET(req, { params });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
    expect(res.headers.get("Content-Disposition")).toBe(
      'attachment; filename="My Bid - FunderReady Review.docx"'
    );
  });

  it("strips .docx extension from bid name in download filename", async () => {
    authenticatedUser();
    mockFrom.mockReturnValue(
      chainMock({
        data: {
          status: "completed",
          output_file_path: "user-123/rev-1/review-output.docx",
          bid_file_name: "Proposal.DOCX",
        },
      })
    );

    const fakeBlob = new Blob(["content"]);
    mockServiceStorageFrom.mockReturnValue({
      download: vi.fn().mockResolvedValue({ data: fakeBlob, error: null }),
    });

    const GET = await importRoute();
    const req = new Request("http://localhost/api/reviews/rev-1/download");
    const res = await GET(req, { params });
    expect(res.headers.get("Content-Disposition")).toBe(
      'attachment; filename="Proposal - FunderReady Review.docx"'
    );
  });
});
