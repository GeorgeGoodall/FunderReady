import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Shared mocking helpers
// ---------------------------------------------------------------------------

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

// Mock AI functions
const mockParseQuestionsWithAI = vi.fn();
vi.mock("@/lib/ai/parse-questions", () => ({
  parseQuestionsWithAI: (...args: unknown[]) =>
    mockParseQuestionsWithAI(...args),
}));

const mockDetectFundName = vi.fn();
vi.mock("@/lib/ai/detect-fund", () => ({
  detectFundName: (...args: unknown[]) => mockDetectFundName(...args),
}));

// Mock requireProWithRateLimit guard
const mockRequireProWithRateLimit = vi.fn();
vi.mock("@/lib/usage/require-pro-with-rate-limit", () => ({
  requireProWithRateLimit: (...args: unknown[]) =>
    mockRequireProWithRateLimit(...args),
  isGuardError: (result: unknown) => {
    const { NextResponse } = require("next/server");
    return result instanceof NextResponse;
  },
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
  chain.maybeSingle = vi.fn(() => Promise.resolve(resolvedValue));
  chain.order = vi.fn(() => chain);
  chain.limit = vi.fn(() => Promise.resolve(resolvedValue));
  chain.textSearch = vi.fn(() => chain);
  // Make chain directly awaitable (for queries without .single())
  chain.then = vi.fn((resolve: (v: unknown) => unknown) => Promise.resolve(resolvedValue).then(resolve));
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
// PATCH /api/admin/criteria-sets/[id]/approve
// =====================================================================

describe("PATCH /api/admin/criteria-sets/[id]/approve", () => {
  async function importRoute() {
    const mod = await import(
      "../../api/admin/criteria-sets/[id]/approve/route"
    );
    return mod.PATCH;
  }

  const params = Promise.resolve({ id: "cs-001" });

  it("returns 401 when not authenticated", async () => {
    unauthenticatedUser();
    const PATCH = await importRoute();
    const req = new Request(
      "http://localhost/api/admin/criteria-sets/cs-001/approve",
      { method: "PATCH" }
    );
    const res = await PATCH(req, { params });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("returns 403 for non-admin users", async () => {
    authenticatedUser();
    // Profile query returns is_admin: false
    mockServiceFrom.mockReturnValue(
      chainMock({ data: { is_admin: false }, error: null })
    );
    const PATCH = await importRoute();
    const req = new Request(
      "http://localhost/api/admin/criteria-sets/cs-001/approve",
      { method: "PATCH" }
    );
    const res = await PATCH(req, { params });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Forbidden" });
  });

  it("returns 200 on successful admin approval", async () => {
    authenticatedUser();

    // First call: profile check (is_admin: true)
    // Second call: update criteria_sets
    let callCount = 0;
    mockServiceFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // Profile lookup
        return chainMock({ data: { is_admin: true }, error: null });
      }
      // Update criteria_sets — returns no error
      return chainMock({ data: null, error: null });
    });

    const PATCH = await importRoute();
    const req = new Request(
      "http://localhost/api/admin/criteria-sets/cs-001/approve",
      { method: "PATCH" }
    );
    const res = await PATCH(req, { params });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });

    // Verify the correct table was targeted
    expect(mockServiceFrom).toHaveBeenCalledWith("profiles");
    expect(mockServiceFrom).toHaveBeenCalledWith("criteria_sets");
  });

  it("returns 500 when database update fails", async () => {
    authenticatedUser();

    let callCount = 0;
    mockServiceFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return chainMock({ data: { is_admin: true }, error: null });
      }
      // Update fails
      return chainMock({
        data: null,
        error: { message: "Database error" },
      });
    });

    const PATCH = await importRoute();
    const req = new Request(
      "http://localhost/api/admin/criteria-sets/cs-001/approve",
      { method: "PATCH" }
    );
    const res = await PATCH(req, { params });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Failed to approve" });
  });
});

// =====================================================================
// PATCH /api/admin/questions-sets/[id]/approve
// =====================================================================

