import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetUser = vi.fn();
const mockServiceFrom = vi.fn();
const mockRpc = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
  })),
  createServiceClient: vi.fn(() => ({
    from: mockServiceFrom,
    rpc: mockRpc,
  })),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

function chainMock(resolvedValue: unknown) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  chain.select = vi.fn(() => chain);
  chain.update = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.is = vi.fn(() => chain);
  chain.single = vi.fn(() => Promise.resolve(resolvedValue));
  chain.maybeSingle = vi.fn(() => Promise.resolve(resolvedValue));
  return chain;
}

function authenticatedUser(id = "user-1") {
  mockGetUser.mockResolvedValue({ data: { user: { id } } });
}

function unauthenticatedUser() {
  mockGetUser.mockResolvedValue({ data: { user: null } });
}

describe("POST /api/redeem", () => {
  it("returns 401 when not authenticated", async () => {
    unauthenticatedUser();
    const { POST } = await import("../route");
    const req = new Request("http://localhost/api/redeem", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "abc123" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 404 when code does not exist", async () => {
    authenticatedUser();
    mockServiceFrom.mockReturnValue(
      chainMock({ data: null, error: null })
    );
    const { POST } = await import("../route");
    const req = new Request("http://localhost/api/redeem", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "notfound" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(404);
  });

  it("returns 410 when link is already used", async () => {
    authenticatedUser();
    mockServiceFrom.mockReturnValue(
      chainMock({
        data: {
          id: "link-1", code: "abc", credits: 10,
          redeemed_at: "2026-04-05T10:00:00Z",
          expires_at: null,
        },
        error: null,
      })
    );
    const { POST } = await import("../route");
    const req = new Request("http://localhost/api/redeem", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "abc" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(410);
  });

  it("returns 422 when link is expired", async () => {
    authenticatedUser();
    mockServiceFrom.mockReturnValue(
      chainMock({
        data: {
          id: "link-1", code: "abc", credits: 10,
          redeemed_at: null,
          expires_at: "2020-01-01T00:00:00Z",
        },
        error: null,
      })
    );
    const { POST } = await import("../route");
    const req = new Request("http://localhost/api/redeem", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "abc" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(422);
  });

  it("returns 410 when atomic UPDATE finds link already claimed (race condition)", async () => {
    authenticatedUser();
    let callCount = 0;
    mockServiceFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return chainMock({
          data: { id: "link-1", code: "abc", credits: 10, redeemed_at: null, expires_at: null },
          error: null,
        });
      }
      return chainMock({ data: null, error: null });
    });
    const { POST } = await import("../route");
    const req = new Request("http://localhost/api/redeem", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "abc" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(410);
  });

  it("grants credits and returns them on success", async () => {
    authenticatedUser("user-42");
    let callCount = 0;
    mockServiceFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return chainMock({
          data: { id: "link-1", code: "abc", credits: 15, redeemed_at: null, expires_at: null },
          error: null,
        });
      }
      return chainMock({ data: { id: "link-1" }, error: null });
    });
    mockRpc.mockResolvedValue({ error: null });

    const { POST } = await import("../route");
    const req = new Request("http://localhost/api/redeem", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "abc" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.credits).toBe(15);
    expect(mockRpc).toHaveBeenCalledWith("increment_purchased_credits", {
      p_user_id: "user-42",
      p_credits: 15,
    });
  });
});
