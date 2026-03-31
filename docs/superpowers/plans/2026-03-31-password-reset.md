# Password Reset Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "forgot password" flow so email/password users can request a reset link and set a new password.

**Architecture:** User requests reset on `/forgot-password` (public) → Supabase emails a link → existing `/auth/callback` exchanges the code and sets a session → user lands on `/update-password` (protected) and calls `supabase.auth.updateUser({ password })` → redirected to `/dashboard`.

**Tech Stack:** Next.js 16 App Router, Supabase Auth (PKCE reset flow), `@supabase/ssr` browser client, Tailwind CSS v4, TypeScript strict mode.

---

## File Map

| Action | File | Purpose |
|--------|------|---------|
| Modify | `src/proxy.ts` | Add `/forgot-password` to `publicRoutes` |
| Modify | `src/app/(auth)/login/page.tsx` | Add "Forgot your password?" link |
| Create | `src/app/(auth)/forgot-password/page.tsx` | Email form + success state |
| Create | `src/app/(auth)/update-password/page.tsx` | New password + confirm fields |

No new API routes, no DB migrations, no Inngest changes.

---

### Task 1: Expose `/forgot-password` as a public route

**Files:**
- Modify: `src/proxy.ts`

- [ ] **Step 1: Update publicRoutes array**

In `src/proxy.ts`, change line 4 from:

```ts
const publicRoutes = ["/", "/login", "/signup", "/auth/callback", "/privacy", "/terms"];
```

to:

```ts
const publicRoutes = ["/", "/login", "/signup", "/auth/callback", "/privacy", "/terms", "/forgot-password"];
```

- [ ] **Step 2: Commit**

```bash
git add src/proxy.ts
git commit -m "feat: add /forgot-password to public routes"
```

---

### Task 2: Add "Forgot your password?" link to login page

**Files:**
- Modify: `src/app/(auth)/login/page.tsx`

- [ ] **Step 1: Add the link below the password field**

In `src/app/(auth)/login/page.tsx`, find the password `<div>` block (lines ~126–133). It currently ends with the closing `</div>`. Add a "Forgot your password?" link immediately after it, so the form reads:

```tsx
          <div>
            <label htmlFor="password" className="block text-sm font-medium">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-900"
            />
          </div>
          <div className="flex justify-end">
            <Link
              href="/forgot-password"
              className="text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
            >
              Forgot your password?
            </Link>
          </div>
```

- [ ] **Step 2: Verify it renders**

Run the dev server (`npm run dev` from `app/`) and visit `/login`. Confirm the "Forgot your password?" link appears below the password field and links to `/forgot-password`.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(auth\)/login/page.tsx
git commit -m "feat: add forgot password link to login page"
```

---

### Task 3: Create `/forgot-password` page

**Files:**
- Create: `src/app/(auth)/forgot-password/page.tsx`

- [ ] **Step 1: Create the page**

Create `src/app/(auth)/forgot-password/page.tsx` with the following content:

```tsx
"use client";

import { createClient } from "@/lib/supabase/client";
import { useState } from "react";
import Link from "next/link";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const supabase = createClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?redirect=/update-password`,
    });
    // Always show success — do not reveal whether the email exists
    setSubmitted(true);
    setLoading(false);
  }

  if (submitted) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-sm space-y-4 text-center">
          <h1 className="text-2xl font-bold">Check your email</h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            If an account exists for <strong>{email}</strong>, we&apos;ve sent a
            password reset link. Check your inbox.
          </p>
          <Link
            href="/login"
            className="block text-sm font-medium text-blue-600 hover:text-blue-500"
          >
            Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Reset your password</h1>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            Enter your email and we&apos;ll send you a reset link.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-900"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? "Sending..." : "Send reset link"}
          </button>
        </form>

        <p className="text-center text-sm text-zinc-600 dark:text-zinc-400">
          <Link href="/login" className="font-medium text-blue-600 hover:text-blue-500">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify it renders**

Visit `/forgot-password`. Confirm:
- Form renders with an email input and "Send reset link" button
- "Back to sign in" link at the bottom goes to `/login`
- Submitting the form shows the "Check your email" success state
- The success state shows the submitted email address

- [ ] **Step 3: Commit**

```bash
git add src/app/\(auth\)/forgot-password/page.tsx
git commit -m "feat: add forgot-password page"
```

---

### Task 4: Create `/update-password` page

**Files:**
- Create: `src/app/(auth)/update-password/page.tsx`

This page lives under `(auth)` (same layout as login/signup) but is a **protected** route — the user has a valid session by the time they arrive (set by `/auth/callback` before the redirect). No proxy change needed.

- [ ] **Step 1: Create the page**

Create `src/app/(auth)/update-password/page.tsx` with the following content:

```tsx
"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function UpdatePasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const router = useRouter();
  const supabase = createClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    router.push("/dashboard");
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Set new password</h1>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            Choose a new password for your account.
          </p>
        </div>

        {error && (
          <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="password" className="block text-sm font-medium">
              New password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-900"
            />
            <p className="mt-1 text-xs text-zinc-500">Minimum 8 characters</p>
          </div>
          <div>
            <label htmlFor="confirm-password" className="block text-sm font-medium">
              Confirm new password
            </label>
            <input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-900"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? "Updating..." : "Update password"}
          </button>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify locally**

With a test account in local Supabase (or staging), go through the full reset flow:
1. `/login` → click "Forgot your password?" → `/forgot-password`
2. Submit email → see "Check your email" success state
3. Open reset email → click link → should land on `/update-password`
4. Enter mismatched passwords → confirm error message appears
5. Enter a password shorter than 8 chars → confirm error message appears
6. Enter valid matching passwords → confirm redirect to `/dashboard`
7. Sign out and sign back in with the new password to confirm it was saved

- [ ] **Step 3: Verify expired link handling**

Use an already-used or expired reset link. Confirm it lands on `/login?error=auth_failed` (existing callback fallback — no code change required).

- [ ] **Step 4: Run the test suite**

```bash
cd app && npm test
```

Expected: all existing tests pass (no regressions — we haven't touched any tested code).

- [ ] **Step 5: Commit**

```bash
git add src/app/\(auth\)/update-password/page.tsx
git commit -m "feat: add update-password page"
```
