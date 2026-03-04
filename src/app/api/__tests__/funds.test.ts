import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock Supabase
// ---------------------------------------------------------------------------

const mockGetUser = vi.fn();
const mockFrom = vi.fn();
const mockServiceFrom = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  })),
  createServiceClient: vi.fn(() => ({
    from: mockServiceFrom,
  })),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Chain mock — covers .single(), .maybeSingle(), .textSearch(), .in(), and
// direct await patterns
// ---------------------------------------------------------------------------

function chainMock(resolvedValue: unknown) {
  const resolved = Promise.resolve(resolvedValue);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: Record<string, any> = {};
  const returnChain = vi.fn(() => chain);
  chain.select = returnChain;
  chain.insert = returnChain;
  chain.update = returnChain;
  chain.delete = returnChain;
  chain.upsert = returnChain;
  chain.eq = returnChain;
  chain.or = returnChain;
  chain.in = returnChain;
  chain.order = returnChain;
  chain.limit = returnChain;
  chain.textSearch = returnChain;
  chain.single = vi.fn(() => resolved);
  chain.maybeSingle = vi.fn(() => resolved);
  // Make chain itself awaitable (covers patterns that don't end in .single())
  chain.then = (
    onfulfilled: Parameters<Promise<unknown>["then"]>[0],
    onrejected: Parameters<Promise<unknown>["then"]>[1]
  ) => resolved.then(onfulfilled, onrejected);
  return chain;
}

// Dispatch by table name — unrecognised tables return a no-op success
function tableDispatch(tableResponses: Record<string, unknown>) {
  return (table: string) =>
    chainMock(
      table in tableResponses
        ? tableResponses[table]
        : { data: null, error: null }
    );
}

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------

function authenticatedUser(id = "user-123") {
  mockGetUser.mockResolvedValue({ data: { user: { id } } });
}

function unauthenticatedUser() {
  mockGetUser.mockResolvedValue({ data: { user: null } });
}

// Route params helper (Next.js 16 async params)
function routeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

// ---------------------------------------------------------------------------
// Shared test data
// ---------------------------------------------------------------------------

const FUND_ID = "00000000-0000-0000-0000-000000000001";
const ORG_ID = "00000000-0000-0000-0000-000000000010";
const CRITERIA_SET_ID = "00000000-0000-0000-0000-000000000002";
const QUESTIONS_SET_ID = "00000000-0000-0000-0000-000000000003";

const sampleFund = {
  id: FUND_ID,
  name: "Community Innovation Fund",
  organisation_id: ORG_ID,
  organisations: { id: ORG_ID, name: "Arts Council" },
  url: "https://example.com/fund",
  notes: "For community projects",
  created_at: "2026-01-15T10:00:00Z",
};

const sampleFundDetailed = {
  id: FUND_ID,
  name: "Community Innovation Fund",
  organisation_id: ORG_ID,
  organisations: {
    id: ORG_ID,
    name: "Arts Council",
    url: "https://artscouncil.org",
    description: "National funder",
  },
  url: "https://example.com/fund",
  notes: "For community projects",
  created_by: "user-123",
  created_at: "2026-01-15T10:00:00Z",
};

// =========================================================================
// GET /api/funds (search)
// =========================================================================

