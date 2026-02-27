import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { ApplicationsList } from "./ApplicationsList";

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

  const hasApplications = applications && applications.length > 0;

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

        {!hasApplications && (
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
          <ApplicationsList applications={applications as unknown as Parameters<typeof ApplicationsList>[0]["applications"]} />
        )}
      </div>

    </div>
  );
}

