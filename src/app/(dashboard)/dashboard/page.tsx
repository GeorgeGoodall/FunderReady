import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Fetch applications
  const { data: applications } = await supabase
    .from("applications")
    .select("id, title, status, review_count, updated_at, fund_id, funds(name)")
    .eq("user_id", user!.id)
    .order("updated_at", { ascending: false });

  // Fetch legacy reviews
  const { data: reviews } = await supabase
    .from("reviews")
    .select("id, status, bid_file_name, created_at")
    .eq("user_id", user!.id)
    .order("created_at", { ascending: false });

  const hasApplications = applications && applications.length > 0;
  const hasReviews = reviews && reviews.length > 0;
  const hasNothing = !hasApplications && !hasReviews;

  return (
    <div className="space-y-10">
      {/* Applications section */}
      <div>
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Your Applications</h1>
          <Link
            href="/applications/new"
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
          >
            New Application
          </Link>
        </div>

        {hasNothing && (
          <div className="mt-16 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800">
              <svg
                className="h-8 w-8 text-zinc-400"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
                />
              </svg>
            </div>
            <h2 className="text-lg font-semibold">No applications yet</h2>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              Select a fund, fill out the application form, and get AI-powered feedback.
            </p>
            <Link
              href="/applications/new"
              className="mt-6 inline-block rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700"
            >
              Start your first application
            </Link>
          </div>
        )}

        {hasApplications && (
          <div className="mt-6 space-y-3">
            {applications.map((app) => {
              const fundName = (app as unknown as { funds: { name: string }[] | null }).funds?.[0]?.name;
              return (
                <Link
                  key={app.id}
                  href={`/applications/${app.id}`}
                  className="block rounded-lg border border-zinc-200 bg-white p-4 transition-colors hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">
                      {app.title ?? fundName ?? "Untitled application"}
                    </span>
                    <ApplicationStatusBadge status={app.status} />
                  </div>
                  <div className="mt-1 flex items-center gap-3 text-xs text-zinc-500">
                    {fundName && <span>{fundName}</span>}
                    <span>
                      Updated{" "}
                      {new Date(app.updated_at).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </span>
                    {app.review_count > 0 && (
                      <span>
                        {app.review_count} review{app.review_count !== 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* Legacy reviews section */}
      {hasReviews && (
        <div>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-zinc-700 dark:text-zinc-300">
              Document Reviews
            </h2>
            <Link
              href="/new-review"
              className="text-sm text-zinc-500 transition-colors hover:text-zinc-700 dark:hover:text-zinc-300"
            >
              New Document Review
            </Link>
          </div>

          <div className="mt-4 space-y-3">
            {reviews.map((review) => (
              <Link
                key={review.id}
                href={`/reviews/${review.id}`}
                className="block rounded-lg border border-zinc-200 bg-white p-4 transition-colors hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">{review.bid_file_name}</span>
                  <ReviewStatusBadge status={review.status} />
                </div>
                <p className="mt-1 text-xs text-zinc-500">
                  {new Date(review.created_at).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </p>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ApplicationStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    draft: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
    submitted_for_review: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    reviewing: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    reviewed: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  };

  const labels: Record<string, string> = {
    draft: "Draft",
    submitted_for_review: "Submitted",
    reviewing: "Reviewing",
    reviewed: "Reviewed",
  };

  return (
    <span
      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${styles[status] ?? styles.draft}`}
    >
      {labels[status] ?? status}
    </span>
  );
}

function ReviewStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
    parsing: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    analysing: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    scoring: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    generating: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    completed: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    failed: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  };

  return (
    <span
      className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${styles[status] ?? styles.pending}`}
    >
      {status}
    </span>
  );
}