describe("PATCH /api/admin/questions-sets/[id]/approve", () => {
  async function importRoute() {
    const mod = await import(
      "../../api/admin/questions-sets/[id]/approve/route"
    );
    return mod.PATCH;
  }

  const params = Promise.resolve({ id: "qs-001" });

  it("returns 401 when not authenticated", async () => {
    unauthenticatedUser();
    const PATCH = await importRoute();
    const req = new Request(
      "http://localhost/api/admin/questions-sets/qs-001/approve",
      { method: "PATCH" }
    );
    const res = await PATCH(req, { params });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("returns 403 for non-admin users", async () => {
    authenticatedUser();
    mockServiceFrom.mockReturnValue(
      chainMock({ data: { is_admin: false }, error: null })
    );
    const PATCH = await importRoute();
    const req = new Request(
      "http://localhost/api/admin/questions-sets/qs-001/approve",
      { method: "PATCH" }
    );
    const res = await PATCH(req, { params });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Forbidden" });
  });

  it("returns 200 on successful admin approval", async () => {
    authenticatedUser();

    let callCount = 0;
    mockServiceFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return chainMock({ data: { is_admin: true }, error: null });
      }
      return chainMock({ data: null, error: null });
    });

    const PATCH = await importRoute();
    const req = new Request(
      "http://localhost/api/admin/questions-sets/qs-001/approve",
      { method: "PATCH" }
    );
    const res = await PATCH(req, { params });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });

    expect(mockServiceFrom).toHaveBeenCalledWith("profiles");
    expect(mockServiceFrom).toHaveBeenCalledWith("questions_sets");
  });

  it("returns 500 when database update fails", async () => {
    authenticatedUser();

    let callCount = 0;
    mockServiceFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return chainMock({ data: { is_admin: true }, error: null });
      }
      return chainMock({
        data: null,
        error: { message: "Database error" },
      });
    });

    const PATCH = await importRoute();
    const req = new Request(
      "http://localhost/api/admin/questions-sets/qs-001/approve",
      { method: "PATCH" }
    );
    const res = await PATCH(req, { params });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Failed to approve" });
  });
});

// =====================================================================
// POST /api/parse-questions
// =====================================================================

