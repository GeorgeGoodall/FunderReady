import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetUser = vi.fn();
const mockRpc = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
  })),
  createServiceClient: vi.fn(() => ({
    rpc: mockRpc,
  })),
}));

function routeParams(id = "app-123") {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
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
    mockRpc.mockResolvedValue({ data: "not_found", error: null });
    const { POST } = await import("../route");
    const res = await POST(new Request("http://localhost"), routeParams());
    expect(res.status).toBe(404);
  });

  it("returns 409 when application is not in submitted_for_review status", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    mockRpc.mockResolvedValue({ data: "not_queued", error: null });
    const { POST } = await import("../route");
    const res = await POST(new Request("http://localhost"), routeParams());
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/not queued/i);
  });

  it("returns 200 and resets application on success", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    mockRpc.mockResolvedValue({ data: "ok", error: null });
    const { POST } = await import("../route");
    const res = await POST(new Request("http://localhost"), routeParams());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it("returns 500 when RPC errors", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    mockRpc.mockResolvedValue({ data: null, error: { message: "db error" } });
    const { POST } = await import("../route");
    const res = await POST(new Request("http://localhost"), routeParams());
    expect(res.status).toBe(500);
  });
});
