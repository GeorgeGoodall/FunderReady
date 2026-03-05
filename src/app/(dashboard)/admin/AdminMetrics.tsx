"use client";

import { useState, useEffect } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

interface AggregateData {
  total_calls: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cost_usd: number;
  total_cost_gbp: number;
  by_step: Record<string, number>;
  by_model: Record<string, number>;
}

interface RecentLog {
  id: string;
  pipeline_step: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
  cost_usd: number;
  cost_gbp: number;
  is_retry: boolean;
  created_at: string;
}

interface RecentReview {
  id: string;
  application_id: string;
  status: string;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cache_creation_tokens: number;
  total_cache_read_tokens: number;
  total_cost_usd: number;
  total_cost_gbp: number;
  created_at: string;
}

interface PlatformStats {
  users: number;
  applications: number;
  completed_reviews: number;
  funds: number;
  organisations: number;
}

interface ScrapingData {
  total_calls: number;
  filter_links_calls: number;
  relevance_check_calls: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cost_usd: number;
  total_cost_gbp: number;
}

interface MetricsData {
  all_time: AggregateData;
  last_30_days: AggregateData;
  recent_logs: RecentLog[];
  recent_reviews: RecentReview[];
  scraping: {
    all_time: ScrapingData;
    last_30_days: ScrapingData;
  };
  platform: PlatformStats;
}

function formatCost(usd: number, gbp: number): string {
  return `$${usd.toFixed(4)} / £${gbp.toFixed(4)}`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")} ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

function shortModel(model: string): string {
  if (model.includes("haiku")) return "Haiku";
  if (model.includes("sonnet")) return "Sonnet";
  return model;
}

function SummaryCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-zinc-500">{sub}</p>}
    </div>
  );
}

function MiniCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="text-lg font-semibold">{value.toLocaleString()}</p>
    </div>
  );
}

