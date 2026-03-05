import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";

interface AggregateRow {
  pipeline_step: string;
  model: string;
  total_calls: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cost_usd: number;
  total_cost_gbp: number;
}

interface ScrapingAggregateRow {
  pipeline_step: string;
  total_calls: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cost_usd: number;
  total_cost_gbp: number;
}

export async function GET() {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const { serviceClient } = auth;

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const scrapingSteps = ["filter_links", "check_criteria_relevance"];

  // Use SQL aggregation instead of fetching all rows
  const [
    allTimeAgg,
    last30Agg,
    recentLogsRes,
    recentReviewsRes,
    profilesCount,
    applicationsCount,
    completedReviewsCount,
    fundsCount,
    orgsCount,
    scrapingAllTimeAgg,
    scrapingLast30Agg,
  ] = await Promise.all([
    // All-time aggregates grouped by step and model
    serviceClient.rpc("aggregate_ai_usage", {}).select() as unknown as {
      data: AggregateRow[] | null;
      error: { message: string } | null;
    },
    // Last 30 days aggregates
    serviceClient.rpc("aggregate_ai_usage_since", { since_date: thirtyDaysAgo }).select() as unknown as {
      data: AggregateRow[] | null;
      error: { message: string } | null;
    },
    // Recent 50 logs (small result set, fine to fetch rows)
    serviceClient
      .from("ai_usage_logs")
      .select("id, pipeline_step, model, input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens, cost_usd, cost_gbp, is_retry, created_at")
      .order("created_at", { ascending: false })
      .limit(50),
    // Recent reviews
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
    serviceClient.from("funds").select("id", { count: "exact", head: true }).eq("rejected", false),
    serviceClient.from("organisations").select("id", { count: "exact", head: true }).eq("rejected", false),
    // Scraping-specific: all-time
    serviceClient.rpc("aggregate_scraping_usage", {}).select() as unknown as {
      data: ScrapingAggregateRow[] | null;
      error: { message: string } | null;
    },
    // Scraping-specific: last 30 days
    serviceClient.rpc("aggregate_scraping_usage_since", { since_date: thirtyDaysAgo }).select() as unknown as {
      data: ScrapingAggregateRow[] | null;
      error: { message: string } | null;
    },
  ]);

  // Check for query errors
  const errors: string[] = [];
  if (allTimeAgg.error) errors.push(`all_time: ${allTimeAgg.error.message}`);
  if (last30Agg.error) errors.push(`last_30_days: ${last30Agg.error.message}`);
  if (recentLogsRes.error) errors.push(`recent_logs: ${recentLogsRes.error.message}`);
  if (recentReviewsRes.error) errors.push(`recent_reviews: ${recentReviewsRes.error.message}`);
  if (scrapingAllTimeAgg.error) errors.push(`scraping_all_time: ${scrapingAllTimeAgg.error.message}`);
  if (scrapingLast30Agg.error) errors.push(`scraping_last_30: ${scrapingLast30Agg.error.message}`);

  function assembleAggregate(rows: AggregateRow[] | null) {
    const empty = { total_calls: 0, total_input_tokens: 0, total_output_tokens: 0, total_cost_usd: 0, total_cost_gbp: 0, by_step: {} as Record<string, number>, by_model: {} as Record<string, number> };
    if (!rows) return empty;

    let total_calls = 0;
    let total_input_tokens = 0;
    let total_output_tokens = 0;
    let total_cost_usd = 0;
    let total_cost_gbp = 0;
    const by_step: Record<string, number> = {};
    const by_model: Record<string, number> = {};

    for (const row of rows) {
      total_calls += Number(row.total_calls);
      total_input_tokens += Number(row.total_input_tokens);
      total_output_tokens += Number(row.total_output_tokens);
      total_cost_usd += Number(row.total_cost_usd);
      total_cost_gbp += Number(row.total_cost_gbp);
      by_step[row.pipeline_step] = (by_step[row.pipeline_step] ?? 0) + Number(row.total_calls);
      by_model[row.model] = (by_model[row.model] ?? 0) + Number(row.total_calls);
    }

    return {
      total_calls,
      total_input_tokens,
      total_output_tokens,
      total_cost_usd: Math.round(total_cost_usd * 1_000_000) / 1_000_000,
      total_cost_gbp: Math.round(total_cost_gbp * 1_000_000) / 1_000_000,
      by_step,
      by_model,
    };
  }

  function assembleScrapingAggregate(rows: ScrapingAggregateRow[] | null) {
    const empty = { total_calls: 0, filter_links_calls: 0, relevance_check_calls: 0, total_input_tokens: 0, total_output_tokens: 0, total_cost_usd: 0, total_cost_gbp: 0 };
    if (!rows) return empty;

    let filter_links_calls = 0;
    let relevance_check_calls = 0;
    let total_input_tokens = 0;
    let total_output_tokens = 0;
    let total_cost_usd = 0;
    let total_cost_gbp = 0;

    for (const row of rows) {
      if (row.pipeline_step === "filter_links") filter_links_calls += Number(row.total_calls);
      else relevance_check_calls += Number(row.total_calls);
      total_input_tokens += Number(row.total_input_tokens);
      total_output_tokens += Number(row.total_output_tokens);
      total_cost_usd += Number(row.total_cost_usd);
      total_cost_gbp += Number(row.total_cost_gbp);
    }

    return {
      total_calls: filter_links_calls + relevance_check_calls,
      filter_links_calls,
      relevance_check_calls,
      total_input_tokens,
      total_output_tokens,
      total_cost_usd: Math.round(total_cost_usd * 1_000_000) / 1_000_000,
      total_cost_gbp: Math.round(total_cost_gbp * 1_000_000) / 1_000_000,
    };
  }

  return NextResponse.json({
    all_time: assembleAggregate(allTimeAgg.data),
    last_30_days: assembleAggregate(last30Agg.data),
    recent_logs: recentLogsRes.data ?? [],
    recent_reviews: recentReviewsRes.data ?? [],
    scraping: {
      all_time: assembleScrapingAggregate(scrapingAllTimeAgg.data),
      last_30_days: assembleScrapingAggregate(scrapingLast30Agg.data),
    },
    platform: {
      users: profilesCount.count ?? 0,
      applications: applicationsCount.count ?? 0,
      completed_reviews: completedReviewsCount.count ?? 0,
      funds: fundsCount.count ?? 0,
      organisations: orgsCount.count ?? 0,
    },
    ...(errors.length > 0 ? { warnings: errors } : {}),
  });
}
