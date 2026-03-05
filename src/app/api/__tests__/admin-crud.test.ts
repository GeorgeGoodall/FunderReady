import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Shared mocking helpers
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
// Helper to build chained Supabase query mocks
// ---------------------------------------------------------------------------

function chainMock(resolvedValue: unknown) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  chain.select = vi.fn(() => chain);
  chain.insert = vi.fn(() => chain);
  chain.update = vi.fn(() => chain);
  chain.delete = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.single = vi.fn(() => Promise.resolve(resolvedValue));
  chain.maybeSingle = vi.fn(() => Promise.resolve(resolvedValue));
  chain.order = vi.fn(() => chain);
  chain.limit = vi.fn(() => Promise.resolve(resolvedValue));
  // Make chain directly awaitable (for queries without .single())
  chain.then = vi.fn((resolve: (v: unknown) => unknown) =>
    Promise.resolve(resolvedValue).then(resolve)
  );
  return chain;
}

function authenticatedUser(id = "user-123") {
  mockGetUser.mockResolvedValue({ data: { user: { id } } });
}

function unauthenticatedUser() {
  mockGetUser.mockResolvedValue({ data: { user: null } });
}

/** Sets up mockServiceFrom: first call returns admin profile, subsequent calls return given mock. */
function adminWith(subsequentMock: () => ReturnType<typeof chainMock>) {
  authenticatedUser();
  let callCount = 0;
  mockServiceFrom.mockImplementation(() => {
    callCount++;
    if (callCount === 1) {
      return chainMock({ data: { is_admin: true }, error: null });
    }
    return subsequentMock();
  });
}

/** Sets up mockServiceFrom for multiple subsequent calls after the admin profile check. */
function adminWithMultiple(
  mocks: Array<() => ReturnType<typeof chainMock>>
) {
  authenticatedUser();
  let callCount = 0;
  mockServiceFrom.mockImplementation(() => {
    callCount++;
    if (callCount === 1) {
      return chainMock({ data: { is_admin: true }, error: null });
    }
    const idx = callCount - 2;
    return mocks[idx < mocks.length ? idx : mocks.length - 1]();
  });
}

function jsonRequest(
  url: string,
  method: string,
  body?: unknown
): Request {
  return new Request(url, {
    method,
    headers: { "Content-Type": "application/json" },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

// =====================================================================
// REJECT ROUTES — Task 4
// =====================================================================

const rejectRoutes = [
  {
    name: "organisations",
    table: "organisations",
    path: "../../api/admin/organisations/[id]/reject/route",
  },
  {
    name: "funds",
    table: "funds",
    path: "../../api/admin/funds/[id]/reject/route",
  },
  {
    name: "criteria-sets",
    table: "criteria_sets",
    path: "../../api/admin/criteria-sets/[id]/reject/route",
  },
  {
    name: "questions-sets",
    table: "questions_sets",
    path: "../../api/admin/questions-sets/[id]/reject/route",
  },
];

for (const route of rejectRoutes) {
  describe(`PATCH /api/admin/${route.name}/[id]/reject`, () => {
    async function importRoute() {
      const mod = await import(route.path);
      return mod.PATCH;
    }

    const params = Promise.resolve({ id: "test-id-001" });

    it("returns 401 when not authenticated", async () => {
      unauthenticatedUser();
      const PATCH = await importRoute();
      const req = jsonRequest(
        `http://localhost/api/admin/${route.name}/test-id-001/reject`,
        "PATCH",
        { reason: "Not relevant" }
      );
      const res = await PATCH(req, { params });
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: "Unauthorized" });
    });

    it("returns 403 for non-admin users", async () => {
      authenticatedUser();
      mockServiceFrom.mockReturnValue(
        chainMock({ data: { is_admin: false }, error: null })
      );
      const PATCH = await importRoute();
      const req = jsonRequest(
        `http://localhost/api/admin/${route.name}/test-id-001/reject`,
        "PATCH",
        { reason: "Not relevant" }
      );
      const res = await PATCH(req, { params });
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: "Forbidden" });
    });

    it("returns 200 on successful rejection with reason", async () => {
      adminWith(() => chainMock({ data: null, error: null }));
      const PATCH = await importRoute();
      const req = jsonRequest(
        `http://localhost/api/admin/${route.name}/test-id-001/reject`,
        "PATCH",
        { reason: "Does not meet standards" }
      );
      const res = await PATCH(req, { params });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ success: true });
      expect(mockServiceFrom).toHaveBeenCalledWith("profiles");
      expect(mockServiceFrom).toHaveBeenCalledWith(route.table);
    });

    it("returns 200 on rejection without reason", async () => {
      adminWith(() => chainMock({ data: null, error: null }));
      const PATCH = await importRoute();
      // Send empty body — reason should be null
      const req = new Request(
        `http://localhost/api/admin/${route.name}/test-id-001/reject`,
        { method: "PATCH", body: "not-json" }
      );
      const res = await PATCH(req, { params });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ success: true });
    });

    it("returns 500 when database update fails", async () => {
      adminWith(() =>
        chainMock({ data: null, error: { message: "DB error" } })
      );
      const PATCH = await importRoute();
      const req = jsonRequest(
        `http://localhost/api/admin/${route.name}/test-id-001/reject`,
        "PATCH",
        { reason: "Bad" }
      );
      const res = await PATCH(req, { params });
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: "Failed to reject" });
    });
  });
}

