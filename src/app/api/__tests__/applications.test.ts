import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock Supabase
// ---------------------------------------------------------------------------

const mockGetUser = vi.fn();
const mockFrom = vi.fn();
const mockServiceFrom = vi.fn();
const mockServiceRpc = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  })),
  createServiceClient: vi.fn(() => ({
    from: mockServiceFrom,
    rpc: mockServiceRpc,
  })),
}));

// Mock Inngest
const mockInngestSend = vi.fn();
vi.mock("@/lib/inngest/client", () => ({
  inngest: { send: mockInngestSend },
}));

// Mock usage period
vi.mock("@/lib/usage/period", () => ({
  getUsagePeriod: vi.fn(() => ({ periodKey: "2026-02" })),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Chain mock — covers both .single() and direct await patterns
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
  chain.order = returnChain;
  chain.limit = returnChain;
  chain.single = vi.fn(() => resolved);
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
const CRITERIA_SET_ID = "00000000-0000-0000-0000-000000000002";
const QUESTIONS_SET_ID = "00000000-0000-0000-0000-000000000003";
const APP_ID = "app-00000000-0000-0000-0000-000000000001";

// =========================================================================
// POST /api/applications
// =========================================================================

describe("POST /api/applications", () => {
  async function importRoute() {
    const mod = await import("../../api/applications/route");
    return mod.POST;
  }

  const validBody = {
    fundId: FUND_ID,
    criteriaSetId: CRITERIA_SET_ID,
    questionsSetId: QUESTIONS_SET_ID,
    title: "My Grant Application",
  };

  const validServiceMocks = {
    funds: { data: { id: FUND_ID, application_format: "question_form" }, error: null },
    criteria_sets: { data: { id: CRITERIA_SET_ID, fund_id: FUND_ID }, error: null },
    questions_sets: {
      data: {
        id: QUESTIONS_SET_ID,
        fund_id: FUND_ID,
        questions_json: [{ id: "q1", field_type: "text_long" }],
      },
      error: null,
    },
    application_answers: { data: null, error: null },
  };

  it("returns 401 when not authenticated", async () => {
    unauthenticatedUser();
    const POST = await importRoute();
    const res = await POST(
      new Request("http://localhost/api/applications", {
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
      new Request("http://localhost/api/applications", {
        method: "POST",
        body: "not json",
      })
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for missing required fields (no criteriaSetId)", async () => {
    authenticatedUser();
    const POST = await importRoute();
    const res = await POST(
      new Request("http://localhost/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fundId: FUND_ID }),
      })
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 if criteria set does not belong to fund", async () => {
    authenticatedUser();
    mockServiceFrom.mockImplementation(
      tableDispatch({
        funds: validServiceMocks.funds,
        criteria_sets: {
          data: { id: CRITERIA_SET_ID, fund_id: "wrong-fund-id" },
          error: null,
        },
        questions_sets: validServiceMocks.questions_sets,
      })
    );
    const POST = await importRoute();
    const res = await POST(
      new Request("http://localhost/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validBody),
      })
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("criteria set");
  });

  it("returns 400 if criteria set is not found", async () => {
    authenticatedUser();
    mockServiceFrom.mockImplementation(
      tableDispatch({
        funds: validServiceMocks.funds,
        criteria_sets: { data: null, error: null },
        questions_sets: validServiceMocks.questions_sets,
      })
    );
    const POST = await importRoute();
    const res = await POST(
      new Request("http://localhost/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validBody),
      })
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 if questions set does not belong to fund", async () => {
    authenticatedUser();
    mockServiceFrom.mockImplementation(
      tableDispatch({
        funds: validServiceMocks.funds,
        criteria_sets: validServiceMocks.criteria_sets,
        questions_sets: {
          data: { id: QUESTIONS_SET_ID, fund_id: "wrong-fund-id", questions_json: [] },
          error: null,
        },
      })
    );
    const POST = await importRoute();
    const res = await POST(
      new Request("http://localhost/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validBody),
      })
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("questions set");
  });

  it("returns 500 if application insert fails", async () => {
    authenticatedUser();
    mockServiceFrom.mockImplementation(tableDispatch(validServiceMocks));
    mockFrom.mockImplementation(
      tableDispatch({
        applications: { data: null, error: { message: "unique constraint violation" } },
      })
    );
    const POST = await importRoute();
    const res = await POST(
      new Request("http://localhost/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validBody),
      })
    );
    expect(res.status).toBe(500);
    expect((await res.json()).error).toContain("Failed to create application");
  });

  it("returns 201 with applicationId on success", async () => {
    authenticatedUser();
    mockServiceFrom.mockImplementation(tableDispatch(validServiceMocks));
    mockFrom.mockImplementation(
      tableDispatch({
        applications: { data: { id: APP_ID }, error: null },
      })
    );
    const POST = await importRoute();
    const res = await POST(
      new Request("http://localhost/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validBody),
      })
    );
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ applicationId: APP_ID });
  });

  it("pre-populates answers when questions_json is non-empty", async () => {
    authenticatedUser();
    const insertSpy = vi.fn(() => chainMock({ data: null, error: null }));
    mockServiceFrom.mockImplementation((table: string) => {
      if (table === "funds") return chainMock(validServiceMocks.funds);
      if (table === "criteria_sets") return chainMock(validServiceMocks.criteria_sets);
      if (table === "questions_sets") return chainMock(validServiceMocks.questions_sets);
      if (table === "application_answers") {
        const chain = chainMock({ data: null, error: null });
        chain.insert = insertSpy;
        return chain;
      }
      return chainMock({ data: null, error: null });
    });
    mockFrom.mockImplementation(
      tableDispatch({
        applications: { data: { id: APP_ID }, error: null },
      })
    );
    const POST = await importRoute();
    await POST(
      new Request("http://localhost/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validBody),
      })
    );
    expect(insertSpy).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ question_id: "q1", answer_text: "" }),
      ])
    );
  });
});

