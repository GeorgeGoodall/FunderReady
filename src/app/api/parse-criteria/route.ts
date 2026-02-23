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
    const criteria = await parseCriteriaWithAI(parsed.data.rawText);
    return NextResponse.json({ criteria });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json(
        { error: "AI returned invalid criteria structure. Please try rephrasing your input." },
        { status: 422 }
      );
    }
    if (err instanceof SyntaxError) {
      return NextResponse.json(
        { error: "AI returned invalid JSON. Please try again." },
        { status: 422 }
      );
    }
    console.error("parse-criteria error:", err);
    return NextResponse.json(
      { error: "Failed to parse criteria. Please try again." },
      { status: 500 }
    );
  }
}
