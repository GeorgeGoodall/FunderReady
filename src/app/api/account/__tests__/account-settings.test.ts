import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Supabase mock
// ---------------------------------------------------------------------------

const mockGetUser = vi.fn();
const mockFrom = vi.fn();
const mockAuthUpdateUser = vi.fn();
const mockServiceAuthAdmin = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser, updateUser: mockAuthUpdateUser },
    from: mockFrom,
  })),
  createServiceClient: vi.fn(() => ({
    from: mockFrom,
    auth: { admin: { getUserById: mockServiceAuthAdmin } },
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
  const p = Promise.resolve(resolvedValue);
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn(() => chain);
  chain.insert = vi.fn(() => chain);
  chain.update = vi.fn(() => chain);
  chain.upsert = vi.fn(() => chain);
  chain.delete = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.order = vi.fn(() => chain);
  chain.limit = vi.fn(() => chain);
  chain.single = vi.fn(() => p);
  // Make chain itself awaitable — Supabase query builder is a PromiseLike
  (chain as Record<string, unknown>).then = (
    resolve: (v: unknown) => void,
    reject?: (e: unknown) => void
  ) => p.then(resolve, reject);
  return chain;
}

function authenticatedUser(id = "user-123") {
  mockGetUser.mockResolvedValue({ data: { user: { id, email: "test@example.com" } } });
}

function unauthenticatedUser() {
  mockGetUser.mockResolvedValue({ data: { user: null } });
}

// =====================================================================
// PATCH /api/account/profile
// =====================================================================

describe("PATCH /api/account/profile", () => {
  async function importRoute() {
    const mod = await import("../profile/route");
    return mod.PATCH;
  }

  it("returns 401 when not authenticated", async () => {
    unauthenticatedUser();
    const PATCH = await importRoute();
    const req = new Request("http://localhost/api/account/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ display_name: "Alice" }),
    });
    const res = await PATCH(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 for missing display_name", async () => {
    authenticatedUser();
    const PATCH = await importRoute();
    const req = new Request("http://localhost/api/account/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const res = await PATCH(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 for empty display_name", async () => {
    authenticatedUser();
    const PATCH = await importRoute();
    const req = new Request("http://localhost/api/account/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ display_name: "  " }),
    });
    const res = await PATCH(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 for display_name longer than 100 characters", async () => {
    authenticatedUser();
    const PATCH = await importRoute();
    const req = new Request("http://localhost/api/account/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ display_name: "a".repeat(101) }),
    });
    const res = await PATCH(req);
    expect(res.status).toBe(400);
  });

  it("returns 200 on success", async () => {
    authenticatedUser();
    const chain = chainMock({ error: null });
    mockFrom.mockReturnValue(chain);
    const PATCH = await importRoute();
    const req = new Request("http://localhost/api/account/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ display_name: "Alice Smith" }),
    });
    const res = await PATCH(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.display_name).toBe("Alice Smith");
  });

  it("returns 500 on DB error", async () => {
    authenticatedUser();
    const chain = chainMock({ error: { message: "db error" } });
    mockFrom.mockReturnValue(chain);
    const PATCH = await importRoute();
    const req = new Request("http://localhost/api/account/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ display_name: "Alice" }),
    });
    const res = await PATCH(req);
    expect(res.status).toBe(500);
  });
});