// =========================================================================
// GET /api/applications/[id]
// =========================================================================

describe("GET /api/applications/[id]", () => {
  async function importRoute() {
    const mod = await import("../../api/applications/[id]/route");
    return mod.GET;
  }

  const applicationRow = {
    id: APP_ID,
    user_id: "user-123",
    fund_id: FUND_ID,
    criteria_set_id: CRITERIA_SET_ID,
    questions_set_id: QUESTIONS_SET_ID,
    title: "My App",
    status: "draft",
    review_count: 0,
    created_at: "2026-01-01",
    updated_at: "2026-01-01",
  };

  it("returns 401 when not authenticated", async () => {
    unauthenticatedUser();
    const GET = await importRoute();
    const res = await GET(new Request("http://localhost"), routeParams(APP_ID));
    expect(res.status).toBe(401);
  });

  it("returns 404 if application not found", async () => {
    authenticatedUser();
    mockFrom.mockImplementation(
      tableDispatch({
        applications: { data: null, error: { message: "not found" } },
        application_answers: { data: [], error: null },
      })
    );
    mockServiceFrom.mockImplementation(tableDispatch({}));
    const GET = await importRoute();
    const res = await GET(new Request("http://localhost"), routeParams(APP_ID));
    expect(res.status).toBe(404);
  });

  it("returns 200 with application, answers, fund, criteria and questions", async () => {
    authenticatedUser();
    mockFrom.mockImplementation(
      tableDispatch({
        applications: { data: applicationRow, error: null },
        application_answers: { data: [{ id: "ans-1", question_id: "q1", answer_text: "Hello" }], error: null },
      })
    );
    mockServiceFrom.mockImplementation(
      tableDispatch({
        funds: { data: { id: FUND_ID, name: "Test Fund", organisation_id: null }, error: null },
        criteria_sets: { data: { id: CRITERIA_SET_ID, name: "Criteria v1" }, error: null },
        questions_sets: { data: { id: QUESTIONS_SET_ID, questions_json: [] }, error: null },
      })
    );
    const GET = await importRoute();
    const res = await GET(new Request("http://localhost"), routeParams(APP_ID));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.application).toMatchObject({ id: APP_ID, status: "draft" });
    expect(body.answers).toHaveLength(1);
    expect(body.fund).toMatchObject({ name: "Test Fund" });
    expect(body.criteriaSet).toMatchObject({ id: CRITERIA_SET_ID });
    expect(body.questionsSet).toMatchObject({ id: QUESTIONS_SET_ID });
  });
});

// =========================================================================
// PATCH /api/applications/[id] (update title)
// =========================================================================

describe("PATCH /api/applications/[id]", () => {
  async function importRoute() {
    const mod = await import("../../api/applications/[id]/route");
    return mod.PATCH;
  }

  it("returns 401 when not authenticated", async () => {
    unauthenticatedUser();
    const PATCH = await importRoute();
    const res = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({ title: "New Title" }),
      }),
      routeParams(APP_ID)
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 if title is not a string", async () => {
    authenticatedUser();
    const PATCH = await importRoute();
    const res = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: 42 }),
      }),
      routeParams(APP_ID)
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("Invalid title");
  });

  it("returns 500 on DB error", async () => {
    authenticatedUser();
    mockFrom.mockImplementation(
      tableDispatch({
        applications: { data: null, error: { message: "DB error" } },
      })
    );
    const PATCH = await importRoute();
    const res = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "New Title" }),
      }),
      routeParams(APP_ID)
    );
    expect(res.status).toBe(500);
  });

  it("returns 200 on success", async () => {
    authenticatedUser();
    mockFrom.mockImplementation(
      tableDispatch({
        applications: { data: null, error: null },
      })
    );
    const PATCH = await importRoute();
    const res = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Updated Title" }),
      }),
      routeParams(APP_ID)
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
  });
});

// =========================================================================
// DELETE /api/applications/[id]
// =========================================================================

