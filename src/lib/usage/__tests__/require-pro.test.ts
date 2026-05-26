import { describe, it, expect, vi, beforeEach } from "vitest";

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
});

function chainMock(resolvedValue: unknown) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  chain.select = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.single = vi.fn(() => Promise.resolve(resolvedValue));
  return chain;
}

describe("requirePro", () => {
  async function importGuard() {
    return import("../require-pro");
  }

  it("returns 401 when unauthenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const { requirePro, isGuardError } = await importGuard();
    const result = await requirePro();
    expect(isGuardError(result)).toBe(true);
    if (isGuardError(result)) expect(result.status).toBe(401);
  });

  it("returns 403 when user is free tier", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    mockFrom.mockReturnValue(
      chainMock({ data: { subscription_tier: "free" }, error: null })
    );
    const { requirePro, isGuardError } = await importGuard();
    const result = await requirePro();
    expect(isGuardError(result)).toBe(true);
    if (isGuardError(result)) expect(result.status).toBe(403);
  });

  it("returns userId on success for pro tier", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    mockFrom.mockReturnValue(
      chainMock({ data: { subscription_tier: "pro" }, error: null })
    );
    const { requirePro, isGuardError } = await importGuard();
    const result = await requirePro();
    expect(isGuardError(result)).toBe(false);
    if (!isGuardError(result)) expect(result.userId).toBe("user-1");
  });
});