export function AdminMetrics() {
  const [data, setData] = useState<MetricsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/metrics")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load metrics");
        return res.json();
      })
      .then(setData)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-sm text-zinc-500">Loading metrics...</p>;
  if (error) return <p className="text-sm text-red-500">Error: {error}</p>;
  if (!data) return null;

  const { all_time, last_30_days, recent_logs, recent_reviews, scraping, platform } = data;

  // Build chart data from all_time.by_step
  const chartData = Object.entries(all_time.by_step).map(([step, count]) => ({
    step: step.replace(/_/g, " "),
    calls: count,
  }));

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryCard
          label="Total AI Cost"
          value={`$${all_time.total_cost_usd.toFixed(2)}`}
          sub={`£${all_time.total_cost_gbp.toFixed(2)}`}
        />
        <SummaryCard label="API Calls" value={all_time.total_calls.toLocaleString()} />
        <SummaryCard
          label="Total Tokens"
          value={formatTokens(all_time.total_input_tokens + all_time.total_output_tokens)}
          sub={`${formatTokens(all_time.total_input_tokens)} in / ${formatTokens(all_time.total_output_tokens)} out`}
        />
        <SummaryCard
          label="Cost Last 30 Days"
          value={`$${last_30_days.total_cost_usd.toFixed(2)}`}
          sub={`${last_30_days.total_calls} calls`}
        />
      </div>

      {/* Platform Stats */}
      <div>
        <h3 className="mb-2 text-sm font-semibold text-zinc-600 dark:text-zinc-400">Platform</h3>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          <MiniCard label="Users" value={platform.users} />
          <MiniCard label="Applications" value={platform.applications} />
          <MiniCard label="Reviews" value={platform.completed_reviews} />
          <MiniCard label="Funds" value={platform.funds} />
          <MiniCard label="Organisations" value={platform.organisations} />
        </div>
      </div>

      {/* Scraping Costs */}
      {scraping.all_time.total_calls > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-zinc-600 dark:text-zinc-400">Scraping Costs</h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <SummaryCard
              label="Scraping Cost (All Time)"
              value={`$${scraping.all_time.total_cost_usd.toFixed(4)}`}
              sub={`£${scraping.all_time.total_cost_gbp.toFixed(4)}`}
            />
            <SummaryCard
              label="Scraping Cost (30 Days)"
              value={`$${scraping.last_30_days.total_cost_usd.toFixed(4)}`}
              sub={`${scraping.last_30_days.total_calls} calls`}
            />
            <SummaryCard
              label="Filter Links Calls"
              value={scraping.all_time.filter_links_calls.toLocaleString()}
              sub={`${scraping.last_30_days.filter_links_calls} last 30 days`}
            />
            <SummaryCard
              label="Relevance Checks"
              value={scraping.all_time.relevance_check_calls.toLocaleString()}
              sub={`${scraping.last_30_days.relevance_check_calls} last 30 days`}
            />
          </div>
        </div>
      )}

      {/* Bar Chart */}
      {chartData.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-zinc-600 dark:text-zinc-400">API Calls by Pipeline Step</h3>
          <div className="h-48 rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="step" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="calls" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Recent Reviews Table */}
      {recent_reviews.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-zinc-600 dark:text-zinc-400">Recent Reviews</h3>
          <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-50 dark:bg-zinc-800/50">
                <tr>
                  <th className="px-3 py-2 font-medium">Date</th>
                  <th className="px-3 py-2 font-medium">Input</th>
                  <th className="px-3 py-2 font-medium">Output</th>
                  <th className="px-3 py-2 font-medium">Cache</th>
                  <th className="px-3 py-2 font-medium">Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {recent_reviews.map((r) => (
                  <tr key={r.id} className="bg-white dark:bg-zinc-900">
                    <td className="whitespace-nowrap px-3 py-2">{formatDate(r.created_at)}</td>
                    <td className="px-3 py-2">{formatTokens(r.total_input_tokens)}</td>
                    <td className="px-3 py-2">{formatTokens(r.total_output_tokens)}</td>
                    <td className="px-3 py-2">{formatTokens(r.total_cache_creation_tokens + r.total_cache_read_tokens)}</td>
                    <td className="whitespace-nowrap px-3 py-2">{formatCost(r.total_cost_usd, r.total_cost_gbp)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Recent API Calls Table */}
      {recent_logs.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-zinc-600 dark:text-zinc-400">Recent API Calls</h3>
          <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-50 dark:bg-zinc-800/50">
                <tr>
                  <th className="px-3 py-2 font-medium">Date</th>
                  <th className="px-3 py-2 font-medium">Step</th>
                  <th className="px-3 py-2 font-medium">Model</th>
                  <th className="px-3 py-2 font-medium">In</th>
                  <th className="px-3 py-2 font-medium">Out</th>
                  <th className="px-3 py-2 font-medium">Cache W/R</th>
                  <th className="px-3 py-2 font-medium">Cost</th>
                  <th className="px-3 py-2 font-medium">Retry</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {recent_logs.map((log) => (
                  <tr key={log.id} className="bg-white dark:bg-zinc-900">
                    <td className="whitespace-nowrap px-3 py-2">{formatDate(log.created_at)}</td>
                    <td className="px-3 py-2">{log.pipeline_step.replace(/_/g, " ")}</td>
                    <td className="px-3 py-2">{shortModel(log.model)}</td>
                    <td className="px-3 py-2">{formatTokens(log.input_tokens)}</td>
                    <td className="px-3 py-2">{formatTokens(log.output_tokens)}</td>
                    <td className="px-3 py-2">{formatTokens(log.cache_creation_input_tokens)}/{formatTokens(log.cache_read_input_tokens)}</td>
                    <td className="whitespace-nowrap px-3 py-2">{formatCost(log.cost_usd, log.cost_gbp)}</td>
                    <td className="px-3 py-2">{log.is_retry ? "Yes" : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