describe("DELETE /api/applications/[id]", () => {
  async function importRoute() {
    const mod = await import("../../api/applications/[id]/route");
    return mod.DELETE;
  }

  it("returns 401 when not authenticated", async () => {
    unauthenticatedUser();
    const DELETE = await importRoute();
    const res = await DELETE(new Request("http://localhost"), routeParams(APP_ID));
    expect(res.status).toBe(401);
  });

  it("returns 500 on DB error", async () => {
    authenticatedUser();
    mockFrom.mockImplementation(
      tableDispatch({
        applications: { data: null, error: { message: "foreign key violation" } },
      })
    );
    const DELETE = await importRoute();
    const res = await DELETE(new Request("http://localhost"), routeParams(APP_ID));
    expect(res.status).toBe(500);
  });

  it("returns 200 on success", async () => {
    authenticatedUser();
    mockFrom.mockImplementation(
      tableDispatch({
        applications: { data: [{ id: APP_ID }], error: null },
      })
    );
    const DELETE = await importRoute();
    const res = await DELETE(new Request("http://localhost"), routeParams(APP_ID));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
  });
});

// =========================================================================
// PATCH /api/applications/[id]/answers
// =========================================================================

describe("PATCH /api/applications/[id]/answers", () => {
  async function importRoute() {
    const mod = await import("../../api/applications/[id]/answers/route");
    return mod.PATCH;
  }

  const validAnswers = {
    answers: [{ question_id: "q1", answer_text: "Our answer here." }],
  };

  it("returns 401 when not authenticated", async () => {
    unauthenticatedUser();
    const PATCH = await importRoute();
    const res = await PATCH(
      new Request("http://localhost", { method: "PATCH", body: JSON.stringify(validAnswers) }),
      routeParams(APP_ID)
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 if application not found (RLS returns null)", async () => {
    authenticatedUser();
    mockFrom.mockImplementation(
      tableDispatch({
        applications: { data: null, error: null },
      })
    );
    const PATCH = await importRoute();
    const res = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validAnswers),
      }),
      routeParams(APP_ID)
    );
    expect(res.status).toBe(404);
  });

  it("returns 409 if application is already submitted for review", async () => {
    authenticatedUser();
    mockFrom.mockImplementation(
      tableDispatch({
        applications: { data: { id: APP_ID, status: "submitted_for_review" }, error: null },
      })
    );
    const PATCH = await importRoute();
    const res = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validAnswers),
      }),
      routeParams(APP_ID)
    );
    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain("review is in progress");
  });

  it("returns 400 for invalid JSON body", async () => {
    authenticatedUser();
    mockFrom.mockImplementation(
      tableDispatch({
        applications: { data: { id: APP_ID, status: "draft" }, error: null },
      })
    );
    const PATCH = await importRoute();
    const res = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        body: "not json",
      }),
      routeParams(APP_ID)
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 if answers array is empty", async () => {
    authenticatedUser();
    mockFrom.mockImplementation(
      tableDispatch({
        applications: { data: { id: APP_ID, status: "draft" }, error: null },
      })
    );
    const PATCH = await importRoute();
    const res = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers: [] }),
      }),
      routeParams(APP_ID)
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 if an answer has an empty question_id", async () => {
    authenticatedUser();
    mockFrom.mockImplementation(
      tableDispatch({
        applications: { data: { id: APP_ID, status: "draft" }, error: null },
      })
    );
    const PATCH = await importRoute();
    const res = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers: [{ question_id: "", answer_text: "text" }] }),
      }),
      routeParams(APP_ID)
    );
    expect(res.status).toBe(400);
  });

  it("returns 500 if upsert fails", async () => {
    authenticatedUser();
    mockFrom.mockImplementation(
      tableDispatch({
        applications: { data: { id: APP_ID, status: "draft" }, error: null },
      })
    );
    mockServiceFrom.mockImplementation(
      tableDispatch({
        application_answers: { data: null, error: { message: "upsert failed" } },
      })
    );
    const PATCH = await importRoute();
    const res = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validAnswers),
      }),
      routeParams(APP_ID)
    );
    expect(res.status).toBe(500);
    expect((await res.json()).error).toContain("Failed to save answers");
  });

  it("returns 200 with saved count on success", async () => {
    authenticatedUser();
    mockFrom.mockImplementation(
      tableDispatch({
        applications: { data: { id: APP_ID, status: "draft" }, error: null },
      })
    );
    mockServiceFrom.mockImplementation(
      tableDispatch({
        application_answers: { data: null, error: null },
      })
    );
    const PATCH = await importRoute();
    const res = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          answers: [
            { question_id: "q1", answer_text: "First answer" },
            { question_id: "q2", answer_text: "Second answer" },
          ],
        }),
      }),
      routeParams(APP_ID)
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ saved: 2 });
  });
});

// =========================================================================
// POST /api/applications/[id]/submit-for-review
// =========================================================================

