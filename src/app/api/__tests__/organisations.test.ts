import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock Supabase
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

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Chain mock helpers
// ---------------------------------------------------------------------------

function chainMock(resolvedValue: unknown) {
  const resolved = Promise.resolve(resolvedValue);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: Record<string, any> = {};
  const returnChain = vi.fn(() => chain);
  chain.select = returnChain;
  chain.insert = returnChain;
  chain.update = returnChain;
  chain.eq = returnChain;
  chain.or = returnChain;
  chain.order = returnChain;
  chain.limit = returnChain;
  chain.textSearch = returnChain;
  chain.single = vi.fn(() => resolved);
  chain.then = (
    onfulfilled: Parameters<Promise<unknown>["then"]>[0],
    onrejected: Parameters<Promise<unknown>["then"]>[1]
  ) => resolved.then(onfulfilled, onrejected);
  return chain;
}

function authenticatedUser(id = "user-123") {
  mockGetUser.mockResolvedValue({ data: { user: { id } } });
}

function unauthenticatedUser() {
  mockGetUser.mockResolvedValue({ data: { user: null } });
}

function routeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

// =====================================================================
// GET /api/organisations
// =====================================================================

describe("GET /api/organisations", () => {
  async function importRoute() {
    const mod = await import("../organisations/route");
    return mod.GET;
  }

  it("returns 401 when unauthenticated", async () => {
    unauthenticatedUser();
    const GET = await importRoute();
    const res = await GET(new Request("http://localhost/api/organisations"));
    expect(res.status).toBe(401);
  });

  it("returns user's own orgs when no query", async () => {
    authenticatedUser();
    const orgs = [{ id: "org-1", name: "My Org", approved: false }];
    mockFrom.mockReturnValue(chainMock({ data: orgs, error: null }));

    const GET = await importRoute();
    const res = await GET(new Request("http://localhost/api/organisations"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.organisations).toEqual(orgs);
  });

  it("returns empty array for short query", async () => {
    authenticatedUser();
    mockFrom.mockReturnValue(chainMock({ data: [], error: null }));

    const GET = await importRoute();
    const res = await GET(new Request("http://localhost/api/organisations?q=a"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.organisations).toEqual([]);
  });

  it("returns search results for valid query", async () => {
    authenticatedUser();
    const orgs = [
      { id: "org-1", name: "National Lottery Fund", approved: true },
    ];
    mockFrom.mockReturnValue(chainMock({ data: orgs, error: null }));

    const GET = await importRoute();
    const res = await GET(new Request("http://localhost/api/organisations?q=lottery"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.organisations).toEqual(orgs);
  });
});

// =====================================================================
// POST /api/organisations
// =====================================================================

describe("POST /api/organisations", () => {
  async function importRoute() {
    const mod = await import("../organisations/route");
    return mod.POST;
  }

  it("returns 401 when unauthenticated", async () => {
    unauthenticatedUser();
    const POST = await importRoute();
    const res = await POST(
      new Request("http://localhost/api/organisations", {
        method: "POST",
        body: JSON.stringify({ name: "Test Org" }),
        headers: { "Content-Type": "application/json" },
      })
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 for missing name", async () => {
    authenticatedUser();
    const POST = await importRoute();
    const res = await POST(
      new Request("http://localhost/api/organisations", {
        method: "POST",
        body: JSON.stringify({}),
        headers: { "Content-Type": "application/json" },
      })
    );
    expect(res.status).toBe(400);
  });

  it("creates org and returns 201", async () => {
    authenticatedUser();
    const newOrg = { id: "org-new", name: "DLUHC", url: null, description: null, approved: false };
    mockFrom.mockReturnValue(chainMock({ data: newOrg, error: null }));

    const POST = await importRoute();
    const res = await POST(
      new Request("http://localhost/api/organisations", {
        method: "POST",
        body: JSON.stringify({ name: "DLUHC" }),
        headers: { "Content-Type": "application/json" },
      })
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.organisation.name).toBe("DLUHC");
  });
});

// =====================================================================
// PATCH /api/admin/organisations/[id]/approve
// =====================================================================

describe("PATCH /api/admin/organisations/[id]/approve", () => {
  async function importRoute() {
    const mod = await import("../admin/organisations/[id]/approve/route");
    return mod.PATCH;
  }

  it("returns 401 when unauthenticated", async () => {
    unauthenticatedUser();
    const PATCH = await importRoute();
    const res = await PATCH(new Request("http://localhost"), routeParams("org-1"));
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin user", async () => {
    authenticatedUser();
    mockServiceFrom.mockReturnValue(
      chainMock({ data: { is_admin: false }, error: null })
    );

    const PATCH = await importRoute();
    const res = await PATCH(new Request("http://localhost"), routeParams("org-1"));
    expect(res.status).toBe(403);
  });

  it("approves organisation for admin user", async () => {
    authenticatedUser();
    let callCount = 0;
    mockServiceFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // profiles lookup
        return chainMock({ data: { is_admin: true }, error: null });
      }
      // organisations update
      return chainMock({ data: null, error: null });
    });

    const PATCH = await importRoute();
    const res = await PATCH(new Request("http://localhost"), routeParams("org-1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });
});
