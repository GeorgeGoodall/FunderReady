import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ParseCriteriaRequestSchema } from "@/lib/schemas/criteria";
import { parseQuestionsWithAI } from "@/lib/ai/parse-questions";
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

  // Reuse the same request schema (just needs rawText)
  const parsed = ParseCriteriaRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? "Invalid request" },
      { status: 400 }
    );
  }

  try {
    const questions = await parseQuestionsWithAI(parsed.data.rawText, user.id);
    return NextResponse.json({ questions });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json(
        { error: "AI returned invalid questions structure. Please try rephrasing your input." },
        { status: 422 }
      );
    }
    if (err instanceof SyntaxError) {
      return NextResponse.json(
        { error: "AI returned invalid JSON. Please try again." },
        { status: 422 }
      );
    }
    console.error("parse-questions error:", err);
    return NextResponse.json(
      { error: "Failed to parse questions. Please try again." },
      { status: 500 }
    );
  }
}
