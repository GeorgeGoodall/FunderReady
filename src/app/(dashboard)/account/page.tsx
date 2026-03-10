"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function AccountPage() {
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  async function handleDelete() {
    if (confirmText !== "DELETE") return;
    setDeleting(true);
    setError("");

    try {
      const res = await fetch("/api/account", { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Failed to delete account");
        return;
      }
      // Sign out locally then redirect
      const supabase = createClient();
      await supabase.auth.signOut();
      router.push("/");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="max-w-lg space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Account</h1>
        <p className="mt-1 text-sm text-zinc-500">Manage your account settings.</p>
      </div>

      <div className="rounded-lg border border-red-200 bg-red-50 p-6 dark:border-red-900/40 dark:bg-red-900/10">
        <h2 className="text-base font-semibold text-red-900 dark:text-red-300">Delete account</h2>
        <p className="mt-1 text-sm text-red-700 dark:text-red-400">
          Permanently deletes your account, all applications, answers, and review results.
          This cannot be undone.
        </p>

        {!showConfirm && (
          <button
            type="button"
            onClick={() => setShowConfirm(true)}
            className="mt-4 rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-100 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/30"
          >
            Delete my account
          </button>
        )}

        {showConfirm && (
          <div className="mt-4 space-y-3">
            <p className="text-sm font-medium text-red-800 dark:text-red-300">
              Type <strong>DELETE</strong> to confirm:
            </p>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="DELETE"
              className="block w-full rounded-lg border border-red-300 bg-white px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 dark:border-red-700 dark:bg-zinc-900"
            />
            {error && (
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            )}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => { setShowConfirm(false); setConfirmText(""); setError(""); }}
                disabled={deleting}
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting || confirmText !== "DELETE"}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {deleting ? "Deleting..." : "Permanently delete account"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
