import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetUser = vi.fn();
const mockFrom = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  })),
}));

function routeParams(id = "app-123") {
  return { params: Promise.resolve({ id }) };
}

function chainMock(resolvedValue: unknown) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  chain.select = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.update = vi.fn(() => chain);
  chain.in = vi.fn(() => chain);
  chain.order = vi.fn(() => chain);
  chain.limit = vi.fn(() => chain);
  chain.single = vi.fn(() => Promise.resolve(resolvedValue));
  chain.then = undefined;
  // For update chains that don't call .single()
  Object.defineProperty(chain, "update", {
    value: vi.fn(() => {
      const updateChain = { eq: vi.fn(() => Promise.resolve(resolvedValue)) };
      return updateChain;
    }),
  });
  return chain;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/applications/[id]/cancel-review", () => {
  it("returns 401 for unauthenticated user", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const { POST } = await import("../route");
    const res = await POST(new Request("http://localhost"), routeParams());
    expect(res.status).toBe(401);
  });

  it("returns 404 when application not found", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    mockFrom.mockReturnValue(
      chainMock({ data: null, error: { message: "not found" } })
    );
    const { POST } = await import("../route");
    const res = await POST(new Request("http://localhost"), routeParams());
    expect(res.status).toBe(404);
  });

  it("returns 409 when application is not in submitted_for_review status", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // applications select
        return chainMock({ data: { id: "app-123", status: "draft" }, error: null });
      }
      return chainMock({ data: null, error: null });
    });
    const { POST } = await import("../route");
    const res = await POST(new Request("http://localhost"), routeParams());
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/not queued/i);
  });

  it("returns 200 and resets application on success", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    let callCount = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table === "applications") {
        callCount++;
        if (callCount === 1) {
          // Initial select
          return chainMock({
            data: { id: "app-123", status: "submitted_for_review" },
            error: null,
          });
        }
        // Update call
        return { update: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: null })) })) };
      }
      if (table === "application_reviews") {
        // Update call
        return { update: vi.fn(() => ({ eq: vi.fn(() => ({ in: vi.fn(() => Promise.resolve({ error: null })) })) })) };
      }
      return chainMock({ data: null, error: null });
    });
    const { POST } = await import("../route");
    const res = await POST(new Request("http://localhost"), routeParams());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });
});