// =====================================================================
// EDIT (PATCH) ROUTES — Task 5
// =====================================================================

describe("PATCH /api/admin/organisations/[id]", () => {
  async function importRoute() {
    const mod = await import("../../api/admin/organisations/[id]/route");
    return mod.PATCH;
  }

  const params = Promise.resolve({ id: "org-001" });

  it("returns 401 when not authenticated", async () => {
    unauthenticatedUser();
    const PATCH = await importRoute();
    const req = jsonRequest(
      "http://localhost/api/admin/organisations/org-001",
      "PATCH",
      { name: "New Name" }
    );
    const res = await PATCH(req, { params });
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin users", async () => {
    authenticatedUser();
    mockServiceFrom.mockReturnValue(
      chainMock({ data: { is_admin: false }, error: null })
    );
    const PATCH = await importRoute();
    const req = jsonRequest(
      "http://localhost/api/admin/organisations/org-001",
      "PATCH",
      { name: "New Name" }
    );
    const res = await PATCH(req, { params });
    expect(res.status).toBe(403);
  });

  it("returns 400 when no valid fields provided", async () => {
    adminWith(() => chainMock({ data: null, error: null }));
    const PATCH = await importRoute();
    const req = jsonRequest(
      "http://localhost/api/admin/organisations/org-001",
      "PATCH",
      { unknown_field: "value" }
    );
    const res = await PATCH(req, { params });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "No valid fields provided" });
  });

  it("returns 200 on successful update", async () => {
    adminWith(() => chainMock({ data: null, error: null }));
    const PATCH = await importRoute();
    const req = jsonRequest(
      "http://localhost/api/admin/organisations/org-001",
      "PATCH",
      { name: "Updated Org", url: "https://example.com" }
    );
    const res = await PATCH(req, { params });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    expect(mockServiceFrom).toHaveBeenCalledWith("organisations");
  });

  it("returns 500 when database update fails", async () => {
    adminWith(() =>
      chainMock({ data: null, error: { message: "DB error" } })
    );
    const PATCH = await importRoute();
    const req = jsonRequest(
      "http://localhost/api/admin/organisations/org-001",
      "PATCH",
      { name: "Test" }
    );
    const res = await PATCH(req, { params });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Failed to update" });
  });
});

