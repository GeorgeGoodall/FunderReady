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

  it("free user gets 0 credits and is not allowed", async () => {
    const supabase = createMockSupabase(
      { subscription_tier: "free" },
      null
    );

    const result = await checkUsage(supabase, "user-1");

    expect(result.allowed).toBe(false);
    expect(result.used).toBe(0);
    expect(result.limit).toBe(0);
    expect(result.remaining).toBe(0);
    expect(result.bonus).toBe(0);
  });

  it("pro user gets 10 credits", async () => {
    const supabase = createMockSupabase(
      { subscription_tier: "pro" },
      null
    );

    const result = await checkUsage(supabase, "user-1");

    expect(result.allowed).toBe(true);
    expect(result.limit).toBe(10);
    expect(result.remaining).toBe(10);
  });

  it("bonus reviews still work", async () => {
    const supabase = createMockSupabase(
      { subscription_tier: "free" },
      { credits_used: 0, credits_limit: 0, bonus_reviews: 5 }
    );

    const result = await checkUsage(supabase, "user-1");

    expect(result.allowed).toBe(true);
    expect(result.used).toBe(0);
    expect(result.bonus).toBe(5);
    expect(result.remaining).toBe(5);
  });

  it("bonus reviews allow user when period credits exhausted", async () => {
    const supabase = createMockSupabase(
      { subscription_tier: "pro" },
      { credits_used: 10, credits_limit: 10, bonus_reviews: 5 }
    );

    const result = await checkUsage(supabase, "user-1");

    expect(result.allowed).toBe(true);
    expect(result.used).toBe(10);
    expect(result.bonus).toBe(5);
    expect(result.remaining).toBe(5);
  });

  it("no usage row returns full tier allowance", async () => {
    const supabase = createMockSupabase(
      { subscription_tier: "pro" },
      null
    );

    const result = await checkUsage(supabase, "user-1");

    expect(result.allowed).toBe(true);
    expect(result.used).toBe(0);
    expect(result.limit).toBe(10);
    expect(result.remaining).toBe(10);
    expect(result.bonus).toBe(0);
  });

  it("returns allowed=false when all credits exhausted (no bonus)", async () => {
    const supabase = createMockSupabase(
      { subscription_tier: "pro" },
      { credits_used: 10, credits_limit: 10, bonus_reviews: 0 }
    );

    const result = await checkUsage(supabase, "user-1");

    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
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

  it("defaults to free tier when profile is null (blocked)", async () => {
    const supabase = createMockSupabase(null, null);

    const result = await checkUsage(supabase, "user-1");

    expect(result.limit).toBe(0);
    expect(result.remaining).toBe(0);
    expect(result.allowed).toBe(false);
  });

  it("returns allowed=false when over limit (used > limit)", async () => {
    const supabase = createMockSupabase(
      { subscription_tier: "pro" },
      { credits_used: 12, credits_limit: 10, bonus_reviews: 0 }
    );

    const result = await checkUsage(supabase, "user-1");

    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("free user with bonus reviews is allowed", async () => {
    const supabase = createMockSupabase(
      { subscription_tier: "free" },
      { credits_used: 0, credits_limit: 0, bonus_reviews: 3 }
    );

    const result = await checkUsage(supabase, "user-1");

    expect(result.allowed).toBe(true);
    expect(result.limit).toBe(0);
    expect(result.bonus).toBe(3);
    expect(result.remaining).toBe(3);
  });
});