describe("GET /api/funds", () => {
  async function importRoute() {
    const mod = await import("../../api/funds/route");
    return mod.GET;
  }

  it("returns 401 when not authenticated", async () => {
    unauthenticatedUser();
    const GET = await importRoute();
    const res = await GET(
      new Request("http://localhost/api/funds?q=community")
    );
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("returns empty funds array when query is missing", async () => {
    authenticatedUser();
    const GET = await importRoute();
    const res = await GET(new Request("http://localhost/api/funds"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ funds: [] });
  });

  it("returns empty funds array when query is too short (less than 2 chars)", async () => {
    authenticatedUser();
    const GET = await importRoute();
    const res = await GET(new Request("http://localhost/api/funds?q=a"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ funds: [] });
  });

  it("returns empty funds array when query is only whitespace", async () => {
    authenticatedUser();
    const GET = await importRoute();
    const res = await GET(
      new Request("http://localhost/api/funds?q=%20%20")
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ funds: [] });
  });

  it("returns 500 when name search fails", async () => {
    authenticatedUser();
    // First call to .from("funds") for name search returns error
    // Second call to .from("organisations") should not matter
    mockFrom.mockImplementation(() =>
      chainMock({ data: null, error: { message: "search failed" } })
    );
    const GET = await importRoute();
    const res = await GET(
      new Request("http://localhost/api/funds?q=community")
    );
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Search failed" });
  });

  it("returns funds matching by name (no org matches)", async () => {
    authenticatedUser();
    const callIndex = { count: 0 };
    mockFrom.mockImplementation((table: string) => {
      if (table === "funds") {
        callIndex.count++;
        if (callIndex.count === 1) {
          // First funds query: textSearch by name
          return chainMock({ data: [sampleFund], error: null });
        }
        // Second funds query (for org-matched funds) — won't be called if no matching orgs
        return chainMock({ data: [], error: null });
      }
      if (table === "organisations") {
        return chainMock({ data: [], error: null });
      }
      return chainMock({ data: null, error: null });
    });
    const GET = await importRoute();
    const res = await GET(
      new Request("http://localhost/api/funds?q=community")
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.funds).toHaveLength(1);
    expect(body.funds[0]).toMatchObject({
      id: FUND_ID,
      name: "Community Innovation Fund",
    });
  });

  it("returns funds matching by organisation name", async () => {
    authenticatedUser();
    const fundsCallIndex = { count: 0 };
    mockFrom.mockImplementation((table: string) => {
      if (table === "funds") {
        fundsCallIndex.count++;
        if (fundsCallIndex.count === 1) {
          // First funds query: textSearch by name — no match
          return chainMock({ data: [], error: null });
        }
        // Second funds query: funds by org
        return chainMock({ data: [sampleFund], error: null });
      }
      if (table === "organisations") {
        return chainMock({ data: [{ id: ORG_ID }], error: null });
      }
      return chainMock({ data: null, error: null });
    });
    const GET = await importRoute();
    const res = await GET(
      new Request("http://localhost/api/funds?q=arts+council")
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.funds).toHaveLength(1);
    expect(body.funds[0]).toMatchObject({ id: FUND_ID });
  });

  it("deduplicates funds found by both name and org search", async () => {
    authenticatedUser();
    const fundsCallIndex = { count: 0 };
    mockFrom.mockImplementation((table: string) => {
      if (table === "funds") {
        fundsCallIndex.count++;
        if (fundsCallIndex.count === 1) {
          // Name search returns the fund
          return chainMock({ data: [sampleFund], error: null });
        }
        // Org search also returns the same fund
        return chainMock({ data: [sampleFund], error: null });
      }
      if (table === "organisations") {
        return chainMock({ data: [{ id: ORG_ID }], error: null });
      }
      return chainMock({ data: null, error: null });
    });
    const GET = await importRoute();
    const res = await GET(
      new Request("http://localhost/api/funds?q=community")
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    // Should be deduplicated to 1 result
    expect(body.funds).toHaveLength(1);
  });

  it("limits results to 10", async () => {
    authenticatedUser();
    const manyFunds = Array.from({ length: 12 }, (_, i) => ({
      ...sampleFund,
      id: `fund-${i}`,
      name: `Fund ${i}`,
      created_at: new Date(2026, 0, 15 - i).toISOString(),
    }));
    mockFrom.mockImplementation((table: string) => {
      if (table === "funds") {
        return chainMock({ data: manyFunds, error: null });
      }
      if (table === "organisations") {
        return chainMock({ data: [], error: null });
      }
      return chainMock({ data: null, error: null });
    });
    const GET = await importRoute();
    const res = await GET(
      new Request("http://localhost/api/funds?q=fund")
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.funds.length).toBeLessThanOrEqual(10);
  });
});

// =========================================================================
// POST /api/funds (create fund)
// =========================================================================

describe("POST /api/funds", () => {
  async function importRoute() {
    const mod = await import("../../api/funds/route");
    return mod.POST;
  }

  const validBody = {
    name: "New Community Fund",
    organisation_id: ORG_ID,
    url: "https://example.com/new-fund",
    notes: "Test notes",
  };

  it("returns 401 when not authenticated", async () => {
    unauthenticatedUser();
    const POST = await importRoute();
    const res = await POST(
      new Request("http://localhost/api/funds", {
        method: "POST",
        body: JSON.stringify(validBody),
      })
    );
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("returns 400 for invalid JSON body", async () => {
    authenticatedUser();
    const POST = await importRoute();
    const res = await POST(
      new Request("http://localhost/api/funds", {
        method: "POST",
        body: "not json",
      })
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid JSON" });
  });

  it("returns 400 when name is missing", async () => {
    authenticatedUser();
    const POST = await importRoute();
    const res = await POST(
      new Request("http://localhost/api/funds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organisation_id: ORG_ID }),
      })
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when name is empty string", async () => {
    authenticatedUser();
    const POST = await importRoute();
    const res = await POST(
      new Request("http://localhost/api/funds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "" }),
      })
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when organisation_id is not a valid UUID", async () => {
    authenticatedUser();
    const POST = await importRoute();
    const res = await POST(
      new Request("http://localhost/api/funds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Test Fund", organisation_id: "not-a-uuid" }),
      })
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when url is not a valid URL", async () => {
    authenticatedUser();
    const POST = await importRoute();
    const res = await POST(
      new Request("http://localhost/api/funds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Test Fund", url: "not-a-url" }),
      })
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when organisation does not exist", async () => {
    authenticatedUser();
    mockServiceFrom.mockImplementation(
      tableDispatch({
        organisations: { data: null, error: null },
      })
    );
    const POST = await importRoute();
    const res = await POST(
      new Request("http://localhost/api/funds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validBody),
      })
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Organisation not found" });
  });

  it("returns 500 when fund insert fails", async () => {
    authenticatedUser();
    mockServiceFrom.mockImplementation(
      tableDispatch({
        organisations: { data: { id: ORG_ID }, error: null },
      })
    );
    mockFrom.mockImplementation(
      tableDispatch({
        funds: { data: null, error: { message: "unique constraint violation" } },
      })
    );
    const POST = await importRoute();
    const res = await POST(
      new Request("http://localhost/api/funds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validBody),
      })
    );
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Failed to create fund" });
  });

  it("returns 201 with created fund on success", async () => {
    authenticatedUser();
    const createdFund = {
      id: FUND_ID,
      name: validBody.name,
      organisation_id: ORG_ID,
      organisations: { id: ORG_ID, name: "Arts Council" },
      url: validBody.url,
      notes: validBody.notes,
      created_at: "2026-02-01T10:00:00Z",
    };
    mockServiceFrom.mockImplementation(
      tableDispatch({
        organisations: { data: { id: ORG_ID }, error: null },
      })
    );
    mockFrom.mockImplementation(
      tableDispatch({
        funds: { data: createdFund, error: null },
      })
    );
    const POST = await importRoute();
    const res = await POST(
      new Request("http://localhost/api/funds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validBody),
      })
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.fund).toMatchObject({
      id: FUND_ID,
      name: validBody.name,
      organisation_id: ORG_ID,
    });
  });

  it("returns 201 without organisation_id (optional field)", async () => {
    authenticatedUser();
    const createdFund = {
      id: FUND_ID,
      name: "Standalone Fund",
      organisation_id: null,
      organisations: null,
      url: null,
      notes: null,
      created_at: "2026-02-01T10:00:00Z",
    };
    mockFrom.mockImplementation(
      tableDispatch({
        funds: { data: createdFund, error: null },
      })
    );
    const POST = await importRoute();
    const res = await POST(
      new Request("http://localhost/api/funds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Standalone Fund" }),
      })
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.fund).toMatchObject({
      name: "Standalone Fund",
      organisation_id: null,
    });
    // Should NOT have called serviceClient since no organisation_id
    expect(mockServiceFrom).not.toHaveBeenCalled();
  });
});

