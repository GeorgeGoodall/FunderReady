"use client";

interface UpsellPromptProps {
  used: number;
  limit: number;
  period: string;
}

export function UpsellPrompt({ used, limit, period }: UpsellPromptProps) {
  // Calculate reset date (1st of next month)
  const [year, month] = period.split("-").map(Number);
  const resetDate = new Date(year, month, 1); // month is 0-indexed, so this gives 1st of next month
  const resetStr = resetDate.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 dark:border-amber-800 dark:bg-amber-900/20">
      <h3 className="text-lg font-semibold text-amber-800 dark:text-amber-200">
        Monthly limit reached
      </h3>
      <p className="mt-2 text-sm text-amber-700 dark:text-amber-300">
        You&apos;ve used all {used} of your {limit} reviews this month.
        Your allowance resets on {resetStr}.
      </p>

      <div className="mt-4 flex gap-3">
        <button
          type="button"
          disabled
          className="rounded-lg bg-zinc-300 px-4 py-2 text-sm font-medium text-zinc-500 cursor-not-allowed"
        >
          Buy additional review (coming soon)
        </button>
        <button
          type="button"
          disabled
          className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-500 cursor-not-allowed dark:border-zinc-700 dark:bg-zinc-800"
        >
          Upgrade to Pro (coming soon)
        </button>
      </div>
    </div>
  );
}
