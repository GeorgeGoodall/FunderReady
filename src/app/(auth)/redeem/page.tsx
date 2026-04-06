import { createClient, createServiceClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { RedeemButton } from "./RedeemButton";

interface Props {
  searchParams: Promise<{ code?: string }>;
}

export default async function RedeemPage({ searchParams }: Props) {
  const { code } = await searchParams;

  if (!code) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-sm space-y-4 text-center">
          <h1 className="text-2xl font-bold">Invalid Link</h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            This gift link is not valid.
          </p>
          <Link href="/dashboard" className="text-sm font-medium text-blue-600 hover:text-blue-500">
            Go to dashboard
          </Link>
        </div>
      </div>
    );
  }

  // Check auth
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/signup?code=${encodeURIComponent(code)}`);
  }

  // Read link state via service client (no user-facing RLS on gift_links)
  const service = createServiceClient();
  const { data: link } = await service
    .from("gift_links")
    .select("id, credits, redeemed_at, expires_at")
    .eq("code", code)
    .maybeSingle();

  if (!link) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-sm space-y-4 text-center">
          <h1 className="text-2xl font-bold">Link Not Found</h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            This gift link is not valid.
          </p>
          <Link href="/dashboard" className="text-sm font-medium text-blue-600 hover:text-blue-500">
            Go to dashboard
          </Link>
        </div>
      </div>
    );
  }

  if (link.redeemed_at) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-sm space-y-4 text-center">
          <h1 className="text-2xl font-bold">Already Used</h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            This gift link has already been redeemed.
          </p>
          <Link href="/dashboard" className="text-sm font-medium text-blue-600 hover:text-blue-500">
            Go to dashboard
          </Link>
        </div>
      </div>
    );
  }

  if (link.expires_at && new Date(link.expires_at) < new Date()) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-sm space-y-4 text-center">
          <h1 className="text-2xl font-bold">Link Expired</h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            This gift link has expired.
          </p>
          <Link href="/dashboard" className="text-sm font-medium text-blue-600 hover:text-blue-500">
            Go to dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6 text-center">
        <div>
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
            <svg className="h-8 w-8 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold">You&apos;ve been gifted credits!</h1>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            Claim your <strong>{link.credits} free {link.credits === 1 ? "credit" : "credits"}</strong> to use for AI bid reviews.
          </p>
        </div>
        <RedeemButton code={code} credits={link.credits} />
        <Link href="/dashboard" className="block text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200">
          Skip — go to dashboard
        </Link>
      </div>
    </div>
  );
}
