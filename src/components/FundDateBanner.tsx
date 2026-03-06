interface FundDateBannerProps {
  opensAt: string | null;
  closesAt: string | null;
}

export function FundDateBanner({ opensAt, closesAt }: FundDateBannerProps) {
  const now = new Date();
  const closesDate = closesAt ? new Date(closesAt) : null;
  const opensDate = opensAt ? new Date(opensAt) : null;

  const isPastDeadline = closesDate && closesDate < now;
  const isNotYetOpen = opensDate && opensDate > now;

  if (!isPastDeadline && !isNotYetOpen) return null;

  const formatDate = (d: Date) =>
    d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="space-y-2">
      {isPastDeadline && (
        <div
          role="alert"
          className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/30 dark:bg-amber-900/10 dark:text-amber-300"
        >
          This fund&apos;s deadline was {formatDate(closesDate)}. You can still work on your application.
        </div>
      )}
      {isNotYetOpen && (
        <div
          role="status"
          className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800 dark:border-blue-900/30 dark:bg-blue-900/10 dark:text-blue-300"
        >
          This fund opens on {formatDate(opensDate)}.
        </div>
      )}
    </div>
  );
}
