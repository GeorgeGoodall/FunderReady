import { describe, it, expect, vi, afterEach } from "vitest";
import { checkUsage } from "../check-usage";

function createMockSupabase(profileData: unknown, usageData: unknown) {
  return {
    from: vi.fn((table: string) => {
      if (table === "profiles") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: profileData, error: null }),
            }),
          }),
        };
      }
      if (table === "usage") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: usageData, error: null }),
              }),
            }),
          }),
        };
      }
      return {};
    }),
  } as never;
}

describe("checkUsage", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns defaults when no usage row exists", async () => {
    const supabase = createMockSupabase(
      { subscription_tier: "free" },
      null
    );

    const result = await checkUsage(supabase, "user-1");

    expect(result.allowed).toBe(true);
    expect(result.used).toBe(0);
    expect(result.limit).toBe(1);
    expect(result.remaining).toBe(1);
    expect(result.bonus).toBe(0);
  });

  it("returns correct values for a free user with existing usage", async () => {
    const supabase = createMockSupabase(
      { subscription_tier: "free" },
      { reviews_used: 2, reviews_limit: 3, bonus_reviews: 0 }
    );

    const result = await checkUsage(supabase, "user-1");

    expect(result.allowed).toBe(true);
    expect(result.used).toBe(2);
    expect(result.remaining).toBe(1);
  });

  it("returns allowed=false when at limit", async () => {
    const supabase = createMockSupabase(
      { subscription_tier: "free" },
      { reviews_used: 3, reviews_limit: 3, bonus_reviews: 0 }
    );

    const result = await checkUsage(supabase, "user-1");

    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("accounts for bonus reviews", async () => {
    const supabase = createMockSupabase(
      { subscription_tier: "free" },
      { reviews_used: 3, reviews_limit: 3, bonus_reviews: 2 }
    );

    const result = await checkUsage(supabase, "user-1");

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(2);
    expect(result.bonus).toBe(2);
  });

  it("uses pro limits for pro users", async () => {
    const supabase = createMockSupabase(
      { subscription_tier: "pro" },
      null
    );

    const result = await checkUsage(supabase, "user-1");

    expect(result.limit).toBe(10);
    expect(result.remaining).toBe(10);
  });

  it("returns period in YYYY-MM format for free user", async () => {
    const supabase = createMockSupabase(
      { subscription_tier: "free" },
      null
    );

    const result = await checkUsage(supabase, "user-1");

    expect(result.period).toMatch(/^\d{4}-\d{2}$/);
    expect(result.resetDate).toBeInstanceOf(Date);
  });

  it("returns billing period key for pro user with current_period_end", async () => {
    vi.useFakeTimers({ now: new Date("2026-02-20T12:00:00Z") });

    const supabase = createMockSupabase(
      { subscription_tier: "pro", current_period_end: "2026-03-15T00:00:00Z" },
      null
    );

    const result = await checkUsage(supabase, "user-1");

    expect(result.period).toBe("2026-02-15");
    expect(result.resetDate).toEqual(new Date("2026-03-15T00:00:00Z"));
    expect(result.limit).toBe(10);
  });

  it("defaults to free tier when profile is null", async () => {
    const supabase = createMockSupabase(null, null);

    const result = await checkUsage(supabase, "user-1");

    expect(result.limit).toBe(1);
    expect(result.remaining).toBe(1);
    expect(result.allowed).toBe(true);
  });

  it("returns allowed=false when over limit (used > limit)", async () => {
    const supabase = createMockSupabase(
      { subscription_tier: "free" },
      { reviews_used: 5, reviews_limit: 3, bonus_reviews: 0 }
    );

    const result = await checkUsage(supabase, "user-1");

    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });
});
