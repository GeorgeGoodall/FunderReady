import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Supabase mock
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

// Mock usage period so checkUsage gets a stable period key
vi.mock("@/lib/usage/period", () => ({
  getUsagePeriod: vi.fn(() => ({
    periodKey: "2026-03",
    resetDate: new Date("2026-04-01"),
  })),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function chainMock(resolvedValue: unknown) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  chain.select = vi.fn(() => chain);
  chain.insert = vi.fn(() => chain);
  chain.update = vi.fn(() => chain);
  chain.upsert = vi.fn(() => chain);
  chain.delete = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.limit = vi.fn(() => chain);
  chain.single = vi.fn(() => Promise.resolve(resolvedValue));
  return chain;
}

function authenticatedUser(id = "user-123") {
  mockGetUser.mockResolvedValue({ data: { user: { id } } });
}

function unauthenticatedUser() {
  mockGetUser.mockResolvedValue({ data: { user: null } });
}

async function importRoute() {
  return import("../route");
}

// ---------------------------------------------------------------------------
// GET /api/usage
// ---------------------------------------------------------------------------

describe("GET /api/usage", () => {
  it("returns 401 for unauthenticated user", async () => {
    unauthenticatedUser();
    const { GET } = await importRoute();
    const res = await GET();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("returns 200 with usage data shape for authenticated user", async () => {
    authenticatedUser("user-abc");

    // checkUsage first queries profiles via serviceClient, then usage via serviceClient
    const profileChain = chainMock({
      data: {
        subscription_tier: "pro",
        current_period_end: null,
      },
      error: null,
    });
    const usageChain = chainMock({
      data: {
        credits_used: 3,
        credits_limit: 100,
        bonus_reviews: 2,
      },
      error: null,
    });

    let callCount = 0;
    mockServiceFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return profileChain;
      return usageChain;
    });

    const { GET } = await importRoute();
    const res = await GET();
    expect(res.status).toBe(200);

    const body = await res.json();
    // Verify shape matches UsageResult
    expect(body).toMatchObject({
      allowed: expect.any(Boolean),
      used: expect.any(Number),
      limit: expect.any(Number),
      bonus: expect.any(Number),
      remaining: expect.any(Number),
      period: expect.any(String),
    });
    // Spot-check computed values
    expect(body.used).toBe(3);
    expect(body.limit).toBe(100);
    expect(body.bonus).toBe(2);
    // remaining = max(0, credits_limit + bonus_reviews - credits_used)
    //           = max(0, 100 + 2 - 3) = 99
    expect(body.remaining).toBe(99);
    expect(body.allowed).toBe(true);
  });
});
