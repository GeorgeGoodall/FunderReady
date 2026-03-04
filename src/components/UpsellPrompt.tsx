"use client";

interface UpsellPromptProps {
  tier: "free" | "pro";
  used: number;
  limit: number;
  resetDate: string;
}

export function UpsellPrompt({ tier, used, limit, resetDate }: UpsellPromptProps) {
  if (tier !== "pro") {
    // No subscription — coming soon
    return (
      <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-6 dark:border-zinc-700 dark:bg-zinc-800/50">
        <h3 className="text-lg font-semibold text-zinc-800 dark:text-zinc-200">
          Coming Soon
        </h3>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Subscriptions are not yet available. Contact us for beta access.
        </p>
      </div>
    );
  }

  // Pro user who hit their monthly limit
  const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const d = new Date(resetDate);
  const resetStr = `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 dark:border-amber-800 dark:bg-amber-900/20">
      <h3 className="text-lg font-semibold text-amber-800 dark:text-amber-200">
        Monthly limit reached
      </h3>
      <p className="mt-2 text-sm text-amber-700 dark:text-amber-300">
        You&apos;ve used all {used} of your {limit} reviews this month.
        Your allowance resets on {resetStr}.
      </p>
    </div>
  );
}
