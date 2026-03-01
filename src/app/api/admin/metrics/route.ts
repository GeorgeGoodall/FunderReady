import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const serviceClient = createServiceClient();
  const { data: profile } = await serviceClient
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();

  if (!profile?.is_admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Run queries in parallel
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [
    allLogsRes,
    recentLogsRes,
    last30Res,
    recentReviewsRes,
    profilesCount,
    applicationsCount,
    completedReviewsCount,
    fundsCount,
    orgsCount,
  ] = await Promise.all([
    // All-time aggregates
    serviceClient.from("ai_usage_logs").select("pipeline_step, model, input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens, cost_usd, cost_gbp"),
    // Recent 50 logs
    serviceClient
      .from("ai_usage_logs")
      .select("id, pipeline_step, model, input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens, cost_usd, cost_gbp, is_retry, created_at")
      .order("created_at", { ascending: false })
      .limit(50),
    // Last 30 days logs
    serviceClient
      .from("ai_usage_logs")
      .select("pipeline_step, model, input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens, cost_usd, cost_gbp")
      .gte("created_at", thirtyDaysAgo),
    // Recent reviews with cost columns
    serviceClient
      .from("application_reviews")
      .select("id, application_id, status, total_input_tokens, total_output_tokens, total_cache_creation_tokens, total_cache_read_tokens, total_cost_usd, total_cost_gbp, created_at")
      .eq("status", "completed")
      .order("created_at", { ascending: false })
      .limit(20),
    // Platform counts
    serviceClient.from("profiles").select("id", { count: "exact", head: true }),
    serviceClient.from("applications").select("id", { count: "exact", head: true }),
    serviceClient.from("application_reviews").select("id", { count: "exact", head: true }).eq("status", "completed"),
    serviceClient.from("funds").select("id", { count: "exact", head: true }),
    serviceClient.from("organisations").select("id", { count: "exact", head: true }),
  ]);

  function aggregate(logs: typeof allLogsRes.data) {
    if (!logs) return { total_calls: 0, total_input_tokens: 0, total_output_tokens: 0, total_cost_usd: 0, total_cost_gbp: 0, by_step: {} as Record<string, number>, by_model: {} as Record<string, number> };

    let total_input_tokens = 0;
    let total_output_tokens = 0;
    let total_cost_usd = 0;
    let total_cost_gbp = 0;
    const by_step: Record<string, number> = {};
    const by_model: Record<string, number> = {};

    for (const log of logs) {
      total_input_tokens += log.input_tokens;
      total_output_tokens += log.output_tokens;
      total_cost_usd += Number(log.cost_usd);
      total_cost_gbp += Number(log.cost_gbp);
      by_step[log.pipeline_step] = (by_step[log.pipeline_step] ?? 0) + 1;
      by_model[log.model] = (by_model[log.model] ?? 0) + 1;
    }

    return {
      total_calls: logs.length,
      total_input_tokens,
      total_output_tokens,
      total_cost_usd: Math.round(total_cost_usd * 1_000_000) / 1_000_000,
      total_cost_gbp: Math.round(total_cost_gbp * 1_000_000) / 1_000_000,
      by_step,
      by_model,
    };
  }

  return NextResponse.json({
    all_time: aggregate(allLogsRes.data),
    last_30_days: aggregate(last30Res.data),
    recent_logs: recentLogsRes.data ?? [],
    recent_reviews: recentReviewsRes.data ?? [],
    platform: {
      users: profilesCount.count ?? 0,
      applications: applicationsCount.count ?? 0,
      completed_reviews: completedReviewsCount.count ?? 0,
      funds: fundsCount.count ?? 0,
      organisations: orgsCount.count ?? 0,
    },
  });
}
