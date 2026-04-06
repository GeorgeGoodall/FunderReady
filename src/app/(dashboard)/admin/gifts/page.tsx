import { createServiceClient } from "@/lib/supabase/server";
import { GiftLinkForm } from "./GiftLinkForm";
import { CopyButton } from "@/components/CopyButton";

export const dynamic = "force-dynamic";

function formatDate(iso: string) {
  const d = new Date(iso);
  const date = `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
  const time = `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
  return `${date} ${time}`;
}

function StatusPill({ status }: { status: "active" | "used" | "expired" }) {
  const styles = {
    active: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
    used: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
    expired: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  };
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${styles[status]}`}>
      {status}
    </span>
  );
}

type GiftLink = {
  id: string;
  code: string;
  credits: number;
  status: "active" | "used" | "expired";
  created_at: string;
  expires_at: string | null;
  redeemed_by_email: string | null;
};

async function loadLinks(): Promise<GiftLink[]> {
  const service = createServiceClient();

  const { data: rows } = await service
    .from("gift_links")
    .select("id, code, credits, created_at, expires_at, redeemed_by, redeemed_at")
    .order("created_at", { ascending: false });

  if (!rows) return [];

  const redeemedIds = rows
    .map((r) => r.redeemed_by)
    .filter((id): id is string => !!id);

  const emailMap: Record<string, string> = {};
  if (redeemedIds.length > 0) {
    try {
      const { data: { users } } = await service.auth.admin.listUsers({ perPage: 1000 });
      for (const u of users) {
        if (redeemedIds.includes(u.id)) {
          emailMap[u.id] = u.email ?? "";
        }
      }
    } catch (err) {
      console.error("Failed to resolve redeemed_by emails:", err);
    }
  }

  const now = new Date();
  return rows.map((link) => {
    let status: "active" | "used" | "expired";
    if (link.redeemed_at) status = "used";
    else if (link.expires_at && new Date(link.expires_at) < now) status = "expired";
    else status = "active";

    return {
      id: link.id,
      code: link.code,
      credits: link.credits,
      status,
      created_at: link.created_at,
      expires_at: link.expires_at,
      redeemed_by_email: link.redeemed_by ? (emailMap[link.redeemed_by] ?? "") : null,
    };
  });
}

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "";

export default async function AdminGiftsPage() {
  const links = await loadLinks();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Gift Links</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Generate single-use credit links to share with users.
        </p>
      </div>

      <GiftLinkForm />

      {links.length === 0 ? (
        <p className="text-sm text-zinc-500">No gift links yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-50 text-xs dark:bg-zinc-800/50">
              <tr>
                <th className="px-4 py-2 font-medium">Credits</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Created</th>
                <th className="px-4 py-2 font-medium">Expires</th>
                <th className="px-4 py-2 font-medium">Redeemed by</th>
                <th className="px-4 py-2 font-medium">Link</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {links.map((link) => {
                const url = `${APP_URL}/redeem?code=${link.code}`;
                return (
                  <tr key={link.id} className="bg-white dark:bg-zinc-900">
                    <td className="px-4 py-3 font-medium">{link.credits}</td>
                    <td className="px-4 py-3">
                      <StatusPill status={link.status} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-zinc-600 dark:text-zinc-400">
                      {formatDate(link.created_at)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-zinc-600 dark:text-zinc-400">
                      {link.expires_at ? formatDate(link.expires_at) : "—"}
                    </td>
                    <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                      {link.redeemed_by_email ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      {link.status === "active" ? (
                        <CopyButton text={url} />
                      ) : (
                        <span className="text-zinc-400">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
