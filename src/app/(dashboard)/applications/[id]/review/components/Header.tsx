"use client";

export function Header({
  application,
  fund,
  submittedAt,
}: {
  application: { title: string | null };
  fund: { name: string; organisation: { id: string; name: string } | null } | null;
  submittedAt?: string | null;
}) {
  return (
    <div>
      <h1 className="text-2xl font-bold">
        {application.title ?? fund?.name ?? "Application"} — Review
      </h1>
      <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-zinc-600 dark:text-zinc-400">
        {fund && (
          <span>
            {fund.name}
            {fund.organisation ? ` — ${fund.organisation.name}` : ""}
          </span>
        )}
        {submittedAt && (
          <span>
            {fund && <span className="mr-3">·</span>}
            Submitted {new Date(submittedAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })} at{" "}
            {new Date(submittedAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
          </span>
        )}
      </div>
    </div>
  );
}
