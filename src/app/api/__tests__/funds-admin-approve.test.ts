import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

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
});

// ---------------------------------------------------------------------------
// Chain mock helpers (mirrors admin-crud.test.ts pattern)
// ---------------------------------------------------------------------------

function chainMock(resolvedValue: unknown) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  chain.select = vi.fn(() => chain);
  chain.update = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.single = vi.fn(() => Promise.resolve(resolvedValue));
  chain.then = vi.fn((resolve: (v: unknown) => unknown) =>
    Promise.resolve(resolvedValue).then(resolve)
  );
  return chain;
}

function authenticatedUser(id = "admin-user") {
  mockGetUser.mockResolvedValue({ data: { user: { id } } });
}

function unauthenticatedUser() {
  mockGetUser.mockResolvedValue({ data: { user: null } });
}

/** Sets up admin profile check as first serviceFrom call, then uses the given mocks for subsequent calls. */
function adminWithSequence(mocks: Array<() => ReturnType<typeof chainMock>>) {
  authenticatedUser();
  let callCount = 0;
  mockServiceFrom.mockImplementation(() => {
    callCount++;
    if (callCount === 1) {
      return chainMock({ data: { is_admin: true }, error: null });
    }
    const idx = callCount - 2;
    return mocks[Math.min(idx, mocks.length - 1)]();
  });
}

function nonAdminUser() {
  authenticatedUser();
  mockServiceFrom.mockImplementation(() =>
    chainMock({ data: { is_admin: false }, error: null })
  );
}

// ---------------------------------------------------------------------------
// Tests: PATCH /api/admin/funds/[id]/approve
// ---------------------------------------------------------------------------

describe("PATCH /api/admin/funds/[id]/approve", () => {
  async function importRoute() {
    const mod = await import("../../api/admin/funds/[id]/approve/route");
    return mod.PATCH;
  }

  const fakeParams = { params: Promise.resolve({ id: "fund-1" }) };

  it("returns 401 when not authenticated", async () => {
    unauthenticatedUser();
    mockServiceFrom.mockImplementation(() =>
      chainMock({ data: null, error: null })
    );
    const PATCH = await importRoute();
    const res = await PATCH(new Request("http://localhost"), fakeParams);
    expect(res.status).toBe(401);
  });

  it("returns 403 when user is not admin", async () => {
    nonAdminUser();
    const PATCH = await importRoute();
    const res = await PATCH(new Request("http://localhost"), fakeParams);
    expect(res.status).toBe(403);
  });

  it("returns 404 when fund does not exist", async () => {
    adminWithSequence([
      () => chainMock({ data: null, error: null }),
    ]);
    const PATCH = await importRoute();
    const res = await PATCH(new Request("http://localhost"), fakeParams);
    expect(res.status).toBe(404);
  });

  it("returns 400 when fund is not shared", async () => {
    adminWithSequence([
      () => chainMock({ data: { shared: false }, error: null }),
    ]);
    const PATCH = await importRoute();
    const res = await PATCH(new Request("http://localhost"), fakeParams);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/not been submitted/i);
  });

  it("returns 200 when fund is shared and approve succeeds", async () => {
    adminWithSequence([
      () => chainMock({ data: { shared: true }, error: null }),
      () => chainMock({ data: { id: "fund-1" }, error: null }),
    ]);
    const PATCH = await importRoute();
    const res = await PATCH(new Request("http://localhost"), fakeParams);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it("returns 500 when update query fails", async () => {
    adminWithSequence([
      () => chainMock({ data: { shared: true }, error: null }),
      () => chainMock({ data: null, error: { message: "DB error", code: "500" } }),
    ]);
    const PATCH = await importRoute();
    const res = await PATCH(new Request("http://localhost"), fakeParams);
    expect(res.status).toBe(500);
  });
});
