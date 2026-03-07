import { describe, it, expect, vi, beforeEach } from "vitest";

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

function chainMock(resolvedValue: unknown) {
  const resolved = Promise.resolve(resolvedValue);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: Record<string, any> = {};
  const returnChain = vi.fn(() => chain);
  chain.select = returnChain;
  chain.update = returnChain;
  chain.eq = returnChain;
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

describe("PATCH /api/funds/[id]/share", () => {
  async function importRoute() {
    const mod = await import("../../api/funds/[id]/share/route");
    return mod.PATCH;
  }

  it("returns 401 when not authenticated", async () => {
    unauthenticatedUser();
    const PATCH = await importRoute();
    const res = await PATCH(
      new Request("http://localhost/api/funds/fund-1/share", {
        method: "PATCH",
        body: JSON.stringify({ shared: true }),
        headers: { "Content-Type": "application/json" },
      }),
      { params: Promise.resolve({ id: "fund-1" }) }
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 when shared is not a boolean", async () => {
    authenticatedUser();
    const PATCH = await importRoute();
    const res = await PATCH(
      new Request("http://localhost/api/funds/fund-1/share", {
        method: "PATCH",
        body: JSON.stringify({ shared: "yes" }),
        headers: { "Content-Type": "application/json" },
      }),
      { params: Promise.resolve({ id: "fund-1" }) }
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when trying to unshare an approved fund", async () => {
    authenticatedUser();
    mockFrom.mockReturnValue(
      chainMock({ data: { id: "fund-1", approved: true, shared: true, created_by: "user-123" }, error: null })
    );
    const PATCH = await importRoute();
    const res = await PATCH(
      new Request("http://localhost/api/funds/fund-1/share", {
        method: "PATCH",
        body: JSON.stringify({ shared: false }),
        headers: { "Content-Type": "application/json" },
      }),
      { params: Promise.resolve({ id: "fund-1" }) }
    );
    expect(res.status).toBe(400);
  });

  it("returns 200 when sharing a private fund", async () => {
    authenticatedUser();
    // First call: select to check fund state. Second call: update.
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return chainMock({ data: { id: "fund-1", approved: false, shared: false, created_by: "user-123" }, error: null });
      }
      return chainMock({ data: { id: "fund-1" }, error: null });
    });
    const PATCH = await importRoute();
    const res = await PATCH(
      new Request("http://localhost/api/funds/fund-1/share", {
        method: "PATCH",
        body: JSON.stringify({ shared: true }),
        headers: { "Content-Type": "application/json" },
      }),
      { params: Promise.resolve({ id: "fund-1" }) }
    );
    expect(res.status).toBe(200);
  });

  it("returns 404 when fund is not found", async () => {
    authenticatedUser();
    mockFrom.mockReturnValue(
      chainMock({ data: null, error: { message: "Not found", code: "PGRST116" } })
    );
    const PATCH = await importRoute();
    const res = await PATCH(
      new Request("http://localhost/api/funds/fund-99/share", {
        method: "PATCH",
        body: JSON.stringify({ shared: true }),
        headers: { "Content-Type": "application/json" },
      }),
      { params: Promise.resolve({ id: "fund-99" }) }
    );
    expect(res.status).toBe(404);
  });

  it("returns 200 (no-op) when fund is already in desired share state", async () => {
    authenticatedUser();
    mockFrom.mockReturnValue(
      chainMock({ data: { id: "fund-1", approved: false, shared: true, created_by: "user-123" }, error: null })
    );
    const PATCH = await importRoute();
    const res = await PATCH(
      new Request("http://localhost/api/funds/fund-1/share", {
        method: "PATCH",
        body: JSON.stringify({ shared: true }),
        headers: { "Content-Type": "application/json" },
      }),
      { params: Promise.resolve({ id: "fund-1" }) }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it("returns 500 when update query fails", async () => {
    authenticatedUser();
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return chainMock({ data: { id: "fund-1", approved: false, shared: false, created_by: "user-123" }, error: null });
      }
      return chainMock({ data: null, error: { message: "DB error" } });
    });
    const PATCH = await importRoute();
    const res = await PATCH(
      new Request("http://localhost/api/funds/fund-1/share", {
        method: "PATCH",
        body: JSON.stringify({ shared: true }),
        headers: { "Content-Type": "application/json" },
      }),
      { params: Promise.resolve({ id: "fund-1" }) }
    );
    expect(res.status).toBe(500);
  });
});
