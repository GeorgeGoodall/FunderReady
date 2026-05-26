import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

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

// Mock requirePro guard
const mockRequirePro = vi.fn();
vi.mock("@/lib/usage/require-pro", () => ({
  requirePro: (...args: unknown[]) =>
    mockRequirePro(...args),
  isGuardError: (result: unknown) => result instanceof NextResponse,
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

  beforeEach(() => {
    // Default: guard passes (authenticated pro user)
    mockRequirePro.mockResolvedValue({ userId: "user-123" });
  });

  it("returns 401 when guard rejects (unauthenticated)", async () => {
    const { NextResponse } = await import("next/server");
    mockRequirePro.mockResolvedValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    );
    const POST = await importRoute();
    const req = new Request("http://localhost/api/parse-criteria", {
      method: "POST",
      body: JSON.stringify({ rawText: "Some criteria text here" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 403 when guard rejects (free tier)", async () => {
    const { NextResponse } = await import("next/server");
    mockRequirePro.mockResolvedValue(
      NextResponse.json({ error: "Pro subscription required" }, { status: 403 })
    );
    const POST = await importRoute();
    const req = new Request("http://localhost/api/parse-criteria", {
      method: "POST",
      body: JSON.stringify({ rawText: "Some criteria text here" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it("returns 400 for invalid JSON body", async () => {
    const POST = await importRoute();
    const req = new Request("http://localhost/api/parse-criteria", {
      method: "POST",
      body: "not json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when rawText is too short", async () => {
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
    expect(mockParseCriteriaWithAI).toHaveBeenCalledWith("Quality of delivery — 30%", "user-123");
  });

  it("returns 422 when AI returns invalid structure (validation error)", async () => {
    mockParseCriteriaWithAI.mockRejectedValue(
      new Error("Claude tool use failed validation after retry. Original errors: criteria: Required")
    );

    const POST = await importRoute();
    const req = new Request("http://localhost/api/parse-criteria", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rawText: "Quality of delivery — 30%" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(422);
    expect((await res.json()).error).toContain("invalid structure");
  });

  it("returns 422 when AI response is truncated", async () => {
    mockParseCriteriaWithAI.mockRejectedValue(
      new Error("Claude response truncated (hit max_tokens=8192). Increase maxTokens for this call.")
    );

    const POST = await importRoute();
    const req = new Request("http://localhost/api/parse-criteria", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rawText: "Quality of delivery — 30%" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(422);
    expect((await res.json()).error).toContain("truncated");
  });

  it("returns 500 on unexpected error", async () => {
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

