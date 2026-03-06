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
    expect(result.purchased).toBe(0);
  });

  it("basic user gets 30 credits", async () => {
    const supabase = createMockSupabase(
      { subscription_tier: "basic" },
      null
    );

    const result = await checkUsage(supabase, "user-1");

    expect(result.allowed).toBe(true);
    expect(result.limit).toBe(30);
    expect(result.remaining).toBe(30);
    expect(result.purchased).toBe(0);
  });

  it("pro user gets 100 credits", async () => {
    const supabase = createMockSupabase(
      { subscription_tier: "pro" },
      null
    );

    const result = await checkUsage(supabase, "user-1");

    expect(result.allowed).toBe(true);
    expect(result.limit).toBe(100);
    expect(result.remaining).toBe(100);
    expect(result.purchased).toBe(0);
  });

  it("purchased credits are included in remaining", async () => {
    const supabase = createMockSupabase(
      { subscription_tier: "basic", purchased_credits: 10 },
      null
    );

    const result = await checkUsage(supabase, "user-1");

    expect(result.allowed).toBe(true);
    expect(result.limit).toBe(30);
    expect(result.purchased).toBe(10);
    expect(result.remaining).toBe(40);
  });

  it("purchased credits keep user allowed when period credits exhausted", async () => {
    const supabase = createMockSupabase(
      { subscription_tier: "basic", purchased_credits: 5 },
      { credits_used: 30, credits_limit: 30, bonus_reviews: 0 }
    );

    const result = await checkUsage(supabase, "user-1");

    expect(result.allowed).toBe(true);
    expect(result.used).toBe(30);
    expect(result.remaining).toBe(5);
    expect(result.purchased).toBe(5);
  });

  it("free user with purchased credits is allowed", async () => {
    const supabase = createMockSupabase(
      { subscription_tier: "free", purchased_credits: 3 },
      null
    );

    const result = await checkUsage(supabase, "user-1");

    expect(result.allowed).toBe(true);
    expect(result.limit).toBe(0);
    expect(result.purchased).toBe(3);
    expect(result.remaining).toBe(3);
  });

  it("bonus reviews still work", async () => {
    const supabase = createMockSupabase(
      { subscription_tier: "basic" },
      { credits_used: 30, credits_limit: 30, bonus_reviews: 5 }
    );

    const result = await checkUsage(supabase, "user-1");

    expect(result.allowed).toBe(true);
    expect(result.used).toBe(30);
    expect(result.bonus).toBe(5);
    expect(result.remaining).toBe(5);
  });

  it("bonus reviews combined with purchased credits", async () => {
    const supabase = createMockSupabase(
      { subscription_tier: "basic", purchased_credits: 3 },
      { credits_used: 30, credits_limit: 30, bonus_reviews: 5 }
    );

    const result = await checkUsage(supabase, "user-1");

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(8); // 5 bonus remaining + 3 purchased
    expect(result.bonus).toBe(5);
    expect(result.purchased).toBe(3);
  });

  it("no usage row returns full allowance plus purchased credits", async () => {
    const supabase = createMockSupabase(
      { subscription_tier: "pro", purchased_credits: 7 },
      null
    );

    const result = await checkUsage(supabase, "user-1");

    expect(result.allowed).toBe(true);
    expect(result.used).toBe(0);
    expect(result.limit).toBe(100);
    expect(result.purchased).toBe(7);
    expect(result.remaining).toBe(107);
    expect(result.bonus).toBe(0);
  });

  it("returns allowed=false when all credits exhausted (no purchased)", async () => {
    const supabase = createMockSupabase(
      { subscription_tier: "basic" },
      { credits_used: 30, credits_limit: 30, bonus_reviews: 0 }
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
    expect(result.limit).toBe(100);
  });

  it("returns billing period key for basic user with current_period_end", async () => {
    vi.useFakeTimers({ now: new Date("2026-02-20T12:00:00Z") });

    const supabase = createMockSupabase(
      { subscription_tier: "basic", current_period_end: "2026-03-10T00:00:00Z" },
      null
    );

    const result = await checkUsage(supabase, "user-1");

    expect(result.period).toBe("2026-02-10");
    expect(result.resetDate).toEqual(new Date("2026-03-10T00:00:00Z"));
    expect(result.limit).toBe(30);
  });

  it("defaults to free tier when profile is null (blocked)", async () => {
    const supabase = createMockSupabase(null, null);

    const result = await checkUsage(supabase, "user-1");

    expect(result.limit).toBe(0);
    expect(result.remaining).toBe(0);
    expect(result.allowed).toBe(false);
    expect(result.purchased).toBe(0);
  });

  it("returns allowed=false when over limit (used > limit)", async () => {
    const supabase = createMockSupabase(
      { subscription_tier: "basic" },
      { credits_used: 35, credits_limit: 30, bonus_reviews: 0 }
    );

    const result = await checkUsage(supabase, "user-1");

    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });
});
