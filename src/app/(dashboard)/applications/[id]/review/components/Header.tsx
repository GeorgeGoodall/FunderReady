"use client";

export function Header({
  application,
  fund,
}: {
  application: { title: string | null };
  fund: { name: string; organisation: { id: string; name: string } | null } | null;
}) {
  return (
    <div>
      <h1 className="text-2xl font-bold">
        {application.title ?? fund?.name ?? "Application"} — Review
      </h1>
      {fund && (
        <p className="mt-0.5 text-sm text-zinc-600 dark:text-zinc-400">
          {fund.name}
          {fund.organisation ? ` — ${fund.organisation.name}` : ""}
        </p>
      )}
    </div>
  );
}
