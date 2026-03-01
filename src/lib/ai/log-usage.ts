/**
 * Logs AI token usage to the ai_usage_logs table.
 * Catches and logs errors silently — never breaks callers.
 */

import { createServiceClient } from "@/lib/supabase/server";
import { calculateCost, type TokenUsage } from "./pricing";

export interface LogAiUsageParams {
  applicationReviewId?: string;
  userId?: string;
  pipelineStep: string;
  model: string;
  usage: TokenUsage;
  isRetry?: boolean;
}

export async function logAiUsage(params: LogAiUsageParams): Promise<void> {
  try {
    const { cost_usd, cost_gbp } = calculateCost(params.model, params.usage);
    const supabase = createServiceClient();

    await supabase.from("ai_usage_logs").insert({
      application_review_id: params.applicationReviewId ?? null,
      user_id: params.userId ?? null,
      pipeline_step: params.pipelineStep,
      model: params.model,
      input_tokens: params.usage.input_tokens,
      output_tokens: params.usage.output_tokens,
      cache_creation_input_tokens: params.usage.cache_creation_input_tokens ?? 0,
      cache_read_input_tokens: params.usage.cache_read_input_tokens ?? 0,
      cost_usd,
      cost_gbp,
      is_retry: params.isRetry ?? false,
    });
  } catch (error) {
    console.error("[log-usage] Failed to log AI usage:", error);
  }
}
