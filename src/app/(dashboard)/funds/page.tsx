import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { FundsBrowser } from "./FundsBrowser";

export default async function FundsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("subscription_tier")
    .eq("id", user.id)
    .single();

  const isPro = profile?.subscription_tier === "pro";

  if (!isPro) {
    return (
      <div className="mt-16 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800">
          <svg className="h-8 w-8 text-zinc-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold">Pro Feature</h2>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Browse and create funds with a Pro subscription.
        </p>
        <Link href="/billing" className="mt-4 inline-block rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700">
          Upgrade to Pro
        </Link>
      </div>
    );
  }

  const BROWSE_LIMIT = 20;
  const [{ data: rawPublishedFunds }, { data: rawMyFunds }] = await Promise.all([
    supabase
      .from("funds")
      .select("id, name, organisation_id, organisations(id, name), url, notes, opens_at, closes_at, created_at")
      .eq("published", true)
      .eq("rejected", false)
      .order("created_at", { ascending: false })
      .range(0, BROWSE_LIMIT),
    supabase
      .from("funds")
      .select("id, name, organisation_id, organisations(id, name), url, published, created_at")
      .eq("created_by", user.id)
      .eq("creator_hidden", false)
      .eq("rejected", false)
      .order("created_at", { ascending: false }),
  ]);

  const publishedFunds = (rawPublishedFunds ?? []).map((f) => {
    const org = f.organisations as unknown as { id: string; name: string } | null;
    return { ...f, organisations: org };
  });
  const hasMore = publishedFunds.length > BROWSE_LIMIT;
  const trimmedPublished = publishedFunds.slice(0, BROWSE_LIMIT);

  const myFunds = (rawMyFunds ?? []).map((f) => {
    const org = f.organisations as unknown as { id: string; name: string } | null;
    return { ...f, organisation: org };
  });

  return (
    <div>
      <h1 className="text-2xl font-bold">Funds</h1>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        Browse published funds or manage your own.
      </p>
      <div className="mt-6">
        <FundsBrowser
          initialPublishedFunds={trimmedPublished}
          initialHasMore={hasMore}
          myFunds={myFunds}
        />
      </div>
    </div>
  );
}
