import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Shared mocking helpers (same pattern as admin-and-ai.test.ts)
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
// Chain mock helper
// ---------------------------------------------------------------------------

function chainMock(resolvedValue: unknown) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  chain.select = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.single = vi.fn(() => Promise.resolve(resolvedValue));
  return chain;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("requireAdmin", () => {
  async function importHelper() {
    const mod = await import("../require-admin");
    return mod.requireAdmin;
  }

  it("returns 401 error when user is not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const requireAdmin = await importHelper();
    const result = await requireAdmin();

    expect(result.error).toBeDefined();
    expect(result.error!.status).toBe(401);
    expect(await result.error!.json()).toEqual({ error: "Unauthorized" });
    expect(result.serviceClient).toBeUndefined();
    expect(result.userId).toBeUndefined();
  });

  it("returns 403 error when user is not an admin", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-123" } },
    });
    mockServiceFrom.mockReturnValue(
      chainMock({ data: { is_admin: false }, error: null })
    );

    const requireAdmin = await importHelper();
    const result = await requireAdmin();

    expect(result.error).toBeDefined();
    expect(result.error!.status).toBe(403);
    expect(await result.error!.json()).toEqual({ error: "Forbidden" });
    expect(result.serviceClient).toBeUndefined();
    expect(result.userId).toBeUndefined();
  });

  it("returns 403 error when profile lookup returns null", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-123" } },
    });
    mockServiceFrom.mockReturnValue(
      chainMock({ data: null, error: null })
    );

    const requireAdmin = await importHelper();
    const result = await requireAdmin();

    expect(result.error).toBeDefined();
    expect(result.error!.status).toBe(403);
    expect(await result.error!.json()).toEqual({ error: "Forbidden" });
  });

  it("returns serviceClient and userId on success", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "admin-456" } },
    });
    mockServiceFrom.mockReturnValue(
      chainMock({ data: { is_admin: true }, error: null })
    );

    const requireAdmin = await importHelper();
    const result = await requireAdmin();

    expect(result.error).toBeUndefined();
    expect(result.userId).toBe("admin-456");
    expect(result.serviceClient).toBeDefined();
    expect(result.serviceClient!.from).toBeDefined();
  });
});