describe("POST /api/applications/[id]/submit-for-review", () => {
  async function importRoute() {
    const mod = await import("../../api/applications/[id]/submit-for-review/route");
    return mod.POST;
  }

  const draftApp = {
    id: APP_ID,
    status: "draft",
    review_count: 0,
    fund_id: FUND_ID,
    criteria_set_id: CRITERIA_SET_ID,
    questions_set_id: QUESTIONS_SET_ID,
  };

  const proProfile = { subscription_tier: "pro", subscription_status: "active", current_period_end: null };
  const nonEmptyAnswers = [{ question_id: "q1", answer_text: "Our answer." }];

  function setupSuccessfulMocks() {
    mockFrom.mockImplementation(
      tableDispatch({
        applications: { data: draftApp, error: null },
        application_answers: { data: nonEmptyAnswers, error: null },
      })
    );
    mockServiceFrom.mockImplementation(
      tableDispatch({
        profiles: { data: proProfile, error: null },
      })
    );
    mockServiceRpc.mockResolvedValue({
      data: [{ review_id: "review-001", review_number: 1 }],
      error: null,
    });
  }

  it("returns 401 when not authenticated", async () => {
    unauthenticatedUser();
    const POST = await importRoute();
    const res = await POST(new Request("http://localhost"), routeParams(APP_ID));
    expect(res.status).toBe(401);
  });

  it("returns 404 if application not found", async () => {
    authenticatedUser();
    mockFrom.mockImplementation(
      tableDispatch({
        applications: { data: null, error: null },
      })
    );
    const POST = await importRoute();
    const res = await POST(new Request("http://localhost"), routeParams(APP_ID));
    expect(res.status).toBe(404);
  });

  it("returns 409 if application is already submitted for review", async () => {
    authenticatedUser();
    mockFrom.mockImplementation(
      tableDispatch({
        applications: {
          data: { ...draftApp, status: "submitted_for_review" },
          error: null,
        },
      })
    );
    const POST = await importRoute();
    const res = await POST(new Request("http://localhost"), routeParams(APP_ID));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain("already being reviewed");
  });

  it("returns 403 if user is on free tier", async () => {
    authenticatedUser();
    mockFrom.mockImplementation(tableDispatch({ applications: { data: draftApp, error: null } }));
    mockServiceFrom.mockImplementation(
      tableDispatch({
        profiles: { data: { subscription_tier: "free", subscription_status: null, current_period_end: null }, error: null },
      })
    );
    const POST = await importRoute();
    const res = await POST(new Request("http://localhost"), routeParams(APP_ID));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toContain("subscription");
  });

  it("returns 403 if subscription_status is not active", async () => {
    authenticatedUser();
    mockFrom.mockImplementation(tableDispatch({ applications: { data: draftApp, error: null } }));
    mockServiceFrom.mockImplementation(
      tableDispatch({
        profiles: { data: { subscription_tier: "pro", subscription_status: "past_due", current_period_end: null }, error: null },
      })
    );
    const POST = await importRoute();
    const res = await POST(new Request("http://localhost"), routeParams(APP_ID));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toContain("subscription");
  });

  it("returns 402 if insufficient credits (RPC)", async () => {
    authenticatedUser();
    mockFrom.mockImplementation(
      tableDispatch({
        applications: { data: draftApp, error: null },
        application_answers: { data: nonEmptyAnswers, error: null },
      })
    );
    mockServiceFrom.mockImplementation(
      tableDispatch({
        profiles: { data: proProfile, error: null },
      })
    );
    mockServiceRpc.mockResolvedValue({
      data: null,
      error: { message: "INSUFFICIENT_CREDITS" },
    });
    const POST = await importRoute();
    const res = await POST(new Request("http://localhost"), routeParams(APP_ID));
    expect(res.status).toBe(402);
    expect((await res.json()).error).toContain("Insufficient credits");
  });

  it("returns 409 when review already in progress (RPC REVIEW_IN_PROGRESS)", async () => {
    authenticatedUser();
    mockFrom.mockImplementation(
      tableDispatch({
        applications: { data: draftApp, error: null },
        application_answers: { data: nonEmptyAnswers, error: null },
      })
    );
    mockServiceFrom.mockImplementation(
      tableDispatch({
        profiles: { data: proProfile, error: null },
      })
    );
    mockServiceRpc.mockResolvedValue({
      data: null,
      error: { message: "REVIEW_IN_PROGRESS" },
    });
    const POST = await importRoute();
    const res = await POST(new Request("http://localhost"), routeParams(APP_ID));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain("already have a review in progress");
  });

  it("returns 400 if all answers are empty", async () => {
    authenticatedUser();
    mockFrom.mockImplementation(
      tableDispatch({
        applications: { data: draftApp, error: null },
        application_answers: {
          data: [{ question_id: "q1", answer_text: "   " }],
          error: null,
        },
      })
    );
    mockServiceFrom.mockImplementation(
      tableDispatch({
        profiles: { data: proProfile, error: null },
      })
    );
    const POST = await importRoute();
    const res = await POST(new Request("http://localhost"), routeParams(APP_ID));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("At least one answer");
  });

  it("returns 500 if RPC fails with non-usage error", async () => {
    authenticatedUser();
    mockFrom.mockImplementation(
      tableDispatch({
        applications: { data: draftApp, error: null },
        application_answers: { data: nonEmptyAnswers, error: null },
      })
    );
    mockServiceFrom.mockImplementation(
      tableDispatch({
        profiles: { data: proProfile, error: null },
      })
    );
    mockServiceRpc.mockResolvedValue({
      data: null,
      error: { message: "insert failed" },
    });
    const POST = await importRoute();
    const res = await POST(new Request("http://localhost"), routeParams(APP_ID));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toContain("Failed to submit review");
  });

  it("returns 201 and fires Inngest event on success", async () => {
    authenticatedUser("user-123");
    setupSuccessfulMocks();
    mockInngestSend.mockResolvedValue(undefined);
    const POST = await importRoute();
    const res = await POST(new Request("http://localhost"), routeParams(APP_ID));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toMatchObject({ reviewId: "review-001", reviewNumber: 1 });
    expect(mockInngestSend).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "application/review-requested",
        data: expect.objectContaining({
          applicationId: APP_ID,
          reviewId: "review-001",
          reviewNumber: 1,
          userId: "user-123",
        }),
      })
    );
  });

  it("succeeds when RPC returns review (bonus_reviews handled atomically)", async () => {
    authenticatedUser();
    mockFrom.mockImplementation(
      tableDispatch({
        applications: { data: draftApp, error: null },
        application_answers: { data: nonEmptyAnswers, error: null },
      })
    );
    mockServiceFrom.mockImplementation(
      tableDispatch({
        profiles: { data: proProfile, error: null },
      })
    );
    // RPC succeeds — means bonus_reviews allowed it through atomically
    mockServiceRpc.mockResolvedValue({
      data: [{ review_id: "review-002", review_number: 1 }],
      error: null,
    });
    mockInngestSend.mockResolvedValue(undefined);
    const POST = await importRoute();
    const res = await POST(new Request("http://localhost"), routeParams(APP_ID));
    expect(res.status).toBe(201);
  });
});

