import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type GuardSuccess = { userId: string };
type GuardError = NextResponse;

export function isGuardError(
  result: GuardSuccess | GuardError
): result is GuardError {
  return result instanceof NextResponse;
}

export async function requirePro(): Promise<GuardSuccess | GuardError> {
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
      { error: "Access restricted" },
      { status: 403 }
    );
  }

  return { userId: user.id };
}
