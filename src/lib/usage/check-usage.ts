import { SupabaseClient } from "@supabase/supabase-js";

const TIER_LIMITS: Record<string, number> = {
  free: 3,
  pro: 50,
};

export interface UsageResult {
  allowed: boolean;
  used: number;
  limit: number;
  bonus: number;
  remaining: number;
  period: string;
}

export async function checkUsage(
  supabase: SupabaseClient,
  userId: string
): Promise<UsageResult> {
  const period = new Date().toISOString().slice(0, 7); // "YYYY-MM"

  // Get user's subscription tier
  const { data: profile } = await supabase
    .from("profiles")
    .select("subscription_tier")
    .eq("id", userId)
    .single();

  const tier = profile?.subscription_tier ?? "free";
  const limit = TIER_LIMITS[tier] ?? TIER_LIMITS.free;

  // Get current period usage
  const { data: usage } = await supabase
    .from("usage")
    .select("reviews_used, reviews_limit, bonus_reviews")
    .eq("user_id", userId)
    .eq("period", period)
    .single();

  if (!usage) {
    return {
      allowed: true,
      used: 0,
      limit,
      bonus: 0,
      remaining: limit,
      period,
    };
  }

  const effectiveLimit = (usage.reviews_limit ?? limit) + (usage.bonus_reviews ?? 0);
  const remaining = Math.max(0, effectiveLimit - (usage.reviews_used ?? 0));

  return {
    allowed: remaining > 0,
    used: usage.reviews_used ?? 0,
    limit: usage.reviews_limit ?? limit,
    bonus: usage.bonus_reviews ?? 0,
    remaining,
    period,
  };
}