// =========================================================================
// GET /api/applications/[id]/reviews
// =========================================================================

describe("GET /api/applications/[id]/reviews", () => {
  async function importRoute() {
    const mod = await import("../../api/applications/[id]/reviews/route");
    return mod.GET;
  }

  it("returns 401 when not authenticated", async () => {
    unauthenticatedUser();
    const GET = await importRoute();
    const res = await GET(new Request("http://localhost"), routeParams(APP_ID));
    expect(res.status).toBe(401);
  });

  it("returns 404 if application not found", async () => {
    authenticatedUser();
    mockFrom.mockImplementation(
      tableDispatch({
        applications: { data: null, error: null },
        application_reviews: { data: [], error: null },
      })
    );
    const GET = await importRoute();
    const res = await GET(new Request("http://localhost"), routeParams(APP_ID));
    expect(res.status).toBe(404);
  });

  it("returns 200 with empty reviews array when no reviews exist", async () => {
    authenticatedUser();
    mockFrom.mockImplementation(
      tableDispatch({
        applications: { data: { id: APP_ID, status: "draft", review_count: 0 }, error: null },
        application_reviews: { data: null, error: null },
      })
    );
    const GET = await importRoute();
    const res = await GET(new Request("http://localhost"), routeParams(APP_ID));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ reviews: [] });
  });

  it("returns 200 with review summaries including overall_score", async () => {
    authenticatedUser();
    mockFrom.mockImplementation(
      tableDispatch({
        applications: { data: { id: APP_ID, status: "reviewed", review_count: 1 }, error: null },
        application_reviews: {
          data: [
            {
              id: "rev-1",
              review_number: 1,
              status: "complete",
              results: { scoring: { overall_score: 72, submission_readiness: "Strong" } },
              error_message: null,
              created_at: "2026-02-01",
            },
          ],
          error: null,
        },
      })
    );
    const GET = await importRoute();
    const res = await GET(new Request("http://localhost"), routeParams(APP_ID));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.reviews).toHaveLength(1);
    expect(body.reviews[0]).toMatchObject({
      id: "rev-1",
      review_number: 1,
      status: "complete",
      overall_score: 72,
      submission_readiness: "Strong",
    });
  });

  it("handles reviews with no scoring results gracefully", async () => {
    authenticatedUser();
    mockFrom.mockImplementation(
      tableDispatch({
        applications: { data: { id: APP_ID, status: "submitted_for_review", review_count: 1 }, error: null },
        application_reviews: {
          data: [
            {
              id: "rev-1",
              review_number: 1,
              status: "pending",
              results: null,
              error_message: null,
              created_at: "2026-02-01",
            },
          ],
          error: null,
        },
      })
    );
    const GET = await importRoute();
    const res = await GET(new Request("http://localhost"), routeParams(APP_ID));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.reviews[0]).toMatchObject({
      overall_score: null,
      submission_readiness: null,
    });
  });
});

// =========================================================================
// GET /api/applications/[id]/reviews/latest
// =========================================================================