// =========================================================================
// GET /api/funds/[id]
// =========================================================================

describe("GET /api/funds/[id]", () => {
  async function importRoute() {
    const mod = await import("../../api/funds/[id]/route");
    return mod.GET;
  }

  it("returns 401 when not authenticated", async () => {
    unauthenticatedUser();
    const GET = await importRoute();
    const res = await GET(new Request("http://localhost"), routeParams(FUND_ID));
    expect(res.status).toBe(401);
  });

  it("returns 404 when fund is not found", async () => {
    authenticatedUser();
    mockFrom.mockImplementation(
      tableDispatch({
        funds: { data: null, error: { message: "not found" } },
      })
    );
    const GET = await importRoute();
    const res = await GET(new Request("http://localhost"), routeParams(FUND_ID));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Fund not found" });
  });

  it("returns 200 with fund, criteria sets, and questions sets", async () => {
    authenticatedUser();
    const approvedCriteria = {
      id: CRITERIA_SET_ID,
      label: "v1",
      name: "Criteria v1",
      description: "Main criteria",
      criteria_json: [{ id: "c1", criterion: "Quality" }],
      approved: true,
      created_by: "other-user",
      created_at: "2026-01-10",
    };
    const userDraftCriteria = {
      id: "draft-criteria-id",
      label: "v2",
      name: "My Draft Criteria",
      description: "Draft",
      criteria_json: [{ id: "c2", criterion: "Impact" }],
      approved: false,
      created_by: "user-123",
      created_at: "2026-02-01",
    };
    const approvedQuestions = {
      id: QUESTIONS_SET_ID,
      label: "v1",
      questions_json: [{ id: "q1", question: "Describe your project" }],
      overall_word_limit: 5000,
      approved: true,
      created_by: "other-user",
      created_at: "2026-01-10",
    };
    const userDraftQuestions = {
      id: "draft-questions-id",
      label: "v2",
      questions_json: [{ id: "q2", question: "Budget breakdown" }],
      overall_word_limit: 3000,
      approved: false,
      created_by: "user-123",
      created_at: "2026-02-01",
    };

    // The route makes 5 calls to mockFrom:
    // 1. from("funds").select(...).eq("id", id).single()
    // 2. from("criteria_sets").select(...).eq("fund_id", id).eq("approved", true).order(...).limit(1).maybeSingle()
    // 3. from("criteria_sets").select(...).eq("fund_id", id).eq("created_by", user.id).eq("approved", false).order(...).limit(1).maybeSingle()
    // 4. from("questions_sets") — approved
    // 5. from("questions_sets") — user draft
    const callIndex = { funds: 0, criteria_sets: 0, questions_sets: 0 };
    mockFrom.mockImplementation((table: string) => {
      if (table === "funds") {
        return chainMock({ data: sampleFundDetailed, error: null });
      }
      if (table === "criteria_sets") {
        callIndex.criteria_sets++;
        if (callIndex.criteria_sets === 1) {
          return chainMock({ data: approvedCriteria, error: null });
        }
        return chainMock({ data: userDraftCriteria, error: null });
      }
      if (table === "questions_sets") {
        callIndex.questions_sets++;
        if (callIndex.questions_sets === 1) {
          return chainMock({ data: approvedQuestions, error: null });
        }
        return chainMock({ data: userDraftQuestions, error: null });
      }
      return chainMock({ data: null, error: null });
    });

    const GET = await importRoute();
    const res = await GET(new Request("http://localhost"), routeParams(FUND_ID));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.fund).toMatchObject({
      id: FUND_ID,
      name: "Community Innovation Fund",
    });
    expect(body.criteriaSet).toMatchObject({
      id: CRITERIA_SET_ID,
      approved: true,
    });
    expect(body.userDraftCriteriaSet).toMatchObject({
      id: "draft-criteria-id",
      approved: false,
      created_by: "user-123",
    });
    expect(body.questionsSet).toMatchObject({
      id: QUESTIONS_SET_ID,
      approved: true,
    });
    expect(body.userDraftQuestionsSet).toMatchObject({
      id: "draft-questions-id",
      approved: false,
      created_by: "user-123",
    });
  });

  it("returns null for criteria/questions sets when none exist", async () => {
    authenticatedUser();
    mockFrom.mockImplementation((table: string) => {
      if (table === "funds") {
        return chainMock({ data: sampleFundDetailed, error: null });
      }
      // All other queries return null (no sets found)
      return chainMock({ data: null, error: null });
    });

    const GET = await importRoute();
    const res = await GET(new Request("http://localhost"), routeParams(FUND_ID));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.fund).toBeTruthy();
    expect(body.criteriaSet).toBeNull();
    expect(body.userDraftCriteriaSet).toBeNull();
    expect(body.questionsSet).toBeNull();
    expect(body.userDraftQuestionsSet).toBeNull();
  });
});

