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
// Chain mock — covers .single(), .eq(), .like(), select with count, etc.
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
  chain.like = returnChain;
  chain.order = returnChain;
  chain.limit = returnChain;
  chain.single = vi.fn(() => resolved);
  chain.then = (
    onfulfilled: Parameters<Promise<unknown>["then"]>[0],
    onrejected: Parameters<Promise<unknown>["then"]>[1]
  ) => resolved.then(onfulfilled, onrejected);
  return chain;
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
function routeParams(id: string, reviewId: string) {
  return { params: Promise.resolve({ id, reviewId }) };
}

// ---------------------------------------------------------------------------
// Shared test data
// ---------------------------------------------------------------------------

const APP_ID = "app-001";
const REVIEW_ID = "rev-001";
const FUND_ID = "fund-001";
const CRITERIA_SET_ID = "cs-001";
const QUESTIONS_SET_ID = "qs-001";
const NEW_APP_ID = "app-002";

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
  questions_set_id: QUESTIONS_SET_ID,
  criteria_set_id: CRITERIA_SET_ID,
  results: {
    answer_snapshot: [
      { question_id: "q1", answer_text: "Snapshot answer one", selected_options: ["opt_a"] },
      { question_id: "q2", answer_text: "Snapshot answer two", selected_options: null },
    ],
    disabled_answer_ids: ["q3"],
  },
};

const questionsJson = [
  { id: "q1", field_type: "text_long" },
  { id: "q2", field_type: "text_short" },
  { id: "q3", field_type: "dropdown" },
];

// ---------------------------------------------------------------------------
// Import helper
// ---------------------------------------------------------------------------