describe("GET /api/applications/[id]/reviews/latest", () => {
  async function importRoute() {
    const mod = await import(
      "../../api/applications/[id]/reviews/latest/route"
    );
    return mod.GET;
  }

  it("returns 401 when not authenticated", async () => {
    unauthenticatedUser();
    const GET = await importRoute();
    const res = await GET(new Request("http://localhost"), routeParams(APP_ID));
    expect(res.status).toBe(401);
  });

  it("returns 404 if application not found", async () => {
    authenticatedUser();
    mockFrom.mockImplementation(
      tableDispatch({
        applications: { data: null, error: null },
      })
    );
    const GET = await importRoute();
    const res = await GET(new Request("http://localhost"), routeParams(APP_ID));
    expect(res.status).toBe(404);
  });

  it("returns 404 if no reviews exist for the application", async () => {
    authenticatedUser();
    mockFrom.mockImplementation(
      tableDispatch({
        applications: { data: { id: APP_ID, status: "draft" }, error: null },
        application_reviews: { data: null, error: null },
      })
    );
    const GET = await importRoute();
    const res = await GET(new Request("http://localhost"), routeParams(APP_ID));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toContain("No reviews found");
  });

  it("returns 200 with latest review and applicationStatus", async () => {
    authenticatedUser();
    const reviewData = {
      id: "rev-latest",
      review_number: 2,
      status: "complete",
      progress: {},
      results: { scoring: { overall_score: 85 } },
      error_message: null,
      created_at: "2026-02-15",
    };
    mockFrom.mockImplementation(
      tableDispatch({
        applications: { data: { id: APP_ID, status: "reviewed" }, error: null },
        application_reviews: { data: reviewData, error: null },
      })
    );
    const GET = await importRoute();
    const res = await GET(new Request("http://localhost"), routeParams(APP_ID));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.review).toMatchObject({ id: "rev-latest", review_number: 2 });
    expect(body.applicationStatus).toBe("reviewed");
  });
});

// =========================================================================
// POST /api/applications/[id]/reviews/[reviewId]/create-draft
// =========================================================================