// =========================================================================
// DELETE /api/funds/[id]
// =========================================================================

describe("DELETE /api/funds/[id]", () => {
  async function importRoute() {
    const mod = await import("../../api/funds/[id]/route");
    return mod.DELETE;
  }

  it("returns 401 when not authenticated", async () => {
    unauthenticatedUser();
    const DELETE = await importRoute();
    const res = await DELETE(new Request("http://localhost"), routeParams(FUND_ID));
    expect(res.status).toBe(401);
  });

  it("returns 404 when fund is not found or user does not own it", async () => {
    authenticatedUser();
    const callIndex = { count: 0 };
    mockFrom.mockImplementation((table: string) => {
      if (table === "funds") {
        callIndex.count++;
        if (callIndex.count === 1) {
          // First call: select to verify ownership — not found
          return chainMock({ data: null, error: null });
        }
        return chainMock({ data: null, error: null });
      }
      return chainMock({ data: null, error: null });
    });
    const DELETE = await importRoute();
    const res = await DELETE(new Request("http://localhost"), routeParams(FUND_ID));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Fund not found" });
  });

  it("returns 500 when update fails", async () => {
    authenticatedUser();
    const callIndex = { count: 0 };
    mockFrom.mockImplementation((table: string) => {
      if (table === "funds") {
        callIndex.count++;
        if (callIndex.count === 1) {
          // First call: select to verify ownership — found
          return chainMock({ data: { id: FUND_ID, created_by: "user-123" }, error: null });
        }
        // Second call: update — fails
        return chainMock({ data: null, error: { message: "update failed" } });
      }
      return chainMock({ data: null, error: null });
    });
    const DELETE = await importRoute();
    const res = await DELETE(new Request("http://localhost"), routeParams(FUND_ID));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Failed to remove fund" });
  });

  it("returns 204 on successful deletion (soft delete via creator_hidden)", async () => {
    authenticatedUser();
    const callIndex = { count: 0 };
    mockFrom.mockImplementation((table: string) => {
      if (table === "funds") {
        callIndex.count++;
        if (callIndex.count === 1) {
          // First call: select to verify ownership
          return chainMock({ data: { id: FUND_ID, created_by: "user-123" }, error: null });
        }
        // Second call: update creator_hidden
        return chainMock({ data: null, error: null });
      }
      return chainMock({ data: null, error: null });
    });
    const DELETE = await importRoute();
    const res = await DELETE(new Request("http://localhost"), routeParams(FUND_ID));
    expect(res.status).toBe(204);
  });
});

