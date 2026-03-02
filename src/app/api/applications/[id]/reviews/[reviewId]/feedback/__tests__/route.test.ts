import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Supabase mock
// ---------------------------------------------------------------------------

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
  vi.resetModules();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function chainMock(resolvedValue: unknown) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  chain.select = vi.fn(() => chain);
  chain.insert = vi.fn(() => chain);
  chain.update = vi.fn(() => chain);
  chain.upsert = vi.fn(() => chain);
  chain.delete = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.limit = vi.fn(() => chain);
  chain.single = vi.fn(() => Promise.resolve(resolvedValue));
  return chain;
}

function authenticatedUser(id = "user-123") {
  mockGetUser.mockResolvedValue({ data: { user: { id } } });
}

function unauthenticatedUser() {
  mockGetUser.mockResolvedValue({ data: { user: null } });
}

function mockRequest(body: unknown): Request {
  return new Request("http://localhost/api/applications/app-1/reviews/rev-1/feedback", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function mockMalformedRequest(): Request {
  return new Request("http://localhost/api/applications/app-1/reviews/rev-1/feedback", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: "not-json{{{",
  });
}

const routeParams = Promise.resolve({ id: "app-1", reviewId: "rev-1" });

/** Standard ownership mocks: application found, review found. */
function mockOwnershipPass() {
  const appChain = chainMock({ data: { id: "app-1" } });
  const reviewChain = chainMock({ data: { id: "rev-1" } });
  mockFrom.mockImplementation((table: string) => {
    if (table === "applications") return appChain;
    if (table === "application_reviews") return reviewChain;
    return chainMock({ data: null });
  });
  return { appChain, reviewChain };
}

/** Ownership mocks: application found, review found, plus custom table handler. */
function mockOwnershipPassWithTable(tableName: string, tableChain: ReturnType<typeof chainMock>) {
  const appChain = chainMock({ data: { id: "app-1" } });
  const reviewChain = chainMock({ data: { id: "rev-1" } });
  mockFrom.mockImplementation((table: string) => {
    if (table === "applications") return appChain;
    if (table === "application_reviews") return reviewChain;
    if (table === tableName) return tableChain;
    return chainMock({ data: null });
  });
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

async function importRoute() {
  return import("../route");
}

// ---------------------------------------------------------------------------
// GET /feedback
// ---------------------------------------------------------------------------

describe("GET /api/applications/[id]/reviews/[reviewId]/feedback", () => {
  it("returns 401 for unauthenticated user", async () => {
    unauthenticatedUser();
    const { GET } = await importRoute();
    const res = await GET(new Request("http://localhost"), { params: routeParams });
    expect(res.status).toBe(401);
  });

  it("returns 404 when application not found", async () => {
    authenticatedUser();
    mockFrom.mockReturnValue(chainMock({ data: null }));
    const { GET } = await importRoute();
    const res = await GET(new Request("http://localhost"), { params: routeParams });
    expect(res.status).toBe(404);
  });

  it("returns 404 when review does not belong to application", async () => {
    authenticatedUser();
    const appChain = chainMock({ data: { id: "app-1" } });
    const reviewChain = chainMock({ data: null }); // review not found for this app
    mockFrom.mockImplementation((table: string) => {
      if (table === "applications") return appChain;
      if (table === "application_reviews") return reviewChain;
      return chainMock({ data: null });
    });
    const { GET } = await importRoute();
    const res = await GET(new Request("http://localhost"), { params: routeParams });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Review not found");
  });

  it("returns feedback map for authenticated user", async () => {
    authenticatedUser();
    const appChain = chainMock({ data: { id: "app-1" } });
    const reviewChain = chainMock({ data: { id: "rev-1" } });
    const feedbackChain = chainMock(undefined);
    const feedbackData = {
      data: [
        { item_path: "criteria_scores/c1", sentiment: "up" },
        { item_path: "answer_feedback/q1/inline_comments/0", sentiment: "down" },
      ],
    };
    // Override: feedbackChain resolves via .select().eq().eq().limit()
    feedbackChain.eq = vi.fn(() => ({
      ...feedbackChain,
      eq: vi.fn(() => ({
        limit: vi.fn(() => Promise.resolve(feedbackData)),
      })),
    }));

    mockFrom.mockImplementation((table: string) => {
      if (table === "applications") return appChain;
      if (table === "application_reviews") return reviewChain;
      if (table === "review_feedback") return feedbackChain;
      return chainMock({ data: null });
    });

    const { GET } = await importRoute();
    const res = await GET(new Request("http://localhost"), { params: routeParams });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.feedback).toEqual({
      "criteria_scores/c1": "up",
      "answer_feedback/q1/inline_comments/0": "down",
    });
  });
});

// ---------------------------------------------------------------------------
// PATCH /feedback
// ---------------------------------------------------------------------------

describe("PATCH /api/applications/[id]/reviews/[reviewId]/feedback", () => {
  it("returns 401 for unauthenticated user", async () => {
    unauthenticatedUser();
    const { PATCH } = await importRoute();
    const res = await PATCH(
      mockRequest({ item_path: "criteria_scores/c1", item_type: "criteria_score", sentiment: "up" }),
      { params: routeParams }
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 when application not found", async () => {
    authenticatedUser();
    mockFrom.mockReturnValue(chainMock({ data: null }));
    const { PATCH } = await importRoute();
    const res = await PATCH(
      mockRequest({ item_path: "criteria_scores/c1", item_type: "criteria_score", sentiment: "up" }),
      { params: routeParams }
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Application not found");
  });

  it("returns 404 when review does not belong to application", async () => {
    authenticatedUser();
    const appChain = chainMock({ data: { id: "app-1" } });
    const reviewChain = chainMock({ data: null });
    mockFrom.mockImplementation((table: string) => {
      if (table === "applications") return appChain;
      if (table === "application_reviews") return reviewChain;
      return chainMock({ data: null });
    });
    const { PATCH } = await importRoute();
    const res = await PATCH(
      mockRequest({ item_path: "criteria_scores/c1", item_type: "criteria_score", sentiment: "up" }),
      { params: routeParams }
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Review not found");
  });

  it("returns 400 for malformed JSON body", async () => {
    authenticatedUser();
    mockOwnershipPass();
    const { PATCH } = await importRoute();
    const res = await PATCH(mockMalformedRequest(), { params: routeParams });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid JSON body");
  });

  it("returns 400 when item_path is missing", async () => {
    authenticatedUser();
    mockOwnershipPass();
    const { PATCH } = await importRoute();
    const res = await PATCH(
      mockRequest({ item_type: "criteria_score", sentiment: "up" }),
      { params: routeParams }
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("item_path is required");
  });

  it("returns 400 when item_path is empty string", async () => {
    authenticatedUser();
    mockOwnershipPass();
    const { PATCH } = await importRoute();
    const res = await PATCH(
      mockRequest({ item_path: "", item_type: "criteria_score", sentiment: "up" }),
      { params: routeParams }
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("item_path is required");
  });

  it("returns 400 when item_path exceeds max length", async () => {
    authenticatedUser();
    mockOwnershipPass();
    const { PATCH } = await importRoute();
    const res = await PATCH(
      mockRequest({ item_path: "x".repeat(501), item_type: "criteria_score", sentiment: "up" }),
      { params: routeParams }
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("500 characters");
  });

  it("rejects invalid item_type", async () => {
    authenticatedUser();
    mockOwnershipPass();
    const { PATCH } = await importRoute();
    const res = await PATCH(
      mockRequest({ item_path: "criteria_scores/c1", item_type: "invalid", sentiment: "up" }),
      { params: routeParams }
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Invalid item_type");
  });

  it("rejects invalid sentiment", async () => {
    authenticatedUser();
    mockOwnershipPass();
    const { PATCH } = await importRoute();
    const res = await PATCH(
      mockRequest({ item_path: "criteria_scores/c1", item_type: "criteria_score", sentiment: "maybe" }),
      { params: routeParams }
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Invalid sentiment");
  });

  it("upserts feedback row for valid request", async () => {
    authenticatedUser();
    const upsertChain = chainMock({ error: null });
    mockOwnershipPassWithTable("review_feedback", upsertChain);

    const { PATCH } = await importRoute();
    const res = await PATCH(
      mockRequest({ item_path: "criteria_scores/c1", item_type: "criteria_score", sentiment: "up" }),
      { params: routeParams }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.sentiment).toBe("up");
  });

  it("returns 500 with generic message on upsert error", async () => {
    authenticatedUser();
    const upsertChain = chainMock({ data: null });
    // Override upsert to resolve directly with an error object
    upsertChain.upsert = vi.fn(() => Promise.resolve({ error: { message: "duplicate key violation on review_feedback_pkey" } }));
    mockOwnershipPassWithTable("review_feedback", upsertChain);

    const { PATCH } = await importRoute();
    const res = await PATCH(
      mockRequest({ item_path: "criteria_scores/c1", item_type: "criteria_score", sentiment: "up" }),
      { params: routeParams }
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Failed to save feedback");
    // Must NOT leak the internal error message
    expect(body.error).not.toContain("duplicate key");
  });

  it("deletes feedback when sentiment is null", async () => {
    authenticatedUser();
    const deleteChain = chainMock(undefined);
    deleteChain.delete = vi.fn(() => deleteChain);
    // Make the eq chain resolve with no error for delete
    deleteChain.eq = vi.fn(() => ({
      ...deleteChain,
      eq: vi.fn(() => ({
        ...deleteChain,
        eq: vi.fn(() => Promise.resolve({ error: null })),
      })),
    }));
    mockOwnershipPassWithTable("review_feedback", deleteChain);

    const { PATCH } = await importRoute();
    const res = await PATCH(
      mockRequest({ item_path: "criteria_scores/c1", item_type: "criteria_score", sentiment: null }),
      { params: routeParams }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("deleted");
  });

  it("queries correct tables and columns for ownership verification", async () => {
    authenticatedUser();
    const upsertChain = chainMock({ error: null });
    const appChain = chainMock({ data: { id: "app-1" } });
    const reviewChain = chainMock({ data: { id: "rev-1" } });
    mockFrom.mockImplementation((table: string) => {
      if (table === "applications") return appChain;
      if (table === "application_reviews") return reviewChain;
      if (table === "review_feedback") return upsertChain;
      return chainMock({ data: null });
    });

    const { PATCH } = await importRoute();
    await PATCH(
      mockRequest({ item_path: "criteria_scores/c1", item_type: "criteria_score", sentiment: "up" }),
      { params: routeParams }
    );

    // Verify correct tables are queried
    expect(mockFrom).toHaveBeenCalledWith("applications");
    expect(mockFrom).toHaveBeenCalledWith("application_reviews");
    expect(mockFrom).toHaveBeenCalledWith("review_feedback");

    // Verify applications chain queries by id
    expect(appChain.select).toHaveBeenCalledWith("id");
    expect(appChain.eq).toHaveBeenCalledWith("id", "app-1");

    // Verify review chain queries by id and application_id
    expect(reviewChain.select).toHaveBeenCalledWith("id");
    expect(reviewChain.eq).toHaveBeenCalledWith("id", "rev-1");
  });

  it("passes correct payload to upsert", async () => {
    authenticatedUser("user-456");
    const upsertChain = chainMock({ error: null });
    mockOwnershipPassWithTable("review_feedback", upsertChain);

    const { PATCH } = await importRoute();
    await PATCH(
      mockRequest({ item_path: "answer_feedback/q1/strengths/0", item_type: "strength", sentiment: "down" }),
      { params: routeParams }
    );

    expect(upsertChain.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        review_id: "rev-1",
        user_id: "user-456",
        item_path: "answer_feedback/q1/strengths/0",
        item_type: "strength",
        sentiment: "down",
      }),
      { onConflict: "review_id,user_id,item_path" }
    );
  });

  it("deletes feedback when sentiment key is omitted (undefined)", async () => {
    authenticatedUser();
    const deleteChain = chainMock(undefined);
    deleteChain.delete = vi.fn(() => deleteChain);
    deleteChain.eq = vi.fn(() => ({
      ...deleteChain,
      eq: vi.fn(() => ({
        ...deleteChain,
        eq: vi.fn(() => Promise.resolve({ error: null })),
      })),
    }));
    mockOwnershipPassWithTable("review_feedback", deleteChain);

    const { PATCH } = await importRoute();
    // Body has no sentiment key at all
    const res = await PATCH(
      mockRequest({ item_path: "criteria_scores/c1", item_type: "criteria_score" }),
      { params: routeParams }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("deleted");
  });

  it("returns 500 when delete fails", async () => {
    authenticatedUser();
    const deleteChain = chainMock(undefined);
    deleteChain.delete = vi.fn(() => deleteChain);
    deleteChain.eq = vi.fn(() => ({
      ...deleteChain,
      eq: vi.fn(() => ({
        ...deleteChain,
        eq: vi.fn(() => Promise.resolve({ error: { message: "internal error" } })),
      })),
    }));
    mockOwnershipPassWithTable("review_feedback", deleteChain);

    const { PATCH } = await importRoute();
    const res = await PATCH(
      mockRequest({ item_path: "criteria_scores/c1", item_type: "criteria_score", sentiment: null }),
      { params: routeParams }
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Failed to delete feedback");
  });
});