describe("POST /api/applications/[id]/reviews/[reviewId]/create-draft", () => {
  async function importRoute() {
    const mod = await import(
      "../../api/applications/[id]/reviews/[reviewId]/create-draft/route"
    );
    return mod.POST;
  }

  // Two-level route params helper (Next.js 16 async params)
  function routeParamsTwoLevel(id: string, reviewId: string) {
    return { params: Promise.resolve({ id, reviewId }) };
  }

  // Extended chainMock with .like()
  function draftChainMock(resolvedValue: unknown) {
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
    chain.like = returnChain;
    chain.in = returnChain;
    chain.order = returnChain;
    chain.limit = returnChain;
    chain.single = vi.fn(() => resolved);
    chain.maybeSingle = vi.fn(() => resolved);
    chain.then = (
      onfulfilled: Parameters<Promise<unknown>["then"]>[0],
      onrejected: Parameters<Promise<unknown>["then"]>[1]
    ) => resolved.then(onfulfilled, onrejected);
    return chain;
  }

  const REVIEW_ID = "rev-00000000-0000-0000-0000-000000000001";

  const sourceApp = {
    id: APP_ID,
    fund_id: FUND_ID,
    criteria_set_id: CRITERIA_SET_ID,
    questions_set_id: QUESTIONS_SET_ID,
    title: "My Application",
  };

  const completedReview = {
    id: REVIEW_ID,
    review_number: 1,
    status: "completed",
    results: {
      answer_snapshot: [
        { question_id: "q1", answer_text: "Our answer" },
      ],
      disabled_answer_ids: [],
    },
    questions_set_id: QUESTIONS_SET_ID,
    criteria_set_id: CRITERIA_SET_ID,
  };

  it("returns 401 when not authenticated", async () => {
    unauthenticatedUser();
    const POST = await importRoute();
    const res = await POST(
      new Request("http://localhost", { method: "POST" }),
      routeParamsTwoLevel(APP_ID, REVIEW_ID)
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 when application not found", async () => {
    authenticatedUser();
    mockFrom.mockImplementation(() =>
      draftChainMock({ data: null, error: null })
    );
    const POST = await importRoute();
    const res = await POST(
      new Request("http://localhost", { method: "POST" }),
      routeParamsTwoLevel(APP_ID, REVIEW_ID)
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Application not found" });
  });

  it("returns 404 when review not found", async () => {
    authenticatedUser();
    const callIndex = { applications: 0, application_reviews: 0 };
    mockFrom.mockImplementation((table: string) => {
      if (table === "applications") {
        return draftChainMock({ data: sourceApp, error: null });
      }
      if (table === "application_reviews") {
        return draftChainMock({ data: null, error: null });
      }
      return draftChainMock({ data: null, error: null });
    });
    const POST = await importRoute();
    const res = await POST(
      new Request("http://localhost", { method: "POST" }),
      routeParamsTwoLevel(APP_ID, REVIEW_ID)
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Review not found" });
  });

  it("returns 429 when rate limit reached (5+ drafts)", async () => {
    authenticatedUser();
    const callIndex = { applications: 0 };
    mockFrom.mockImplementation((table: string) => {
      if (table === "applications") {
        callIndex.applications++;
        if (callIndex.applications === 1) {
          return draftChainMock({ data: sourceApp, error: null });
        }
        // Rate limit count query
        return draftChainMock({ count: 5, data: null, error: null });
      }
      if (table === "application_reviews") {
        return draftChainMock({ data: completedReview, error: null });
      }
      return draftChainMock({ data: null, error: null });
    });
    const POST = await importRoute();
    const res = await POST(
      new Request("http://localhost", { method: "POST" }),
      routeParamsTwoLevel(APP_ID, REVIEW_ID)
    );
    expect(res.status).toBe(429);
    expect((await res.json()).error).toContain("Maximum drafts");
  });

  it("returns 201 with answer snapshot on success", async () => {
    authenticatedUser();
    const callIndex = { applications: 0 };
    mockFrom.mockImplementation((table: string) => {
      if (table === "applications") {
        callIndex.applications++;
        if (callIndex.applications === 1) {
          return draftChainMock({ data: sourceApp, error: null });
        }
        if (callIndex.applications === 2) {
          // Rate limit count
          return draftChainMock({ count: 0, data: null, error: null });
        }
        // Insert new application
        return draftChainMock({ data: { id: "new-app-id" }, error: null });
      }
      if (table === "application_reviews") {
        return draftChainMock({ data: completedReview, error: null });
      }
      return draftChainMock({ data: null, error: null });
    });
    mockServiceFrom.mockImplementation((table: string) => {
      if (table === "questions_sets") {
        return draftChainMock({
          data: { questions_json: [{ id: "q1", field_type: "text_long" }] },
          error: null,
        });
      }
      if (table === "application_answers") {
        return draftChainMock({ data: null, error: null });
      }
      return draftChainMock({ data: null, error: null });
    });
    const POST = await importRoute();
    const res = await POST(
      new Request("http://localhost", { method: "POST" }),
      routeParamsTwoLevel(APP_ID, REVIEW_ID)
    );
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ applicationId: "new-app-id" });
  });

  it("returns 201 with fallback to current answers (no snapshot)", async () => {
    authenticatedUser();
    const reviewNoSnapshot = {
      ...completedReview,
      results: { disabled_answer_ids: [] },
    };
    const callIndex = { applications: 0, application_answers: 0 };
    mockFrom.mockImplementation((table: string) => {
      if (table === "applications") {
        callIndex.applications++;
        if (callIndex.applications === 1) {
          return draftChainMock({ data: sourceApp, error: null });
        }
        if (callIndex.applications === 2) {
          return draftChainMock({ count: 0, data: null, error: null });
        }
        return draftChainMock({ data: { id: "new-app-id" }, error: null });
      }
      if (table === "application_reviews") {
        return draftChainMock({ data: reviewNoSnapshot, error: null });
      }
      if (table === "application_answers") {
        // Fallback current answers query
        return draftChainMock({
          data: [{ question_id: "q1", answer_text: "Current answer", selected_options: null, is_disabled: false }],
          error: null,
        });
      }
      return draftChainMock({ data: null, error: null });
    });
    mockServiceFrom.mockImplementation((table: string) => {
      if (table === "questions_sets") {
        return draftChainMock({
          data: { questions_json: [{ id: "q1", field_type: "text_long" }] },
          error: null,
        });
      }
      if (table === "application_answers") {
        return draftChainMock({ data: null, error: null });
      }
      return draftChainMock({ data: null, error: null });
    });
    const POST = await importRoute();
    const res = await POST(
      new Request("http://localhost", { method: "POST" }),
      routeParamsTwoLevel(APP_ID, REVIEW_ID)
    );
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ applicationId: "new-app-id" });
  });

  it("returns 500 when application insert fails", async () => {
    authenticatedUser();
    const callIndex = { applications: 0 };
    mockFrom.mockImplementation((table: string) => {
      if (table === "applications") {
        callIndex.applications++;
        if (callIndex.applications === 1) {
          return draftChainMock({ data: sourceApp, error: null });
        }
        if (callIndex.applications === 2) {
          return draftChainMock({ count: 0, data: null, error: null });
        }
        return draftChainMock({ data: null, error: { message: "insert failed" } });
      }
      if (table === "application_reviews") {
        return draftChainMock({ data: completedReview, error: null });
      }
      return draftChainMock({ data: null, error: null });
    });
    mockServiceFrom.mockImplementation((table: string) => {
      if (table === "questions_sets") {
        return draftChainMock({
          data: { questions_json: [{ id: "q1" }] },
          error: null,
        });
      }
      return draftChainMock({ data: null, error: null });
    });
    const POST = await importRoute();
    const res = await POST(
      new Request("http://localhost", { method: "POST" }),
      routeParamsTwoLevel(APP_ID, REVIEW_ID)
    );
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Failed to create draft" });
  });
});

// =========================================================================
// PATCH /api/applications/[id]/questions-set (swap)
// =========================================================================

