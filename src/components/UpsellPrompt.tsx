"use client";

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

interface UpsellPromptProps {
  tier: "free" | "basic" | "pro";
  remaining: number;
  resetDate: string;
  estimateLow?: number;
  estimateHigh?: number;
}

export function UpsellPrompt({ tier, remaining, resetDate, estimateLow, estimateHigh }: UpsellPromptProps) {
  if (tier === "free") {
    return (
      <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-6 dark:border-zinc-700 dark:bg-zinc-800/50">
        <h3 className="text-lg font-semibold text-zinc-800 dark:text-zinc-200">
          Subscription Required
        </h3>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Subscribe to a Basic or Pro plan to start reviewing applications.
        </p>
        <a
          href="/billing"
          className="mt-3 inline-block rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          View plans
        </a>
      </div>
    );
  }

  // Subscribed user with insufficient credits
  const d = new Date(resetDate);
  const resetStr = `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 dark:border-amber-800 dark:bg-amber-900/20">
      <h3 className="text-lg font-semibold text-amber-800 dark:text-amber-200">
        Insufficient credits
      </h3>
      <p className="mt-2 text-sm text-amber-700 dark:text-amber-300">
        {estimateLow && estimateHigh
          ? `This review needs approximately ${estimateLow}\u2013${estimateHigh} credits. You have ${remaining} credits remaining.`
          : `You have ${remaining} credits remaining.`}
        {" "}Your monthly credits reset on {resetStr}.
      </p>
      <a
        href="/billing"
        className="mt-3 inline-block rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700"
      >
        Buy credits
      </a>
    </div>
  );
}
