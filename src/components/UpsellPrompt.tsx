"use client";

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

interface UpsellPromptProps {
  tier: string;
  remaining: number;
  resetDate: string;
  estimateLow?: number;
  estimateHigh?: number;
}

export function UpsellPrompt({
  tier,
  remaining,
  resetDate,
  estimateLow,
  estimateHigh,
}: UpsellPromptProps) {
  if (tier === "free") {
    return (
      <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-6 dark:border-zinc-700 dark:bg-zinc-800/50">
        <h3 className="text-lg font-semibold text-zinc-800 dark:text-zinc-200">
          Access Required
        </h3>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Your account has not yet been granted access. Please contact the site
          owner to request access.
        </p>
      </div>
    );
  }

  // Approved user with insufficient credits
  const d = new Date(resetDate);
  const resetStr = `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 dark:border-amber-800 dark:bg-amber-900/20">
      <h3 className="text-lg font-semibold text-amber-800 dark:text-amber-200">
        Insufficient credits
      </h3>
      <p className="mt-2 text-sm text-amber-700 dark:text-amber-300">
        {estimateLow && estimateHigh
          ? `This review needs approximately ${estimateLow}–${estimateHigh} credits. You have ${remaining} credits remaining.`
          : `You have ${remaining} credits remaining.`}
        {" "}Your credits reset on {resetStr}.
      </p>
      <p className="mt-2 text-sm text-amber-700 dark:text-amber-300">
        Contact the site owner to request more credits.
      </p>
    </div>
  );
}
