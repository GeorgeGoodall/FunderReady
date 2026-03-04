const styles: Record<string, string> = {
  draft: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  submitted_for_review: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  reviewing: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  reviewed: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
};

const labels: Record<string, string> = {
  draft: "Draft",
  submitted_for_review: "Submitted",
  reviewing: "Reviewing",
  reviewed: "Reviewed",
};

export function ApplicationStatusBadge({ status }: { status: string }) {
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${styles[status] ?? styles.draft}`}>
      {labels[status] ?? status}
    </span>
  );
}