// =========================================================================
// GET /api/funds/my
// =========================================================================

describe("GET /api/funds/my", () => {
  async function importRoute() {
    const mod = await import("../../api/funds/my/route");
    return mod.GET;
  }

  it("returns 401 when not authenticated", async () => {
    unauthenticatedUser();
    const GET = await importRoute();
    const res = await GET();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("returns empty funds array when user has no funds", async () => {
    authenticatedUser();
    mockFrom.mockImplementation(
      tableDispatch({
        funds: { data: [], error: null },
      })
    );
    const GET = await importRoute();
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ funds: [] });
  });

  it("returns 500 when database query fails", async () => {
    authenticatedUser();
    mockFrom.mockImplementation(
      tableDispatch({
        funds: { data: null, error: { message: "connection failed" } },
      })
    );
    const GET = await importRoute();
    const res = await GET();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Failed to fetch funds" });
  });

  it("returns user funds on success", async () => {
    authenticatedUser();
    const userFunds = [
      {
        id: FUND_ID,
        name: "Community Innovation Fund",
        organisation_id: ORG_ID,
        organisations: { id: ORG_ID, name: "Arts Council" },
        url: "https://example.com/fund",
        notes: "For community projects",
        published: true,
        created_at: "2026-01-15T10:00:00Z",
      },
      {
        id: "fund-2",
        name: "Youth Development Grant",
        organisation_id: null,
        organisations: null,
        url: null,
        notes: null,
        published: false,
        created_at: "2026-01-10T10:00:00Z",
      },
    ];
    mockFrom.mockImplementation(
      tableDispatch({
        funds: { data: userFunds, error: null },
      })
    );
    const GET = await importRoute();
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.funds).toHaveLength(2);
    expect(body.funds[0]).toMatchObject({
      id: FUND_ID,
      name: "Community Innovation Fund",
    });
    expect(body.funds[1]).toMatchObject({
      id: "fund-2",
      name: "Youth Development Grant",
    });
  });

  it("returns empty array when data is null", async () => {
    authenticatedUser();
    mockFrom.mockImplementation(
      tableDispatch({
        funds: { data: null, error: null },
      })
    );
    const GET = await importRoute();
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ funds: [] });
  });
});

