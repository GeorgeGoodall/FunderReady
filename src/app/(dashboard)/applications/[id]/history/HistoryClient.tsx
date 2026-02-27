"use client";

import Link from "next/link";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ReviewSummary {
  id: string;
  review_number: number;
  status: string;
  overall_score: number | null;
  submission_readiness: string | null;
  error_message: string | null;
  created_at: string;
}

interface HistoryClientProps {
  application: {
    id: string;
    title: string | null;
    review_count: number;
  };
  fund: { name: string; funder_organisation: string | null } | null;
  reviews: ReviewSummary[];
}

// ---------------------------------------------------------------------------
// Colour helpers
// ---------------------------------------------------------------------------

const READINESS_COLOURS: Record<string, string> = {
  "Ready to submit": "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  "Nearly ready": "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  "Needs revisions": "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  "Major rework needed": "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

function scoreColour(score: number): string {
  if (score >= 75) return "text-green-600 dark:text-green-400";
  if (score >= 50) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

// ---------------------------------------------------------------------------
// Chart
// ---------------------------------------------------------------------------

function ScoreChart({ reviews }: { reviews: ReviewSummary[] }) {
  const completed = reviews.filter(
    (r) => r.status === "completed" && r.overall_score !== null
  );

  if (completed.length < 2) return null;

  const data = completed.map((r) => ({
    review: `#${r.review_number}`,
    score: r.overall_score as number,
  }));

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="mb-4 font-semibold">Score Progress</h2>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-grid, #e4e4e7)" />
          <XAxis
            dataKey="review"
            tick={{ fontSize: 12 }}
            stroke="var(--color-axis, #a1a1aa)"
          />
          <YAxis
            domain={[0, 100]}
            tick={{ fontSize: 12 }}
            stroke="var(--color-axis, #a1a1aa)"
            width={32}
          />
          <Tooltip
            contentStyle={{
              borderRadius: "8px",
              border: "1px solid #e4e4e7",
              fontSize: "12px",
            }}
            labelFormatter={(label) => `Review ${label}`}
          />
          <ReferenceLine y={75} stroke="#16a34a" strokeDasharray="4 4" opacity={0.4} />
          <ReferenceLine y={50} stroke="#d97706" strokeDasharray="4 4" opacity={0.4} />
          <Line
            type="monotone"
            dataKey="score"
            stroke="#2563eb"
            strokeWidth={2}
            dot={{ r: 4, fill: "#2563eb" }}
            activeDot={{ r: 6 }}
          />
        </LineChart>
      </ResponsiveContainer>
      <p className="mt-2 text-xs text-zinc-400">
        Dashed lines: 75 (green) and 50 (amber) thresholds
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Review row
// ---------------------------------------------------------------------------

const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function formatDateUTC(iso: string): string {
  const d = new Date(iso);
  return `${d.getUTCDate()} ${MONTHS_SHORT[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

function ReviewRow({ review, applicationId }: { review: ReviewSummary; applicationId: string }) {
  const date = formatDateUTC(review.created_at);

  return (
    <div className="flex items-center gap-4 px-5 py-3">
      <span className="w-20 shrink-0 text-sm font-medium">
        Review #{review.review_number}
      </span>

      <span className="w-28 shrink-0 text-sm text-zinc-500">{date}</span>

      {/* Score */}
      <span className="w-20 shrink-0">
        {review.status === "completed" && review.overall_score !== null ? (
          <span className={`text-sm font-semibold ${scoreColour(review.overall_score)}`}>
            {review.overall_score}/100
          </span>
        ) : review.status === "failed" ? (
          <span className="text-sm text-red-500">Failed</span>
        ) : (
          <span className="text-sm text-zinc-400">—</span>
        )}
      </span>

      {/* Readiness */}
      <div className="min-w-0 flex-1">
        {review.submission_readiness && (
          <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${READINESS_COLOURS[review.submission_readiness] ?? ""}`}>
            {review.submission_readiness}
          </span>
        )}
        {review.status === "failed" && review.error_message && (
          <span className="text-xs text-zinc-500">{review.error_message}</span>
        )}
      </div>

      {/* View link */}
      {review.status === "completed" && (
        <Link
          href={`/applications/${applicationId}/review?reviewNumber=${review.review_number}`}
          className="shrink-0 text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
        >
          View
        </Link>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export function HistoryClient({ application, fund, reviews }: HistoryClientProps) {
  const title = application.title ?? fund?.name ?? "Application";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="mb-1 flex items-center gap-2 text-sm text-zinc-500">
          <Link href="/dashboard" className="hover:text-zinc-700 dark:hover:text-zinc-300">
            Dashboard
          </Link>
          <span>/</span>
          <Link
            href={`/applications/${application.id}`}
            className="hover:text-zinc-700 dark:hover:text-zinc-300"
          >
            {title}
          </Link>
          <span>/</span>
          <span>Review History</span>
        </div>
        <h1 className="text-2xl font-bold">Review History</h1>
        {fund && (
          <p className="mt-0.5 text-sm text-zinc-500">
            {fund.name}
            {fund.funder_organisation ? ` — ${fund.funder_organisation}` : ""}
          </p>
        )}
      </div>

      {/* Score chart */}
      <ScoreChart reviews={reviews} />

      {/* Review list */}
      <div className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="border-b border-zinc-200 px-5 py-3 dark:border-zinc-800">
          <h2 className="font-semibold">
            All Reviews
            <span className="ml-2 text-sm font-normal text-zinc-400">
              {reviews.length} total
            </span>
          </h2>
        </div>

        {reviews.length === 0 ? (
          <p className="px-5 py-4 text-sm text-zinc-500">No reviews yet.</p>
        ) : (
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {[...reviews].reverse().map((r) => (
              <ReviewRow key={r.id} review={r} applicationId={application.id} />
            ))}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-3 border-t border-zinc-200 pt-6 dark:border-zinc-800">
        <Link
          href={`/applications/${application.id}`}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
        >
          Edit Application
        </Link>

        <Link
          href="/dashboard"
          className="text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
        >
          Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