describe("PATCH /api/admin/funds/[id]", () => {
  async function importRoute() {
    const mod = await import("../../api/admin/funds/[id]/route");
    return mod.PATCH;
  }

  const params = Promise.resolve({ id: "fund-001" });

  it("returns 401 when not authenticated", async () => {
    unauthenticatedUser();
    const PATCH = await importRoute();
    const req = jsonRequest(
      "http://localhost/api/admin/funds/fund-001",
      "PATCH",
      { name: "New Fund" }
    );
    const res = await PATCH(req, { params });
    expect(res.status).toBe(401);
  });

  it("returns 400 when no valid fields provided", async () => {
    adminWith(() => chainMock({ data: null, error: null }));
    const PATCH = await importRoute();
    const req = jsonRequest(
      "http://localhost/api/admin/funds/fund-001",
      "PATCH",
      { bad_field: "nope" }
    );
    const res = await PATCH(req, { params });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "No valid fields provided" });
  });

  it("returns 200 on successful update with allowed fields", async () => {
    adminWith(() => chainMock({ data: null, error: null }));
    const PATCH = await importRoute();
    const req = jsonRequest(
      "http://localhost/api/admin/funds/fund-001",
      "PATCH",
      { name: "Updated Fund", published: false, organisation_id: "org-002" }
    );
    const res = await PATCH(req, { params });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    expect(mockServiceFrom).toHaveBeenCalledWith("funds");
  });

  it("returns 500 when database update fails", async () => {
    adminWith(() =>
      chainMock({ data: null, error: { message: "DB error" } })
    );
    const PATCH = await importRoute();
    const req = jsonRequest(
      "http://localhost/api/admin/funds/fund-001",
      "PATCH",
      { name: "Test" }
    );
    const res = await PATCH(req, { params });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Failed to update" });
  });
});

// =====================================================================
// DELETE ROUTES — Task 6
// =====================================================================

describe("DELETE /api/admin/organisations/[id]", () => {
  async function importRoute() {
    const mod = await import("../../api/admin/organisations/[id]/route");
    return mod.DELETE;
  }

  const params = Promise.resolve({ id: "org-001" });

  it("returns 401 when not authenticated", async () => {
    unauthenticatedUser();
    const DELETE = await importRoute();
    const req = new Request(
      "http://localhost/api/admin/organisations/org-001",
      { method: "DELETE" }
    );
    const res = await DELETE(req, { params });
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin users", async () => {
    authenticatedUser();
    mockServiceFrom.mockReturnValue(
      chainMock({ data: { is_admin: false }, error: null })
    );
    const DELETE = await importRoute();
    const req = new Request(
      "http://localhost/api/admin/organisations/org-001",
      { method: "DELETE" }
    );
    const res = await DELETE(req, { params });
    expect(res.status).toBe(403);
  });

  it("returns 409 when organisation has funds", async () => {
    adminWith(() =>
      chainMock({ data: null, error: null, count: 3 })
    );
    const DELETE = await importRoute();
    const req = new Request(
      "http://localhost/api/admin/organisations/org-001",
      { method: "DELETE" }
    );
    const res = await DELETE(req, { params });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: "Cannot delete organisation with existing funds",
    });
  });

  it("returns 204 on successful deletion (no funds)", async () => {
    adminWithMultiple([
      // Fund count check — no funds
      () => chainMock({ data: null, error: null, count: 0 }),
      // Delete operation
      () => chainMock({ data: null, error: null }),
    ]);
    const DELETE = await importRoute();
    const req = new Request(
      "http://localhost/api/admin/organisations/org-001",
      { method: "DELETE" }
    );
    const res = await DELETE(req, { params });
    expect(res.status).toBe(204);
  });

  it("returns 500 when fund count check fails", async () => {
    adminWith(() =>
      chainMock({ data: null, error: { message: "DB error" }, count: null })
    );
    const DELETE = await importRoute();
    const req = new Request(
      "http://localhost/api/admin/organisations/org-001",
      { method: "DELETE" }
    );
    const res = await DELETE(req, { params });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({
      error: "Failed to check dependencies",
    });
  });

  it("returns 500 when delete operation fails", async () => {
    adminWithMultiple([
      // Fund count check — no funds
      () => chainMock({ data: null, error: null, count: 0 }),
      // Delete fails
      () => chainMock({ data: null, error: { message: "DB error" } }),
    ]);
    const DELETE = await importRoute();
    const req = new Request(
      "http://localhost/api/admin/organisations/org-001",
      { method: "DELETE" }
    );
    const res = await DELETE(req, { params });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Failed to delete" });
  });
});