describe("POST /api/parse-questions", () => {
  async function importRoute() {
    const mod = await import("../../api/parse-questions/route");
    return mod.POST;
  }

  beforeEach(() => {
    // Default: guard passes (authenticated pro user)
    mockRequireProWithRateLimit.mockResolvedValue({ userId: "user-123" });
  });

  it("returns 401 when guard rejects (unauthenticated)", async () => {
    const { NextResponse } = await import("next/server");
    mockRequireProWithRateLimit.mockResolvedValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    );
    const POST = await importRoute();
    const req = new Request("http://localhost/api/parse-questions", {
      method: "POST",
      body: JSON.stringify({ rawText: "Some questions text here" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 403 when guard rejects (free tier)", async () => {
    const { NextResponse } = await import("next/server");
    mockRequireProWithRateLimit.mockResolvedValue(
      NextResponse.json({ error: "Pro subscription required" }, { status: 403 })
    );
    const POST = await importRoute();
    const req = new Request("http://localhost/api/parse-questions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rawText: "Some questions text here" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it("returns 429 when guard rejects (rate limit)", async () => {
    const { NextResponse } = await import("next/server");
    mockRequireProWithRateLimit.mockResolvedValue(
      NextResponse.json({ error: "Daily AI limit reached" }, { status: 429 })
    );
    const POST = await importRoute();
    const req = new Request("http://localhost/api/parse-questions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rawText: "Question 1: Describe your project (max 300 words)" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(429);
  });

  it("returns 400 for invalid JSON body", async () => {
    const POST = await importRoute();
    const req = new Request("http://localhost/api/parse-questions", {
      method: "POST",
      body: "not json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid JSON" });
  });

  it("returns 400 when rawText is too short", async () => {
    const POST = await importRoute();
    const req = new Request("http://localhost/api/parse-questions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rawText: "short" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 200 with parsed questions on success", async () => {
    const mockQuestions = {
      questions: [
        {
          id: "q1",
          question: "Describe your project",
          word_count_max: 300,
          field_type: "text_long",
        },
      ],
    };
    mockParseQuestionsWithAI.mockResolvedValue(mockQuestions);

    const POST = await importRoute();
    const req = new Request("http://localhost/api/parse-questions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rawText: "Question 1: Describe your project (max 300 words)",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.questions).toEqual(mockQuestions);
    expect(mockParseQuestionsWithAI).toHaveBeenCalledWith(
      "Question 1: Describe your project (max 300 words)",
      "user-123"
    );
  });

  it("returns 422 when AI returns invalid structure (validation error)", async () => {
    mockParseQuestionsWithAI.mockRejectedValue(
      new Error(
        "Claude tool use failed validation after retry. Original errors: questions: Required"
      )
    );

    const POST = await importRoute();
    const req = new Request("http://localhost/api/parse-questions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rawText: "Question 1: Describe your project (max 300 words)",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(422);
    expect((await res.json()).error).toContain("invalid structure");
  });

  it("returns 422 when AI response is truncated", async () => {
    mockParseQuestionsWithAI.mockRejectedValue(
      new Error(
        "Claude response truncated (hit max_tokens=8192). Increase maxTokens for this call."
      )
    );

    const POST = await importRoute();
    const req = new Request("http://localhost/api/parse-questions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rawText: "Question 1: Describe your project (max 300 words)",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(422);
    expect((await res.json()).error).toContain("truncated");
  });

  it("returns 500 on unexpected error", async () => {
    mockParseQuestionsWithAI.mockRejectedValue(new Error("Network timeout"));

    const POST = await importRoute();
    const req = new Request("http://localhost/api/parse-questions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rawText: "Question 1: Describe your project (max 300 words)",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(500);
  });
});

// =====================================================================
// POST /api/detect-fund
// =====================================================================

describe("POST /api/detect-fund", () => {
  async function importRoute() {
    const mod = await import("../../api/detect-fund/route");
    return mod.POST;
  }

  beforeEach(() => {
    // Default: guard passes (authenticated pro user)
    mockRequireProWithRateLimit.mockResolvedValue({ userId: "user-123" });
  });

  it("returns 401 when guard rejects (unauthenticated)", async () => {
    const { NextResponse } = await import("next/server");
    mockRequireProWithRateLimit.mockResolvedValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    );
    const POST = await importRoute();
    const req = new Request("http://localhost/api/detect-fund", {
      method: "POST",
      body: JSON.stringify({ fileName: "bid-document.docx" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 403 when guard rejects (free tier)", async () => {
    const { NextResponse } = await import("next/server");
    mockRequireProWithRateLimit.mockResolvedValue(
      NextResponse.json({ error: "Pro subscription required" }, { status: 403 })
    );
    const POST = await importRoute();
    const req = new Request("http://localhost/api/detect-fund", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileName: "bid-document.docx" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it("returns 429 when guard rejects (rate limit)", async () => {
    const { NextResponse } = await import("next/server");
    mockRequireProWithRateLimit.mockResolvedValue(
      NextResponse.json({ error: "Daily AI limit reached" }, { status: 429 })
    );
    const POST = await importRoute();
    const req = new Request("http://localhost/api/detect-fund", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileName: "bid-document.docx" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(429);
  });

  it("returns 400 for invalid JSON body", async () => {
    const POST = await importRoute();
    const req = new Request("http://localhost/api/detect-fund", {
      method: "POST",
      body: "not json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid JSON" });
  });

  it("returns 400 when fileName is missing", async () => {
    const POST = await importRoute();
    const req = new Request("http://localhost/api/detect-fund", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 200 with detected fund name and matched fund", async () => {
    mockDetectFundName.mockResolvedValue("Community Ownership Fund");

    // The route calls createClient() for the fund search
    const fundsChain = chainMock({
      data: [
        {
          id: "fund-001",
          name: "Community Ownership Fund",
          organisation_id: "org-001",
          organisations: { id: "org-001", name: "DLUHC" },
          url: null,
          notes: null,
          created_at: "2025-01-01",
        },
      ],
      error: null,
    });
    mockFrom.mockReturnValue(fundsChain);

    const POST = await importRoute();
    const req = new Request("http://localhost/api/detect-fund", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fileName: "COF-bid-round2.docx",
        bidTextPreview: "This application is for the Community Ownership Fund",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.detectedName).toBe("Community Ownership Fund");
    expect(data.matchedFund).toEqual({
      id: "fund-001",
      name: "Community Ownership Fund",
      organisation_id: "org-001",
      organisations: { id: "org-001", name: "DLUHC" },
      url: null,
      notes: null,
      created_at: "2025-01-01",
    });
    expect(mockDetectFundName).toHaveBeenCalledWith(
      expect.stringContaining("COF-bid-round2.docx"),
      "user-123"
    );
  });

  it("returns 200 with null detectedName when AI returns null", async () => {
    mockDetectFundName.mockResolvedValue(null);

    const POST = await importRoute();
    const req = new Request("http://localhost/api/detect-fund", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileName: "document.docx" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.detectedName).toBeNull();
    expect(data.matchedFund).toBeNull();
  });

  it("returns 200 with null matchedFund when AI errors (non-fatal)", async () => {
    mockDetectFundName.mockRejectedValue(new Error("AI service down"));

    const POST = await importRoute();
    const req = new Request("http://localhost/api/detect-fund", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileName: "bid.docx" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.detectedName).toBeNull();
    expect(data.matchedFund).toBeNull();
  });
});

// =====================================================================
// GET /api/admin/metrics
// =====================================================================

describe("GET /api/admin/metrics", () => {
  async function importRoute() {
    const mod = await import("../../api/admin/metrics/route");
    return mod.GET;
  }

  // Extended chainMock that supports .gte() for date filtering
  function metricsChainMock(resolvedValue: unknown) {
    const chain: Record<string, ReturnType<typeof vi.fn>> = {};
    chain.select = vi.fn(() => chain);
    chain.insert = vi.fn(() => chain);
    chain.update = vi.fn(() => chain);
    chain.upsert = vi.fn(() => chain);
    chain.eq = vi.fn(() => chain);
    chain.gte = vi.fn(() => chain);
    chain.order = vi.fn(() => chain);
    chain.limit = vi.fn(() => Promise.resolve(resolvedValue));
    chain.single = vi.fn(() => Promise.resolve(resolvedValue));
    chain.maybeSingle = vi.fn(() => Promise.resolve(resolvedValue));
    chain.textSearch = vi.fn(() => chain);
    chain.then = vi.fn((resolve: (v: unknown) => unknown) => Promise.resolve(resolvedValue).then(resolve));
    return chain;
  }

  it("returns 401 when not authenticated", async () => {
    unauthenticatedUser();
    const GET = await importRoute();
    const res = await GET();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("returns 403 for non-admin users", async () => {
    authenticatedUser();
    mockServiceFrom.mockReturnValue(
      metricsChainMock({ data: { is_admin: false }, error: null })
    );
    const GET = await importRoute();
    const res = await GET();
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Forbidden" });
  });

  it("returns 200 with aggregated metrics", async () => {
    authenticatedUser();

    const sampleLogs = [
      { pipeline_step: "answer_analysis", model: "claude-sonnet", input_tokens: 1000, output_tokens: 200, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, cost_usd: "0.005", cost_gbp: "0.004" },
      { pipeline_step: "scoring", model: "claude-sonnet", input_tokens: 500, output_tokens: 100, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, cost_usd: "0.003", cost_gbp: "0.002" },
    ];

    let serviceCallCount = 0;
    mockServiceFrom.mockImplementation(() => {
      serviceCallCount++;
      if (serviceCallCount === 1) {
        // Profile check
        return metricsChainMock({ data: { is_admin: true }, error: null });
      }
      // All subsequent calls return appropriate data
      // The route runs 9 queries in Promise.all
      // We'll return sample data for all of them
      return metricsChainMock({ data: sampleLogs, error: null, count: 5 });
    });

    const GET = await importRoute();
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("all_time");
    expect(body).toHaveProperty("last_30_days");
    expect(body).toHaveProperty("recent_logs");
    expect(body).toHaveProperty("recent_reviews");
    expect(body).toHaveProperty("platform");
    expect(body.all_time.total_calls).toBeGreaterThanOrEqual(0);
  });

  it("returns 200 with empty data (all zeros)", async () => {
    authenticatedUser();

    let serviceCallCount = 0;
    mockServiceFrom.mockImplementation(() => {
      serviceCallCount++;
      if (serviceCallCount === 1) {
        return metricsChainMock({ data: { is_admin: true }, error: null });
      }
      return metricsChainMock({ data: null, error: null, count: 0 });
    });

    const GET = await importRoute();
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.all_time).toMatchObject({
      total_calls: 0,
      total_input_tokens: 0,
      total_output_tokens: 0,
      total_cost_usd: 0,
      total_cost_gbp: 0,
    });
    expect(body.platform).toMatchObject({
      users: 0,
      applications: 0,
      completed_reviews: 0,
      funds: 0,
      organisations: 0,
    });
  });

  it("handles null data gracefully", async () => {
    authenticatedUser();

    let serviceCallCount = 0;
    mockServiceFrom.mockImplementation(() => {
      serviceCallCount++;
      if (serviceCallCount === 1) {
        return metricsChainMock({ data: { is_admin: true }, error: null });
      }
      return metricsChainMock({ data: null, error: null, count: null });
    });

    const GET = await importRoute();
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.recent_logs).toEqual([]);
    expect(body.recent_reviews).toEqual([]);
    expect(body.all_time.total_calls).toBe(0);
  });
});
