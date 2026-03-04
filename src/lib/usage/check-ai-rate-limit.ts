import { createServiceClient } from "@/lib/supabase/server";

const AI_DAILY_LIMIT = 30;

export interface AiRateLimitResult {
  allowed: boolean;
  count: number;
  limit: number;
}

export async function checkAndIncrementAiUsage(
  userId: string
): Promise<AiRateLimitResult> {
  const supabase = createServiceClient();

  const { data, error } = await supabase.rpc("increment_ai_daily_usage", {
    p_user_id: userId,
    p_limit: AI_DAILY_LIMIT,
  });

  if (error) {
    if (error.message?.includes("AI_RATE_LIMIT_EXCEEDED")) {
      return { allowed: false, count: AI_DAILY_LIMIT, limit: AI_DAILY_LIMIT };
    }
    // Fail open on unexpected errors
    console.error("AI rate limit check failed, allowing request:", error);
    return { allowed: true, count: 0, limit: AI_DAILY_LIMIT };
  }

  return { allowed: true, count: data as number, limit: AI_DAILY_LIMIT };
}