describe("DELETE /api/admin/funds/[id]", () => {
  async function importRoute() {
    const mod = await import("../../api/admin/funds/[id]/route");
    return mod.DELETE;
  }

  const params = Promise.resolve({ id: "fund-001" });

  it("returns 401 when not authenticated", async () => {
    unauthenticatedUser();
    const DELETE = await importRoute();
    const req = new Request("http://localhost/api/admin/funds/fund-001", {
      method: "DELETE",
    });
    const res = await DELETE(req, { params });
    expect(res.status).toBe(401);
  });

  it("returns 204 on successful deletion", async () => {
    adminWith(() => chainMock({ data: null, error: null }));
    const DELETE = await importRoute();
    const req = new Request("http://localhost/api/admin/funds/fund-001", {
      method: "DELETE",
    });
    const res = await DELETE(req, { params });
    expect(res.status).toBe(204);
  });

  it("returns 500 when delete fails", async () => {
    adminWith(() =>
      chainMock({ data: null, error: { message: "DB error" } })
    );
    const DELETE = await importRoute();
    const req = new Request("http://localhost/api/admin/funds/fund-001", {
      method: "DELETE",
    });
    const res = await DELETE(req, { params });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Failed to delete" });
  });
});

describe("DELETE /api/admin/criteria-sets/[id]", () => {
  async function importRoute() {
    const mod = await import("../../api/admin/criteria-sets/[id]/route");
    return mod.DELETE;
  }

  const params = Promise.resolve({ id: "cs-001" });

  it("returns 401 when not authenticated", async () => {
    unauthenticatedUser();
    const DELETE = await importRoute();
    const req = new Request(
      "http://localhost/api/admin/criteria-sets/cs-001",
      { method: "DELETE" }
    );
    const res = await DELETE(req, { params });
    expect(res.status).toBe(401);
  });

  it("returns 204 on successful deletion", async () => {
    adminWith(() => chainMock({ data: null, error: null }));
    const DELETE = await importRoute();
    const req = new Request(
      "http://localhost/api/admin/criteria-sets/cs-001",
      { method: "DELETE" }
    );
    const res = await DELETE(req, { params });
    expect(res.status).toBe(204);
    expect(mockServiceFrom).toHaveBeenCalledWith("criteria_sets");
  });

  it("returns 500 when delete fails", async () => {
    adminWith(() =>
      chainMock({ data: null, error: { message: "DB error" } })
    );
    const DELETE = await importRoute();
    const req = new Request(
      "http://localhost/api/admin/criteria-sets/cs-001",
      { method: "DELETE" }
    );
    const res = await DELETE(req, { params });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Failed to delete" });
  });
});

describe("DELETE /api/admin/questions-sets/[id]", () => {
  async function importRoute() {
    const mod = await import("../../api/admin/questions-sets/[id]/route");
    return mod.DELETE;
  }

  const params = Promise.resolve({ id: "qs-001" });

  it("returns 401 when not authenticated", async () => {
    unauthenticatedUser();
    const DELETE = await importRoute();
    const req = new Request(
      "http://localhost/api/admin/questions-sets/qs-001",
      { method: "DELETE" }
    );
    const res = await DELETE(req, { params });
    expect(res.status).toBe(401);
  });

  it("returns 204 on successful deletion", async () => {
    adminWith(() => chainMock({ data: null, error: null }));
    const DELETE = await importRoute();
    const req = new Request(
      "http://localhost/api/admin/questions-sets/qs-001",
      { method: "DELETE" }
    );
    const res = await DELETE(req, { params });
    expect(res.status).toBe(204);
    expect(mockServiceFrom).toHaveBeenCalledWith("questions_sets");
  });

  it("returns 500 when delete fails", async () => {
    adminWith(() =>
      chainMock({ data: null, error: { message: "DB error" } })
    );
    const DELETE = await importRoute();
    const req = new Request(
      "http://localhost/api/admin/questions-sets/qs-001",
      { method: "DELETE" }
    );
    const res = await DELETE(req, { params });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Failed to delete" });
  });
});

// =====================================================================
// CREATE (POST) ROUTES — Task 7
// =====================================================================

