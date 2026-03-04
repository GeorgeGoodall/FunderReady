import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ParseCriteriaRequestSchema } from "@/lib/schemas/criteria";
import { parseCriteriaWithAI } from "@/lib/ai/parse-criteria";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Pro-only endpoint — prevent free tier users from consuming AI credits
  const { data: profile } = await supabase
    .from("profiles")
    .select("subscription_tier")
    .eq("id", user.id)
    .single();

  if (profile?.subscription_tier !== "pro") {
    return NextResponse.json(
      { error: "Pro subscription required" },
      { status: 403 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = ParseCriteriaRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? "Invalid request" },
      { status: 400 }
    );
  }

  try {
    const criteria = await parseCriteriaWithAI(parsed.data.rawText, user.id);
    return NextResponse.json({ criteria });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    const isValidation = errMsg.includes("validation") || errMsg.includes("failed");
    const isTruncation = errMsg.includes("truncated") || errMsg.includes("max_tokens");
    console.error("parse-criteria error:", errMsg);
    return NextResponse.json(
      {
        error: isTruncation
          ? "Input too long — the AI response was truncated. Try reducing the input text."
          : isValidation
            ? "AI returned an invalid structure. Please try rephrasing your input."
            : "Failed to parse criteria. Please try again.",
      },
      { status: isTruncation || isValidation ? 422 : 500 }
    );
  }
}
