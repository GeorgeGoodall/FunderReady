import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ParseCriteriaRequestSchema } from "@/lib/schemas/criteria";
import { parseCriteriaWithAI } from "@/lib/ai/parse-criteria";
import { ZodError } from "zod";

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
    if (err instanceof ZodError) {
      const details = err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      console.error("parse-criteria Zod error:", details);
      return NextResponse.json(
        { error: "AI returned invalid criteria structure. Please try rephrasing your input.", details },
        { status: 422 }
      );
    }
    if (err instanceof SyntaxError) {
      console.error("parse-criteria JSON SyntaxError:", errMsg);
      return NextResponse.json(
        { error: "AI returned invalid JSON. This may be caused by a response that was too long and got truncated. Try reducing the input text.", details: errMsg },
        { status: 422 }
      );
    }
    console.error("parse-criteria error:", err);
    return NextResponse.json(
      { error: "Failed to parse criteria. Please try again.", details: errMsg },
      { status: 500 }
    );
  }
}
