import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { checkUsage } from "@/lib/usage/check-usage";
import { NewReviewForm } from "./NewReviewForm";

export default async function NewReviewPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("subscription_tier")
    .eq("id", user.id)
    .single();

  const tier = (profile?.subscription_tier ?? "free") as "free" | "pro";
  const usage = await checkUsage(supabase, user.id);

  return (
    <div>
      {/* Deprecation notice */}
      <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-900/30 dark:bg-blue-900/10">
        <p className="text-sm text-blue-800 dark:text-blue-300">
          <span className="font-semibold">New:</span> Try our form-based applications for in-browser AI feedback — no document upload needed.
        </p>
        <a
          href="/applications/new"
          className="mt-2 inline-block rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
        >
          Start an Application
        </a>
      </div>

      <h1 className="text-2xl font-bold">Document Review</h1>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        Upload your bid document and paste the funder&apos;s evaluation criteria.
      </p>
      <div className="mt-6">
        <NewReviewForm userId={user.id} tier={tier} usage={usage} />
      </div>
    </div>
  );
}
