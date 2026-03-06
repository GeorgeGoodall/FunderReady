import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkAndIncrementAiUsage } from "./check-ai-rate-limit";

type GuardSuccess = { userId: string };
type GuardError = NextResponse;

export function isGuardError(
  result: GuardSuccess | GuardError
): result is GuardError {
  return result instanceof NextResponse;
}

export async function requireProWithRateLimit(): Promise<
  GuardSuccess | GuardError
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("subscription_tier")
    .eq("id", user.id)
    .single();

  if (!profile || profile.subscription_tier === "free") {
    return NextResponse.json(
      { error: "Subscription required" },
      { status: 403 }
    );
  }

  const rateLimit = await checkAndIncrementAiUsage(user.id);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        error: "Daily AI limit reached (30/day). Please try again tomorrow.",
        limit: rateLimit.limit,
        used: rateLimit.count,
      },
      { status: 429 }
    );
  }

  return { userId: user.id };
}