describe("POST /api/admin/organisations", () => {
  async function importRoute() {
    const mod = await import("../../api/admin/organisations/route");
    return mod.POST;
  }

  it("returns 401 when not authenticated", async () => {
    unauthenticatedUser();
    const POST = await importRoute();
    const req = jsonRequest(
      "http://localhost/api/admin/organisations",
      "POST",
      { name: "Test Org" }
    );
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin users", async () => {
    authenticatedUser();
    mockServiceFrom.mockReturnValue(
      chainMock({ data: { is_admin: false }, error: null })
    );
    const POST = await importRoute();
    const req = jsonRequest(
      "http://localhost/api/admin/organisations",
      "POST",
      { name: "Test Org" }
    );
    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it("returns 400 when name is missing", async () => {
    adminWith(() => chainMock({ data: null, error: null }));
    const POST = await importRoute();
    const req = jsonRequest(
      "http://localhost/api/admin/organisations",
      "POST",
      { url: "https://example.com" }
    );
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "name is required" });
  });

  it("returns 400 when name is empty after trim", async () => {
    adminWith(() => chainMock({ data: null, error: null }));
    const POST = await importRoute();
    const req = jsonRequest(
      "http://localhost/api/admin/organisations",
      "POST",
      { name: "   " }
    );
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "name is required" });
  });

  it("returns 201 with created record on success", async () => {
    const createdRecord = {
      id: "org-new",
      name: "New Org",
      approved: true,
      created_by: "user-123",
    };
    adminWith(() =>
      chainMock({ data: createdRecord, error: null })
    );
    const POST = await importRoute();
    const req = jsonRequest(
      "http://localhost/api/admin/organisations",
      "POST",
      { name: "New Org", url: "https://example.com", description: "A desc" }
    );
    const res = await POST(req);
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual(createdRecord);
    expect(mockServiceFrom).toHaveBeenCalledWith("organisations");
  });

  it("returns 500 when database insert fails", async () => {
    adminWith(() =>
      chainMock({ data: null, error: { message: "DB error" } })
    );
    const POST = await importRoute();
    const req = jsonRequest(
      "http://localhost/api/admin/organisations",
      "POST",
      { name: "Test" }
    );
    const res = await POST(req);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Failed to create" });
  });
});

describe("POST /api/admin/funds", () => {
  async function importRoute() {
    const mod = await import("../../api/admin/funds/route");
    return mod.POST;
  }

  it("returns 401 when not authenticated", async () => {
    unauthenticatedUser();
    const POST = await importRoute();
    const req = jsonRequest("http://localhost/api/admin/funds", "POST", {
      name: "Fund",
      organisation_id: "org-001",
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 when name is missing", async () => {
    adminWith(() => chainMock({ data: null, error: null }));
    const POST = await importRoute();
    const req = jsonRequest("http://localhost/api/admin/funds", "POST", {
      organisation_id: "org-001",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "name is required" });
  });

  it("returns 400 when organisation_id is missing", async () => {
    adminWith(() => chainMock({ data: null, error: null }));
    const POST = await importRoute();
    const req = jsonRequest("http://localhost/api/admin/funds", "POST", {
      name: "Fund Name",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "organisation_id is required",
    });
  });

  it("returns 201 with created record on success", async () => {
    const createdRecord = {
      id: "fund-new",
      name: "New Fund",
      organisation_id: "org-001",
      published: true,
      created_by: "user-123",
    };
    adminWith(() =>
      chainMock({ data: createdRecord, error: null })
    );
    const POST = await importRoute();
    const req = jsonRequest("http://localhost/api/admin/funds", "POST", {
      name: "New Fund",
      organisation_id: "org-001",
      url: "https://fund.example.com",
      notes: "Some notes",
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual(createdRecord);
    expect(mockServiceFrom).toHaveBeenCalledWith("funds");
  });

  it("returns 500 when database insert fails", async () => {
    adminWith(() =>
      chainMock({ data: null, error: { message: "DB error" } })
    );
    const POST = await importRoute();
    const req = jsonRequest("http://localhost/api/admin/funds", "POST", {
      name: "Test",
      organisation_id: "org-001",
    });
    const res = await POST(req);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Failed to create" });
  });
});

describe("POST /api/admin/criteria-sets", () => {
  async function importRoute() {
    const mod = await import("../../api/admin/criteria-sets/route");
    return mod.POST;
  }

  it("returns 401 when not authenticated", async () => {
    unauthenticatedUser();
    const POST = await importRoute();
    const req = jsonRequest(
      "http://localhost/api/admin/criteria-sets",
      "POST",
      { fund_id: "f1", criteria_json: [], name: "Set 1" }
    );
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 when fund_id is missing", async () => {
    adminWith(() => chainMock({ data: null, error: null }));
    const POST = await importRoute();
    const req = jsonRequest(
      "http://localhost/api/admin/criteria-sets",
      "POST",
      { criteria_json: [], name: "Set 1" }
    );
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "fund_id is required" });
  });

  it("returns 400 when criteria_json is missing", async () => {
    adminWith(() => chainMock({ data: null, error: null }));
    const POST = await importRoute();
    const req = jsonRequest(
      "http://localhost/api/admin/criteria-sets",
      "POST",
      { fund_id: "f1", name: "Set 1" }
    );
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "criteria_json is required",
    });
  });

  it("returns 400 when name is missing", async () => {
    adminWith(() => chainMock({ data: null, error: null }));
    const POST = await importRoute();
    const req = jsonRequest(
      "http://localhost/api/admin/criteria-sets",
      "POST",
      { fund_id: "f1", criteria_json: [{ name: "c1" }] }
    );
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "name is required" });
  });

  it("returns 201 with created record on success", async () => {
    const createdRecord = {
      id: "cs-new",
      fund_id: "f1",
      criteria_json: [{ name: "c1" }],
      name: "Set 1",
      approved: true,
      created_by: "user-123",
    };
    adminWith(() =>
      chainMock({ data: createdRecord, error: null })
    );
    const POST = await importRoute();
    const req = jsonRequest(
      "http://localhost/api/admin/criteria-sets",
      "POST",
      {
        fund_id: "f1",
        criteria_json: [{ name: "c1" }],
        name: "Set 1",
        label: "v1",
        description: "First set",
      }
    );
    const res = await POST(req);
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual(createdRecord);
    expect(mockServiceFrom).toHaveBeenCalledWith("criteria_sets");
  });

  it("returns 500 when database insert fails", async () => {
    adminWith(() =>
      chainMock({ data: null, error: { message: "DB error" } })
    );
    const POST = await importRoute();
    const req = jsonRequest(
      "http://localhost/api/admin/criteria-sets",
      "POST",
      { fund_id: "f1", criteria_json: [], name: "Set 1" }
    );
    const res = await POST(req);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Failed to create" });
  });
});

