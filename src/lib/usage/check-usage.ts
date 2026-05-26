import { SupabaseClient } from "@supabase/supabase-js";
import { getUsagePeriod } from "./period";
import { TIER_CREDITS } from "./credits";

export interface UsageResult {
  allowed: boolean;
  used: number;
  limit: number;
  bonus: number;
  remaining: number;
  period: string;
  resetDate: Date;
}

export async function checkUsage(
  supabase: SupabaseClient,
  userId: string
): Promise<UsageResult> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("subscription_tier, current_period_end")
    .eq("id", userId)
    .single();

  const tier = profile?.subscription_tier ?? "free";
  const limit = TIER_CREDITS[tier] ?? TIER_CREDITS.free;
  const { periodKey: period, resetDate } = getUsagePeriod(tier, profile?.current_period_end);

  const { data: usage } = await supabase
    .from("usage")
    .select("credits_used, credits_limit, bonus_reviews")
    .eq("user_id", userId)
    .eq("period", period)
    .single();

  if (!usage) {
    return {
      allowed: limit > 0,
      used: 0,
      limit,
      bonus: 0,
      remaining: limit,
      period,
      resetDate,
    };
  }

  const effectiveLimit = (usage.credits_limit ?? limit) + (usage.bonus_reviews ?? 0);
  const periodRemaining = Math.max(0, effectiveLimit - (usage.credits_used ?? 0));
  const remaining = periodRemaining;

  return {
    allowed: remaining > 0,
    used: usage.credits_used ?? 0,
    limit: usage.credits_limit ?? limit,
    bonus: usage.bonus_reviews ?? 0,
    remaining,
    period,
    resetDate,
  };
}
