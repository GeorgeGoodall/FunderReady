"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

function SectionCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
      {children}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-base font-semibold">{children}</h2>;
}

function SectionDescription({ children }: { children: React.ReactNode }) {
  return <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{children}</p>;
}

function SuccessMessage({ message }: { message: string }) {
  return (
    <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">{message}</p>
  );
}

function ErrorMessage({ message }: { message: string }) {
  return (
    <p className="text-sm text-red-600 dark:text-red-400">{message}</p>
  );
}

function SubmitButton({ loading, children }: { loading: boolean; children: React.ReactNode }) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {loading ? "Saving..." : children}
    </button>
  );
}

function inputClass() {
  return "block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";
}

// ---------------------------------------------------------------------------
// Display Name section
// ---------------------------------------------------------------------------

function DisplayNameSection({ initialName }: { initialName: string }) {
  const [name, setName] = useState(initialName);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setSuccess("");
    setError("");

    const res = await fetch("/api/account/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ display_name: name }),
    });

    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error ?? "Failed to update name");
      return;
    }

    setSuccess("Display name updated.");
  }

  return (
    <SectionCard>
      <SectionTitle>Display name</SectionTitle>
      <SectionDescription>
        This is the name shown across FunderReady.
      </SectionDescription>
      <form onSubmit={handleSubmit} className="mt-4 space-y-3">
        <input
          type="text"
          value={name}
          onChange={(e) => { setName(e.target.value); setSuccess(""); }}
          maxLength={100}
          required
          className={inputClass()}
          placeholder="Your name"
        />
        <div className="flex items-center gap-4">
          <SubmitButton loading={loading}>Save name</SubmitButton>
          {success && <SuccessMessage message={success} />}
          {error && <ErrorMessage message={error} />}
        </div>
      </form>
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// Email section
// ---------------------------------------------------------------------------

function EmailSection({ currentEmail }: { currentEmail: string }) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setSuccess("");
    setError("");

    const res = await fetch("/api/account/email", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });

    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error ?? "Failed to update email");
      return;
    }

    setSuccess(data.message);
    setEmail("");
  }

  return (
    <SectionCard>
      <SectionTitle>Email address</SectionTitle>
      <SectionDescription>
        Current email: <span className="font-medium text-zinc-700 dark:text-zinc-300">{currentEmail}</span>.
        Enter a new address and we&apos;ll send a verification link to confirm the change.
      </SectionDescription>
      <form onSubmit={handleSubmit} className="mt-4 space-y-3">
        <input
          type="email"
          value={email}
          onChange={(e) => { setEmail(e.target.value); setSuccess(""); }}
          required
          className={inputClass()}
          placeholder="new@example.com"
        />
        <div className="flex items-center gap-4">
          <SubmitButton loading={loading}>Send verification</SubmitButton>
          {success && <SuccessMessage message={success} />}
          {error && <ErrorMessage message={error} />}
        </div>
      </form>
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// Password section
// ---------------------------------------------------------------------------

function PasswordSection() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSuccess("");
    setError("");

    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);

    const res = await fetch("/api/account/password", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });

    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error ?? "Failed to update password");
      return;
    }

    setSuccess("Password updated.");
    setPassword("");
    setConfirm("");
  }

  return (
    <SectionCard>
      <SectionTitle>Password</SectionTitle>
      <SectionDescription>
        Choose a new password. Must be at least 8 characters.
      </SectionDescription>
      <form onSubmit={handleSubmit} className="mt-4 space-y-3">
        <input
          type="password"
          value={password}
          onChange={(e) => { setPassword(e.target.value); setSuccess(""); }}
          required
          minLength={8}
          className={inputClass()}
          placeholder="New password"
          autoComplete="new-password"
        />
        <input
          type="password"
          value={confirm}
          onChange={(e) => { setConfirm(e.target.value); setSuccess(""); }}
          required
          minLength={8}
          className={inputClass()}
          placeholder="Confirm new password"
          autoComplete="new-password"
        />
        <div className="flex items-center gap-4">
          <SubmitButton loading={loading}>Update password</SubmitButton>
          {success && <SuccessMessage message={success} />}
          {error && <ErrorMessage message={error} />}
        </div>
      </form>
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// Download My Data section
// ---------------------------------------------------------------------------

function DownloadDataSection() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleDownload() {
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/account/export");
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Failed to export data");
        return;
      }

      // Trigger download
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const disposition = res.headers.get("content-disposition") ?? "";
      const match = disposition.match(/filename="([^"]+)"/);
      a.href = url;
      a.download = match?.[1] ?? "funderready-export.json";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <SectionCard>
      <SectionTitle>Download your data</SectionTitle>
      <SectionDescription>
        Export a copy of all your personal data held by FunderReady — your profile, applications,
        answers, review results, and usage history — as a JSON file.
      </SectionDescription>
      <div className="mt-4 space-y-3">
        <button
          type="button"
          onClick={handleDownload}
          disabled={loading}
          className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          {loading ? "Preparing export..." : "Download my data"}
        </button>
        {error && <ErrorMessage message={error} />}
      </div>
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// Delete Account section
// ---------------------------------------------------------------------------

function DeleteAccountSection() {
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
            className="block w-full rounded-lg border border-red-300 bg-white px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 dark:border-zinc-900 dark:border-red-700"
          />
          {error && <ErrorMessage message={error} />}
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
  );
}

// ---------------------------------------------------------------------------
// Root export
// ---------------------------------------------------------------------------

export function AccountClient({
  email,
  displayName,
}: {
  email: string;
  displayName: string;
}) {
  return (
    <div className="max-w-lg space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Account</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Manage your account settings.
        </p>
      </div>

      <DisplayNameSection initialName={displayName} />
      <EmailSection currentEmail={email} />
      <PasswordSection />
      <DownloadDataSection />
      <DeleteAccountSection />
    </div>
  );
}