async function importRoute() {
  const mod = await import("../route");
  return mod.POST;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/applications/[id]/reviews/[reviewId]/create-draft", () => {
  it("returns 401 when not authenticated", async () => {
    unauthenticatedUser();
    const POST = await importRoute();
    const res = await POST(
      new Request("http://localhost"),
      routeParams(APP_ID, REVIEW_ID)
    );
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("returns 404 when application not found (RLS blocks)", async () => {
    authenticatedUser();
    // First from("applications") call returns null (source app not found)
    mockFrom.mockReturnValue(chainMock({ data: null, error: null }));
    const POST = await importRoute();
    const res = await POST(
      new Request("http://localhost"),
      routeParams(APP_ID, REVIEW_ID)
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Application not found" });
  });

  it("returns 404 when review not found or not completed", async () => {
    authenticatedUser();
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // applications (source app)
        return chainMock({ data: sourceApp, error: null });
      }
      // application_reviews — not found
      return chainMock({ data: null, error: null });
    });
    const POST = await importRoute();
    const res = await POST(
      new Request("http://localhost"),
      routeParams(APP_ID, REVIEW_ID)
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Review not found" });
  });

  it("returns 429 when max drafts reached (rate limit)", async () => {
    authenticatedUser();
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return chainMock({ data: sourceApp, error: null });
      if (callCount === 2) return chainMock({ data: completedReview, error: null });
      // Rate limit check — count >= 5
      return chainMock({ count: 5, data: null, error: null });
    });
    const POST = await importRoute();
    const res = await POST(
      new Request("http://localhost"),
      routeParams(APP_ID, REVIEW_ID)
    );
    expect(res.status).toBe(429);
    expect((await res.json()).error).toContain("Maximum drafts");
  });

  it("returns 500 when application insert fails", async () => {
    authenticatedUser();
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return chainMock({ data: sourceApp, error: null });
      if (callCount === 2) return chainMock({ data: completedReview, error: null });
      if (callCount === 3) return chainMock({ count: 0, data: null, error: null });
      // Application insert fails
      return chainMock({ data: null, error: { message: "insert failed" } });
    });
    mockServiceFrom.mockReturnValue(
      chainMock({ data: { questions_json: questionsJson }, error: null })
    );
    const POST = await importRoute();
    const res = await POST(
      new Request("http://localhost"),
      routeParams(APP_ID, REVIEW_ID)
    );
    expect(res.status).toBe(500);
    expect((await res.json()).error).toContain("Failed to create draft");
  });

  it("returns 201 with snapshot-based answer pre-population (happy path)", async () => {
    authenticatedUser();
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return chainMock({ data: sourceApp, error: null });
      if (callCount === 2) return chainMock({ data: completedReview, error: null });
      if (callCount === 3) return chainMock({ count: 0, data: null, error: null });
      // Application insert
      return chainMock({ data: { id: NEW_APP_ID }, error: null });
    });
    const insertSpy = vi.fn(() => chainMock({ data: null, error: null }));
    mockServiceFrom.mockImplementation((table: string) => {
      if (table === "questions_sets") {
        return chainMock({ data: { questions_json: questionsJson }, error: null });
      }
      if (table === "application_answers") {
        const chain = chainMock({ data: null, error: null });
        chain.insert = insertSpy;
        return chain;
      }
      return chainMock({ data: null, error: null });
    });
    const POST = await importRoute();
    const res = await POST(
      new Request("http://localhost"),
      routeParams(APP_ID, REVIEW_ID)
    );
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ applicationId: NEW_APP_ID });
    // Verify answers were inserted
    expect(insertSpy).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          question_id: "q1",
          answer_text: "Snapshot answer one",
        }),
        expect.objectContaining({
          question_id: "q2",
          answer_text: "Snapshot answer two",
        }),
      ])
    );
  });

  it("returns 201 with fallback to current answers (no snapshot)", async () => {
    authenticatedUser();
    const reviewNoSnapshot = {
      ...completedReview,
      results: { scoring: { overall_score: 70 } }, // no answer_snapshot
    };
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return chainMock({ data: sourceApp, error: null });
      if (callCount === 2) return chainMock({ data: reviewNoSnapshot, error: null });
      if (callCount === 3) return chainMock({ count: 0, data: null, error: null });
      if (callCount === 4) {
        // Application insert
        return chainMock({ data: { id: NEW_APP_ID }, error: null });
      }
      // Fallback: application_answers query
      return chainMock({
        data: [
          { question_id: "q1", answer_text: "Current answer", selected_options: null, is_disabled: false },
        ],
        error: null,
      });
    });
    mockServiceFrom.mockImplementation((table: string) => {
      if (table === "questions_sets") {
        return chainMock({ data: { questions_json: questionsJson }, error: null });
      }
      return chainMock({ data: null, error: null });
    });
    const POST = await importRoute();
    const res = await POST(
      new Request("http://localhost"),
      routeParams(APP_ID, REVIEW_ID)
    );
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ applicationId: NEW_APP_ID });
  });

  it("preserves selected_options in created answers", async () => {
    authenticatedUser();
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return chainMock({ data: sourceApp, error: null });
      if (callCount === 2) return chainMock({ data: completedReview, error: null });
      if (callCount === 3) return chainMock({ count: 0, data: null, error: null });
      return chainMock({ data: { id: NEW_APP_ID }, error: null });
    });
    const insertSpy = vi.fn(() => chainMock({ data: null, error: null }));
    mockServiceFrom.mockImplementation((table: string) => {
      if (table === "questions_sets") {
        return chainMock({ data: { questions_json: questionsJson }, error: null });
      }
      if (table === "application_answers") {
        const chain = chainMock({ data: null, error: null });
        chain.insert = insertSpy;
        return chain;
      }
      return chainMock({ data: null, error: null });
    });
    const POST = await importRoute();
    await POST(
      new Request("http://localhost"),
      routeParams(APP_ID, REVIEW_ID)
    );
    expect(insertSpy).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          question_id: "q1",
          selected_options: ["opt_a"],
        }),
        expect.objectContaining({
          question_id: "q2",
          selected_options: null,
        }),
      ])
    );
  });

  it("preserves is_disabled state in created answers", async () => {
    authenticatedUser();
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return chainMock({ data: sourceApp, error: null });
      if (callCount === 2) return chainMock({ data: completedReview, error: null });
      if (callCount === 3) return chainMock({ count: 0, data: null, error: null });
      return chainMock({ data: { id: NEW_APP_ID }, error: null });
    });
    const insertSpy = vi.fn(() => chainMock({ data: null, error: null }));
    mockServiceFrom.mockImplementation((table: string) => {
      if (table === "questions_sets") {
        return chainMock({ data: { questions_json: questionsJson }, error: null });
      }
      if (table === "application_answers") {
        const chain = chainMock({ data: null, error: null });
        chain.insert = insertSpy;
        return chain;
      }
      return chainMock({ data: null, error: null });
    });
    const POST = await importRoute();
    await POST(
      new Request("http://localhost"),
      routeParams(APP_ID, REVIEW_ID)
    );
    // q3 is in disabled_answer_ids, so should be is_disabled: true
    expect(insertSpy).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          question_id: "q1",
          is_disabled: false,
        }),
        expect.objectContaining({
          question_id: "q3",
          is_disabled: true,
        }),
      ])
    );
  });
});
