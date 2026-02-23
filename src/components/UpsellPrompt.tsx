"use client";

interface UpsellPromptProps {
  tier: "free" | "pro";
  used: number;
  limit: number;
  resetDate: string;
}

export function UpsellPrompt({ tier, used, limit, resetDate }: UpsellPromptProps) {
  if (tier !== "pro") {
    // No subscription — prompt to subscribe
    return (
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-6 dark:border-blue-800 dark:bg-blue-900/20">
        <h3 className="text-lg font-semibold text-blue-800 dark:text-blue-200">
          Subscribe to get started
        </h3>
        <p className="mt-2 text-sm text-blue-700 dark:text-blue-300">
          Subscribe to FunderReady Pro to start reviewing bids. Get 10 full
          reviews per month with inline comments and improvement appendix.
        </p>

        <div className="mt-4">
          <a
            href="/billing"
            className="inline-block rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
          >
            Subscribe to Pro — £49/month
          </a>
        </div>
      </div>
    );
  }

  // Pro user who hit their monthly limit
  const resetStr = new Date(resetDate).toLocaleDateString("en-GB", {
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
    </div>
  );
}