// =========================================================================
// POST /api/funds/[id]/criteria-sets
// =========================================================================

describe("POST /api/funds/[id]/criteria-sets", () => {
  async function importRoute() {
    const mod = await import("../../api/funds/[id]/criteria-sets/route");
    return mod.POST;
  }

  const validBody = {
    name: "Criteria v1",
    description: "Main criteria",
    criteria: [{ id: "c1", criterion: "Quality", weight: "30%", sub_questions: [] }],
  };

  it("returns 401 when not authenticated", async () => {
    unauthenticatedUser();
    const POST = await importRoute();
    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify(validBody),
      }),
      routeParams(FUND_ID)
    );
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("returns 400 for invalid JSON body", async () => {
    authenticatedUser();
    const POST = await importRoute();
    const res = await POST(
      new Request("http://localhost", { method: "POST", body: "not json" }),
      routeParams(FUND_ID)
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid JSON" });
  });

  it("returns 400 when schema validation fails (empty criteria array)", async () => {
    authenticatedUser();
    const POST = await importRoute();
    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Test", criteria: [] }),
      }),
      routeParams(FUND_ID)
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 when fund not found", async () => {
    authenticatedUser();
    mockFrom.mockImplementation(
      tableDispatch({ funds: { data: null, error: null } })
    );
    const POST = await importRoute();
    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validBody),
      }),
      routeParams(FUND_ID)
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Fund not found" });
  });

  it("returns 201 auto-approved when first set (count=0)", async () => {
    authenticatedUser();
    const createdSet = {
      id: CRITERIA_SET_ID,
      name: "Criteria v1",
      description: "Main criteria",
      criteria_json: validBody.criteria,
      approved: true,
      created_at: "2026-02-01",
    };
    const callIndex = { funds: 0, criteria_sets: 0 };
    mockFrom.mockImplementation((table: string) => {
      if (table === "funds") {
        return chainMock({ data: { id: FUND_ID }, error: null });
      }
      if (table === "criteria_sets") {
        callIndex.criteria_sets++;
        if (callIndex.criteria_sets === 1) {
          // Count query
          return chainMock({ count: 0, data: null, error: null });
        }
        // Insert query
        return chainMock({ data: createdSet, error: null });
      }
      return chainMock({ data: null, error: null });
    });
    const POST = await importRoute();
    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validBody),
      }),
      routeParams(FUND_ID)
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.criteriaSet).toMatchObject({ id: CRITERIA_SET_ID, approved: true });
  });

  it("returns 201 not auto-approved when subsequent set (count>0)", async () => {
    authenticatedUser();
    const createdSet = {
      id: "new-cs-id",
      name: "Criteria v2",
      description: null,
      criteria_json: validBody.criteria,
      approved: false,
      created_at: "2026-02-15",
    };
    const callIndex = { criteria_sets: 0 };
    mockFrom.mockImplementation((table: string) => {
      if (table === "funds") {
        return chainMock({ data: { id: FUND_ID }, error: null });
      }
      if (table === "criteria_sets") {
        callIndex.criteria_sets++;
        if (callIndex.criteria_sets === 1) {
          return chainMock({ count: 2, data: null, error: null });
        }
        return chainMock({ data: createdSet, error: null });
      }
      return chainMock({ data: null, error: null });
    });
    const POST = await importRoute();
    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validBody),
      }),
      routeParams(FUND_ID)
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.criteriaSet).toMatchObject({ approved: false });
  });

  it("returns 500 when insert fails", async () => {
    authenticatedUser();
    const callIndex = { criteria_sets: 0 };
    mockFrom.mockImplementation((table: string) => {
      if (table === "funds") {
        return chainMock({ data: { id: FUND_ID }, error: null });
      }
      if (table === "criteria_sets") {
        callIndex.criteria_sets++;
        if (callIndex.criteria_sets === 1) {
          return chainMock({ count: 0, data: null, error: null });
        }
        return chainMock({ data: null, error: { message: "insert failed" } });
      }
      return chainMock({ data: null, error: null });
    });
    const POST = await importRoute();
    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validBody),
      }),
      routeParams(FUND_ID)
    );
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Failed to create criteria set" });
  });
});

