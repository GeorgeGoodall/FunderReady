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
      <h1 className="text-2xl font-bold">New Review</h1>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        Upload your bid document and paste the funder&apos;s evaluation criteria.
      </p>
      <div className="mt-6">
        <NewReviewForm userId={user.id} tier={tier} usage={usage} />
      </div>
    </div>
  );
}
