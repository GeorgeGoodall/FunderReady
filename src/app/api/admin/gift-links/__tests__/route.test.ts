import { describe, it, expect, vi, beforeEach } from "vitest";

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

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

function chainMock(resolvedValue: unknown) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  chain.select = vi.fn(() => chain);
  chain.insert = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.order = vi.fn(() => chain);
  chain.single = vi.fn(() => Promise.resolve(resolvedValue));
  chain.then = vi.fn((resolve: (v: unknown) => unknown) =>
    Promise.resolve(resolvedValue).then(resolve)
  );
  return chain;
}

function adminSetup() {
  mockGetUser.mockResolvedValue({ data: { user: { id: "admin-1" } } });
  let callCount = 0;
  mockServiceFrom.mockImplementation(() => {
    callCount++;
    if (callCount === 1) {
      return chainMock({ data: { is_admin: true }, error: null });
    }
    return chainMock({ data: [], error: null });
  });
}

function nonAdminSetup() {
  mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
  mockServiceFrom.mockReturnValue(
    chainMock({ data: { is_admin: false }, error: null })
  );
}

describe("POST /api/admin/gift-links", () => {
  it("returns 401 when not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const { POST } = await import("../route");
    const req = new Request("http://localhost/api/admin/gift-links", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ credits: 10 }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 403 when not admin", async () => {
    nonAdminSetup();
    const { POST } = await import("../route");
    const req = new Request("http://localhost/api/admin/gift-links", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ credits: 10 }),
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it("returns 400 when credits is below 1", async () => {
    adminSetup();
    const { POST } = await import("../route");
    const req = new Request("http://localhost/api/admin/gift-links", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ credits: 0 }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: expect.stringContaining("1") });
  });

  it("returns 400 when credits exceeds 100", async () => {
    adminSetup();
    const { POST } = await import("../route");
    const req = new Request("http://localhost/api/admin/gift-links", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ credits: 101 }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: expect.stringContaining("100") });
  });

  it("creates gift link and returns code + url on success", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "admin-1" } } });
    let callCount = 0;
    const insertedRow = { id: "link-1", code: "abc123", credits: 10, expires_at: null };
    mockServiceFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return chainMock({ data: { is_admin: true }, error: null });
      return chainMock({ data: insertedRow, error: null });
    });

    const { POST } = await import("../route");
    const req = new Request("http://localhost/api/admin/gift-links", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ credits: 10 }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.code).toBe("abc123");
    expect(body.url).toContain("/redeem?code=abc123");
  });
});

describe("GET /api/admin/gift-links", () => {
  it("returns 401 when not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const { GET } = await import("../route");
    const req = new Request("http://localhost/api/admin/gift-links");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns list of gift links with status field", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "admin-1" } } });
    const links = [
      { id: "1", code: "aaa", credits: 5, created_at: "2026-04-06T10:00:00Z", expires_at: null, redeemed_by: null, redeemed_at: null, created_by: "admin-1" },
      { id: "2", code: "bbb", credits: 10, created_at: "2026-04-05T10:00:00Z", expires_at: "2020-01-01T00:00:00Z", redeemed_by: null, redeemed_at: null, created_by: "admin-1" },
      { id: "3", code: "ccc", credits: 3, created_at: "2026-04-04T10:00:00Z", expires_at: null, redeemed_by: "user-2", redeemed_at: "2026-04-05T12:00:00Z", created_by: "admin-1" },
    ];
    let callCount = 0;
    mockServiceFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return chainMock({ data: { is_admin: true }, error: null });
      return chainMock({ data: links, error: null });
    });
    const { GET } = await import("../route");
    const req = new Request("http://localhost/api/admin/gift-links");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body[0].status).toBe("active");
    expect(body[1].status).toBe("expired");
    expect(body[2].status).toBe("used");
  });
});