// =========================================================================
// POST /api/funds/[id]/questions-sets
// =========================================================================

describe("POST /api/funds/[id]/questions-sets", () => {
  async function importRoute() {
    const mod = await import("../../api/funds/[id]/questions-sets/route");
    return mod.POST;
  }

  const validBody = {
    questions: [{ id: "q1", question: "Describe your project", word_count_max: 500 }],
    overall_word_limit: 5000,
  };

  it("returns 401 when not authenticated", async () => {
    unauthenticatedUser();
    const POST = await importRoute();
    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify(validBody),
      }),
      routeParams(FUND_ID)
    );
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("returns 400 for invalid JSON body", async () => {
    authenticatedUser();
    const POST = await importRoute();
    const res = await POST(
      new Request("http://localhost", { method: "POST", body: "not json" }),
      routeParams(FUND_ID)
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid JSON" });
  });

  it("returns 400 when schema validation fails (empty questions array)", async () => {
    authenticatedUser();
    const POST = await importRoute();
    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questions: [] }),
      }),
      routeParams(FUND_ID)
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 when fund not found", async () => {
    authenticatedUser();
    mockFrom.mockImplementation(
      tableDispatch({ funds: { data: null, error: null } })
    );
    const POST = await importRoute();
    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validBody),
      }),
      routeParams(FUND_ID)
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Fund not found" });
  });

  it("returns 201 auto-approved when first set (count=0)", async () => {
    authenticatedUser();
    const createdSet = {
      id: QUESTIONS_SET_ID,
      questions_json: validBody.questions,
      overall_word_limit: 5000,
      approved: true,
      created_at: "2026-02-01",
    };
    const callIndex = { questions_sets: 0 };
    mockFrom.mockImplementation((table: string) => {
      if (table === "funds") {
        return chainMock({ data: { id: FUND_ID }, error: null });
      }
      if (table === "questions_sets") {
        callIndex.questions_sets++;
        if (callIndex.questions_sets === 1) {
          return chainMock({ count: 0, data: null, error: null });
        }
        return chainMock({ data: createdSet, error: null });
      }
      return chainMock({ data: null, error: null });
    });
    const POST = await importRoute();
    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validBody),
      }),
      routeParams(FUND_ID)
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.questionsSet).toMatchObject({ id: QUESTIONS_SET_ID, approved: true });
  });

  it("returns 201 not auto-approved when subsequent set (count>0)", async () => {
    authenticatedUser();
    const createdSet = {
      id: "new-qs-id",
      questions_json: validBody.questions,
      overall_word_limit: 5000,
      approved: false,
      created_at: "2026-02-15",
    };
    const callIndex = { questions_sets: 0 };
    mockFrom.mockImplementation((table: string) => {
      if (table === "funds") {
        return chainMock({ data: { id: FUND_ID }, error: null });
      }
      if (table === "questions_sets") {
        callIndex.questions_sets++;
        if (callIndex.questions_sets === 1) {
          return chainMock({ count: 3, data: null, error: null });
        }
        return chainMock({ data: createdSet, error: null });
      }
      return chainMock({ data: null, error: null });
    });
    const POST = await importRoute();
    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validBody),
      }),
      routeParams(FUND_ID)
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.questionsSet).toMatchObject({ approved: false });
  });

  it("returns 500 when insert fails", async () => {
    authenticatedUser();
    const callIndex = { questions_sets: 0 };
    mockFrom.mockImplementation((table: string) => {
      if (table === "funds") {
        return chainMock({ data: { id: FUND_ID }, error: null });
      }
      if (table === "questions_sets") {
        callIndex.questions_sets++;
        if (callIndex.questions_sets === 1) {
          return chainMock({ count: 0, data: null, error: null });
        }
        return chainMock({ data: null, error: { message: "insert failed" } });
      }
      return chainMock({ data: null, error: null });
    });
    const POST = await importRoute();
    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validBody),
      }),
      routeParams(FUND_ID)
    );
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Failed to create questions set" });
  });
});
