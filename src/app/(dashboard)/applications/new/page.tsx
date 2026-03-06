import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { checkUsage } from "@/lib/usage/check-usage";
import { NewApplicationForm } from "./NewApplicationForm";

export default async function NewApplicationPage({
  searchParams,
}: {
  searchParams: Promise<{ fundId?: string }>;
}) {
  const { fundId } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("subscription_tier, is_admin")
    .eq("id", user.id)
    .single();

  const tier = (profile?.subscription_tier ?? "free") as "free" | "pro";
  const isAdmin = profile?.is_admin ?? false;
  const usage = await checkUsage(supabase, user.id);

  return (
    <div>
      <h1 className="text-2xl font-bold">New Application</h1>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        Select a fund to start filling out your application form.
      </p>
      <div className="mt-6">
        <NewApplicationForm tier={tier} usage={usage} isAdmin={isAdmin} fundId={fundId} />
      </div>
    </div>
  );
}
