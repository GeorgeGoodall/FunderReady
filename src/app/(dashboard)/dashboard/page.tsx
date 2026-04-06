import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ApplicationsList } from "./ApplicationsList";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ gifted?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { gifted } = await searchParams;
  const giftedCount = gifted ? parseInt(gifted, 10) : null;

  // Fetch applications
  const { data: applications } = await supabase
    .from("applications")
    .select("id, title, status, review_count, updated_at, fund_id, funds(name)")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });

  const hasApplications = applications && applications.length > 0;

  return (
    <div className="space-y-10">
      {giftedCount && giftedCount > 0 && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 dark:border-green-800 dark:bg-green-900/20 dark:text-green-300">
          <strong>{giftedCount} {giftedCount === 1 ? "credit has" : "credits have"} been added to your account.</strong>{" "}
          Start a new application to use them.
        </div>
      )}
      {/* Applications section */}
      <div>
        <h1 className="text-2xl font-bold">Your Applications</h1>

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
              Here&apos;s how it works:
            </p>
            <ol className="mt-6 mx-auto max-w-xs text-left space-y-3">
              {[
                "Find or add the fund you're applying to",
                "Confirm the fund's scoring criteria and application questions",
                "Fill out your answers in the application form",
                "Submit for AI review and get scored feedback",
              ].map((step, i) => (
                <li key={i} className="flex items-start gap-3 text-sm text-zinc-700 dark:text-zinc-300">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-semibold text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                    {i + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ol>
            <Link
              href="/applications/new"
              className="mt-8 inline-block rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700"
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

