"use client";

import { Suspense } from "react";
import { createClient } from "@/lib/supabase/client";
import { isDisposableEmail } from "@/lib/auth/disposable-emails";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { OAuthButtons } from "@/components/OAuthButtons";

function SignupForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [betaConsent, setBetaConsent] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  const betaRef = process.env.NEXT_PUBLIC_BETA_REF;
  const isBeta = !!betaRef && searchParams.get("ref") === betaRef;

  const supabase = createClient();

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (isBeta && !betaConsent) {
      setError("Please accept the beta participation terms to continue.");
      return;
    }

    setLoading(true);

    if (isDisposableEmail(email)) {
      setError("Disposable email addresses are not allowed. Please use a permanent email.");
      setLoading(false);
      return;
    }

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        data: isBeta ? { is_beta: true } : undefined,
      },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    setSuccess(true);
    setLoading(false);
  }

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-sm space-y-4 text-center">
          <h1 className="text-2xl font-bold">Check your email</h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            We&apos;ve sent a confirmation link to <strong>{email}</strong>. Click the link to
            activate your account.
          </p>
          <Link href="/login" className="text-sm font-medium text-blue-600 hover:text-blue-500">
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
          <h1 className="text-2xl font-bold">
            {isBeta ? "Join the FunderReady Beta" : "Create your account"}
          </h1>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            {isBeta
              ? "You've been invited to the FunderReady closed beta"
              : "Start reviewing bids with AI in minutes"}
          </p>
        </div>

        {isBeta && (
          <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-300">
            <strong>Beta access:</strong> As a beta participant you&apos;ll get free access to all
            features while we build out the platform.
          </div>
        )}

        {error && (
          <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
            {error}
          </div>
        )}

        <OAuthButtons
          redirectTo={`${window.location.origin}/auth/callback`}
          queryParams={isBeta ? { is_beta: "true" } : undefined}
          onError={setError}
        />

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-zinc-300 dark:border-zinc-700" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-white px-2 text-zinc-500 dark:bg-black dark:text-zinc-400">
              or
            </span>
          </div>
        </div>

        <form onSubmit={handleSignup} className="space-y-4">
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
              minLength={8}
              className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-900"
            />
            <p className="mt-1 text-xs text-zinc-500">Minimum 8 characters</p>
          </div>

          {isBeta && (
            <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-800/50">
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  checked={betaConsent}
                  onChange={(e) => setBetaConsent(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-zinc-300 text-blue-600"
                />
                <span className="text-xs text-zinc-600 dark:text-zinc-400">
                  As a beta participant, I understand that FunderReady may review my application
                  data and AI review results to improve the service. My data will be treated as
                  confidential and handled in accordance with the{" "}
                  <Link href="/privacy" className="underline hover:text-zinc-800 dark:hover:text-zinc-200">
                    Privacy Policy
                  </Link>
                  .
                </span>
              </label>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || (isBeta && !betaConsent)}
            className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? "Creating account..." : isBeta ? "Join Beta" : "Create account"}
          </button>
          <p className="text-center text-xs text-zinc-500 dark:text-zinc-400">
            By creating an account, you agree to our{" "}
            <Link href="/terms" className="underline hover:text-zinc-700 dark:hover:text-zinc-300">
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className="underline hover:text-zinc-700 dark:hover:text-zinc-300">
              Privacy Policy
            </Link>
            .
          </p>
        </form>

        <p className="text-center text-sm text-zinc-600 dark:text-zinc-400">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-blue-600 hover:text-blue-500">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function SignupPage() {
  return (
    <Suspense>
      <SignupForm />
    </Suspense>
  );
}
