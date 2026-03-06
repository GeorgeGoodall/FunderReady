import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetUser = vi.fn();
const mockFrom = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  })),
  createServiceClient: vi.fn(() => ({
    rpc: vi.fn(),
  })),
}));

const mockCheckAndIncrementAiUsage = vi.fn();
vi.mock("@/lib/usage/check-ai-rate-limit", () => ({
  checkAndIncrementAiUsage: (...args: unknown[]) =>
    mockCheckAndIncrementAiUsage(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

function chainMock(resolvedValue: unknown) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  chain.select = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.single = vi.fn(() => Promise.resolve(resolvedValue));
  return chain;
}

describe("requireProWithRateLimit", () => {
  async function importGuard() {
    const mod = await import("../require-pro-with-rate-limit");
    return mod;
  }

  it("returns 401 when unauthenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const { requireProWithRateLimit, isGuardError } = await importGuard();
    const result = await requireProWithRateLimit();

    expect(isGuardError(result)).toBe(true);
    if (isGuardError(result)) {
      expect(result.status).toBe(401);
    }
  });

  it("returns 403 when user is free tier", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    mockFrom.mockReturnValue(
      chainMock({ data: { subscription_tier: "free" }, error: null })
    );

    const { requireProWithRateLimit, isGuardError } = await importGuard();
    const result = await requireProWithRateLimit();

    expect(isGuardError(result)).toBe(true);
    if (isGuardError(result)) {
      expect(result.status).toBe(403);
    }
  });

  it("returns 429 when rate limit exceeded", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    mockFrom.mockReturnValue(
      chainMock({ data: { subscription_tier: "pro" }, error: null })
    );
    mockCheckAndIncrementAiUsage.mockResolvedValue({
      allowed: false,
      count: 30,
      limit: 30,
    });

    const { requireProWithRateLimit, isGuardError } = await importGuard();
    const result = await requireProWithRateLimit();

    expect(isGuardError(result)).toBe(true);
    if (isGuardError(result)) {
      expect(result.status).toBe(429);
    }
  });

  it("returns userId on success for pro tier", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    mockFrom.mockReturnValue(
      chainMock({ data: { subscription_tier: "pro" }, error: null })
    );
    mockCheckAndIncrementAiUsage.mockResolvedValue({
      allowed: true,
      count: 5,
      limit: 30,
    });

    const { requireProWithRateLimit, isGuardError } = await importGuard();
    const result = await requireProWithRateLimit();

    expect(isGuardError(result)).toBe(false);
    if (!isGuardError(result)) {
      expect(result.userId).toBe("user-1");
    }
  });

  it("returns userId on success for basic tier", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-2" } } });
    mockFrom.mockReturnValue(
      chainMock({ data: { subscription_tier: "basic" }, error: null })
    );
    mockCheckAndIncrementAiUsage.mockResolvedValue({
      allowed: true,
      count: 1,
      limit: 30,
    });

    const { requireProWithRateLimit, isGuardError } = await importGuard();
    const result = await requireProWithRateLimit();

    expect(isGuardError(result)).toBe(false);
    if (!isGuardError(result)) {
      expect(result.userId).toBe("user-2");
    }
  });
});
