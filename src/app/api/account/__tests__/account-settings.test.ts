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

  it("returns 400 for malformed JSON body", async () => {
    authenticatedUser();
    const PATCH = await importRoute();
    const req = new Request("http://localhost/api/account/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: "not-json{",
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

// =====================================================================
// PATCH /api/account/password
// =====================================================================

describe("PATCH /api/account/password", () => {
  async function importRoute() {
    const mod = await import("../password/route");
    return mod.PATCH;
  }

  it("returns 401 when not authenticated", async () => {
    unauthenticatedUser();
    const PATCH = await importRoute();
    const req = new Request("http://localhost/api/account/password", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "newpass123" }),
    });
    const res = await PATCH(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 for password shorter than 8 characters", async () => {
    authenticatedUser();
    const PATCH = await importRoute();
    const req = new Request("http://localhost/api/account/password", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "short" }),
    });
    const res = await PATCH(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 for missing password", async () => {
    authenticatedUser();
    const PATCH = await importRoute();
    const req = new Request("http://localhost/api/account/password", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const res = await PATCH(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 for malformed JSON body", async () => {
    authenticatedUser();
    const PATCH = await importRoute();
    const req = new Request("http://localhost/api/account/password", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: "not-json{",
    });
    const res = await PATCH(req);
    expect(res.status).toBe(400);
  });

  it("returns 200 on success", async () => {
    authenticatedUser();
    mockAuthUpdateUser.mockResolvedValue({ data: {}, error: null });
    const PATCH = await importRoute();
    const req = new Request("http://localhost/api/account/password", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "newPassword123!" }),
    });
    const res = await PATCH(req);
    expect(res.status).toBe(200);
  });

  it("returns 400 when Supabase rejects password (e.g. same as current)", async () => {
    authenticatedUser();
    mockAuthUpdateUser.mockResolvedValue({
      data: null,
      error: { message: "New password should be different from the old password." },
    });
    const PATCH = await importRoute();
    const req = new Request("http://localhost/api/account/password", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "sameOldPassword1!" }),
    });
    const res = await PATCH(req);
    expect(res.status).toBe(400);
  });
});

// =====================================================================
// PATCH /api/account/email
// =====================================================================

describe("PATCH /api/account/email", () => {
  async function importRoute() {
    const mod = await import("../email/route");
    return mod.PATCH;
  }

  it("returns 401 when not authenticated", async () => {
    unauthenticatedUser();
    const PATCH = await importRoute();
    const req = new Request("http://localhost/api/account/email", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "new@example.com" }),
    });
    const res = await PATCH(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid email", async () => {
    authenticatedUser();
    const PATCH = await importRoute();
    const req = new Request("http://localhost/api/account/email", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "not-an-email" }),
    });
    const res = await PATCH(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 for missing email", async () => {
    authenticatedUser();
    const PATCH = await importRoute();
    const req = new Request("http://localhost/api/account/email", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const res = await PATCH(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 for malformed JSON body", async () => {
    authenticatedUser();
    const PATCH = await importRoute();
    const req = new Request("http://localhost/api/account/email", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: "not-json{",
    });
    const res = await PATCH(req);
    expect(res.status).toBe(400);
  });

  it("returns 200 and sends verification email on success", async () => {
    authenticatedUser();
    mockAuthUpdateUser.mockResolvedValue({ data: {}, error: null });
    const PATCH = await importRoute();
    const req = new Request("http://localhost/api/account/email", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "new@example.com" }),
    });
    const res = await PATCH(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.message).toMatch(/verification/i);
    expect(mockAuthUpdateUser).toHaveBeenCalledWith({ email: "new@example.com" });
  });

  it("returns 400 when Supabase rejects (e.g. email already in use)", async () => {
    authenticatedUser();
    mockAuthUpdateUser.mockResolvedValue({
      data: null,
      error: { message: "Email address already registered." },
    });
    const PATCH = await importRoute();
    const req = new Request("http://localhost/api/account/email", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "taken@example.com" }),
    });
    const res = await PATCH(req);
    expect(res.status).toBe(400);
  });
});

// =====================================================================
// GET /api/account/export
// =====================================================================

// Thenable chain for export queries (called via Promise.all, no .single())
function exportChainMock(resolvedValue: unknown) {
  const p = Promise.resolve(resolvedValue);
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.order = vi.fn(() => chain);
  chain.limit = vi.fn(() => chain);
  chain.single = vi.fn(() => p);
  // Make the chain itself awaitable (Supabase query builder is a PromiseLike)
  (chain as Record<string, unknown>).then = (
    resolve: (v: unknown) => void,
    reject?: (e: unknown) => void
  ) => p.then(resolve, reject);
  return chain;
}

describe("GET /api/account/export", () => {
  async function importRoute() {
    const mod = await import("../export/route");
    return mod.GET;
  }

  it("returns 401 when not authenticated", async () => {
    unauthenticatedUser();
    const GET = await importRoute();
    const req = new Request("http://localhost/api/account/export");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns 200 with JSON file download and correct headers", async () => {
    authenticatedUser("user-export");
    mockServiceAuthAdmin.mockResolvedValue({
      data: { user: { id: "user-export", email: "test@example.com", created_at: "2026-01-01T00:00:00Z", last_sign_in_at: "2026-04-01T00:00:00Z" } },
      error: null,
    });

    const tableData: Record<string, unknown[]> = {
      profiles: [{ id: "user-export", display_name: "Test User", subscription_tier: "pro" }],
      organisations: [{ id: "org-1", name: "Test Org" }],
      funds: [{ id: "fund-1", name: "Test Fund" }],
      criteria_sets: [],
      questions_sets: [],
      applications: [{ id: "app-1", title: "My Application" }],
      application_answers: [],
      application_reviews: [],
      review_feedback: [],
      usage: [{ period: "2026-04", reviews_used: 2 }],
    };

    mockFrom.mockImplementation((table: string) =>
      exportChainMock({ data: tableData[table] ?? [], error: null })
    );

    const GET = await importRoute();
    const req = new Request("http://localhost/api/account/export");
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toMatch(/attachment/);
    expect(res.headers.get("content-type")).toMatch(/application\/json/);

    const body = await res.json();
    expect(body).toHaveProperty("exported_at");
    expect(body).toHaveProperty("account");
    expect(body).toHaveProperty("applications");
    expect(body.applications).toHaveLength(1);
  });
});