describe("PATCH /api/applications/[id]/questions-set", () => {
  async function importRoute() {
    const mod = await import("../../api/applications/[id]/questions-set/route");
    return mod.PATCH;
  }

  // Extended chainMock with .in() and .delete()
  function swapChainMock(resolvedValue: unknown) {
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
    chain.in = returnChain;
    chain.order = returnChain;
    chain.limit = returnChain;
    chain.single = vi.fn(() => resolved);
    chain.maybeSingle = vi.fn(() => resolved);
    chain.then = (
      onfulfilled: Parameters<Promise<unknown>["then"]>[0],
      onrejected: Parameters<Promise<unknown>["then"]>[1]
    ) => resolved.then(onfulfilled, onrejected);
    return chain;
  }

  const NEW_QS_ID = "00000000-0000-0000-0000-000000000099";

  const draftApp = {
    id: APP_ID,
    status: "draft",
    fund_id: FUND_ID,
    questions_set_id: QUESTIONS_SET_ID,
  };

  it("returns 401 when not authenticated", async () => {
    unauthenticatedUser();
    const PATCH = await importRoute();
    const res = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({ questionsSetId: NEW_QS_ID }),
      }),
      routeParams(APP_ID)
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 when application not found", async () => {
    authenticatedUser();
    mockFrom.mockImplementation(() =>
      swapChainMock({ data: null, error: null })
    );
    const PATCH = await importRoute();
    const res = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionsSetId: NEW_QS_ID }),
      }),
      routeParams(APP_ID)
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Application not found" });
  });

  it("returns 409 when review is in progress", async () => {
    authenticatedUser();
    mockFrom.mockImplementation(() =>
      swapChainMock({ data: { ...draftApp, status: "submitted_for_review" }, error: null })
    );
    const PATCH = await importRoute();
    const res = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionsSetId: NEW_QS_ID }),
      }),
      routeParams(APP_ID)
    );
    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain("review is in progress");
  });

  it("returns 400 for invalid JSON body", async () => {
    authenticatedUser();
    mockFrom.mockImplementation(() =>
      swapChainMock({ data: draftApp, error: null })
    );
    const PATCH = await importRoute();
    const res = await PATCH(
      new Request("http://localhost", { method: "PATCH", body: "not json" }),
      routeParams(APP_ID)
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid JSON" });
  });

  it("returns 400 for invalid body (not a UUID)", async () => {
    authenticatedUser();
    mockFrom.mockImplementation(() =>
      swapChainMock({ data: draftApp, error: null })
    );
    const PATCH = await importRoute();
    const res = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionsSetId: "not-a-uuid" }),
      }),
      routeParams(APP_ID)
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when same questions set (no-op)", async () => {
    authenticatedUser();
    mockFrom.mockImplementation(() =>
      swapChainMock({ data: draftApp, error: null })
    );
    const PATCH = await importRoute();
    const res = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionsSetId: QUESTIONS_SET_ID }),
      }),
      routeParams(APP_ID)
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Already using this questions set" });
  });

  it("returns 404 when new set not found", async () => {
    authenticatedUser();
    mockFrom.mockImplementation(() =>
      swapChainMock({ data: draftApp, error: null })
    );
    mockServiceFrom.mockImplementation(() =>
      swapChainMock({ data: null, error: null })
    );
    const PATCH = await importRoute();
    const res = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionsSetId: NEW_QS_ID }),
      }),
      routeParams(APP_ID)
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Questions set not found" });
  });

  it("returns 400 when new set belongs to different fund", async () => {
    authenticatedUser();
    mockFrom.mockImplementation(() =>
      swapChainMock({ data: draftApp, error: null })
    );
    let serviceCallCount = 0;
    mockServiceFrom.mockImplementation(() => {
      serviceCallCount++;
      if (serviceCallCount === 1) {
        return swapChainMock({
          data: { id: NEW_QS_ID, fund_id: "other-fund-id", approved: true, created_by: "other-user", questions_json: [] },
          error: null,
        });
      }
      return swapChainMock({ data: null, error: null });
    });
    const PATCH = await importRoute();
    const res = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionsSetId: NEW_QS_ID }),
      }),
      routeParams(APP_ID)
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Questions set belongs to a different fund" });
  });

  it("returns 200 with added/removed/kept counts on success", async () => {
    authenticatedUser();
    mockFrom.mockImplementation(() =>
      swapChainMock({ data: draftApp, error: null })
    );
    let serviceCallCount = 0;
    mockServiceFrom.mockImplementation(() => {
      serviceCallCount++;
      if (serviceCallCount === 1) {
        // New set lookup
        return swapChainMock({
          data: {
            id: NEW_QS_ID,
            fund_id: FUND_ID,
            approved: true,
            created_by: "other-user",
            questions_json: [
              { id: "q1", field_type: "text_long" },
              { id: "q3", field_type: "text_short" },
            ],
          },
          error: null,
        });
      }
      if (serviceCallCount === 2) {
        // Current answers
        return swapChainMock({
          data: [
            { id: "ans-1", question_id: "q1" },
            { id: "ans-2", question_id: "q2" },
          ],
          error: null,
        });
      }
      // All subsequent: delete, insert, update
      return swapChainMock({ data: null, error: null });
    });
    const PATCH = await importRoute();
    const res = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionsSetId: NEW_QS_ID }),
      }),
      routeParams(APP_ID)
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ added: 1, removed: 1, kept: 1 });
  });
});