describe("POST /api/admin/questions-sets", () => {
  async function importRoute() {
    const mod = await import("../../api/admin/questions-sets/route");
    return mod.POST;
  }

  it("returns 401 when not authenticated", async () => {
    unauthenticatedUser();
    const POST = await importRoute();
    const req = jsonRequest(
      "http://localhost/api/admin/questions-sets",
      "POST",
      { fund_id: "f1", questions_json: [] }
    );
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 when fund_id is missing", async () => {
    adminWith(() => chainMock({ data: null, error: null }));
    const POST = await importRoute();
    const req = jsonRequest(
      "http://localhost/api/admin/questions-sets",
      "POST",
      { questions_json: [] }
    );
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "fund_id is required" });
  });

  it("returns 400 when questions_json is missing", async () => {
    adminWith(() => chainMock({ data: null, error: null }));
    const POST = await importRoute();
    const req = jsonRequest(
      "http://localhost/api/admin/questions-sets",
      "POST",
      { fund_id: "f1" }
    );
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "questions_json is required",
    });
  });

  it("returns 201 with created record on success", async () => {
    const createdRecord = {
      id: "qs-new",
      fund_id: "f1",
      questions_json: [{ question: "Q1" }],
      approved: true,
      created_by: "user-123",
    };
    adminWith(() =>
      chainMock({ data: createdRecord, error: null })
    );
    const POST = await importRoute();
    const req = jsonRequest(
      "http://localhost/api/admin/questions-sets",
      "POST",
      {
        fund_id: "f1",
        questions_json: [{ question: "Q1" }],
        label: "v1",
        overall_word_limit: 5000,
      }
    );
    const res = await POST(req);
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual(createdRecord);
    expect(mockServiceFrom).toHaveBeenCalledWith("questions_sets");
  });

  it("returns 500 when database insert fails", async () => {
    adminWith(() =>
      chainMock({ data: null, error: { message: "DB error" } })
    );
    const POST = await importRoute();
    const req = jsonRequest(
      "http://localhost/api/admin/questions-sets",
      "POST",
      { fund_id: "f1", questions_json: [] }
    );
    const res = await POST(req);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Failed to create" });
  });
});
