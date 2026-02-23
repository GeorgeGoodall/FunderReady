"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import Link from "next/link";

export function DashboardNav({
  displayName,
  tier,
}: {
  displayName: string;
  tier: string;
}) {
  const supabase = createClient();
  const router = useRouter();

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <nav className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
        <Link href="/dashboard" className="text-lg font-bold">
          FunderReady
        </Link>
        <div className="flex items-center gap-4">
          <Link
            href="/billing"
            className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium capitalize transition-colors hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700"
          >
            {tier}
          </Link>
          <span className="text-sm text-zinc-600 dark:text-zinc-400">
            {displayName}
          </span>
          <button
            onClick={handleSignOut}
            className="text-sm text-zinc-500 transition-colors hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
          >
            Sign out
          </button>
        </div>
      </div>
    </nav>
  );
}
