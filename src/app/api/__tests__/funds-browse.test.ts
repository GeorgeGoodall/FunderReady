import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock Supabase
// ---------------------------------------------------------------------------

const mockGetUser = vi.fn();
const mockFrom = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  })),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Chain mock — covers .select(), .eq(), .order(), .range(), .single(), etc.
// ---------------------------------------------------------------------------

function chainMock(resolvedValue: unknown) {
  const resolved = Promise.resolve(resolvedValue);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: Record<string, any> = {};
  const returnChain = vi.fn(() => chain);
  chain.select = returnChain;
  chain.eq = returnChain;
  chain.order = returnChain;
  chain.range = returnChain;
  chain.single = vi.fn(() => resolved);
  chain.maybeSingle = vi.fn(() => resolved);
  chain.then = (
    onfulfilled: Parameters<Promise<unknown>["then"]>[0],
    onrejected: Parameters<Promise<unknown>["then"]>[1]
  ) => resolved.then(onfulfilled, onrejected);
  return chain;
}

// Dispatch by table name
function tableDispatch(tableResponses: Record<string, unknown>) {
  return (table: string) =>
    chainMock(
      table in tableResponses
        ? tableResponses[table]
        : { data: null, error: null }
    );
}

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------

function authenticatedUser(id = "user-123") {
  mockGetUser.mockResolvedValue({ data: { user: { id } } });
}

function unauthenticatedUser() {
  mockGetUser.mockResolvedValue({ data: { user: null } });
}

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const sampleFund = {
  id: "fund-1",
  name: "Community Fund",
  organisation_id: "org-1",
  organisations: { id: "org-1", name: "Arts Council" },
  url: "https://example.com",
  notes: "Notes",
  opens_at: null,
  closes_at: null,
  created_at: "2026-01-15T10:00:00Z",
};

// =========================================================================
// GET /api/funds/browse
// =========================================================================

describe("GET /api/funds/browse", () => {
  async function importRoute() {
    const mod = await import("../../api/funds/browse/route");
    return mod.GET;
  }

  it("returns 401 when not authenticated", async () => {
    unauthenticatedUser();
    const GET = await importRoute();
    const res = await GET(new Request("http://localhost/api/funds/browse"));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("returns 403 when user is not pro", async () => {
    authenticatedUser();
    mockFrom.mockImplementation(
      tableDispatch({
        profiles: { data: { subscription_tier: "free" }, error: null },
      })
    );
    const GET = await importRoute();
    const res = await GET(new Request("http://localhost/api/funds/browse"));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Pro subscription required" });
  });

  it("returns paginated published funds (200)", async () => {
    authenticatedUser();
    // Return 3 items (limit=2 + 1 extra → hasMore=true)
    const fundsData = [
      { ...sampleFund, id: "fund-1" },
      { ...sampleFund, id: "fund-2" },
      { ...sampleFund, id: "fund-3" },
    ];
    mockFrom.mockImplementation(
      tableDispatch({
        profiles: { data: { subscription_tier: "pro" }, error: null },
        funds: { data: fundsData, error: null },
      })
    );
    const GET = await importRoute();
    const res = await GET(
      new Request("http://localhost/api/funds/browse?page=1&limit=2")
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.hasMore).toBe(true);
    expect(body.funds).toHaveLength(2);
    expect(body.funds[0].id).toBe("fund-1");
    expect(body.funds[1].id).toBe("fund-2");
  });

  it("defaults to page 1 and limit 20 (200, empty)", async () => {
    authenticatedUser();
    mockFrom.mockImplementation(
      tableDispatch({
        profiles: { data: { subscription_tier: "pro" }, error: null },
        funds: { data: [], error: null },
      })
    );
    const GET = await importRoute();
    const res = await GET(new Request("http://localhost/api/funds/browse"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.funds).toEqual([]);
    expect(body.hasMore).toBe(false);
  });

  it("returns 500 when query fails", async () => {
    authenticatedUser();
    mockFrom.mockImplementation(
      tableDispatch({
        profiles: { data: { subscription_tier: "pro" }, error: null },
        funds: { data: null, error: { message: "DB error" } },
      })
    );
    const GET = await importRoute();
    const res = await GET(new Request("http://localhost/api/funds/browse"));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Failed to fetch funds" });
  });
});
