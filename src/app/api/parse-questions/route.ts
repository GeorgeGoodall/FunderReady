import { NextResponse } from "next/server";
import { ParseCriteriaRequestSchema } from "@/lib/schemas/criteria";
import { parseQuestionsWithAI } from "@/lib/ai/parse-questions";
import { requirePro, isGuardError } from "@/lib/usage/require-pro";

export async function POST(request: Request) {
  const guard = await requirePro();
  if (isGuardError(guard)) return guard;

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
    const questions = await parseQuestionsWithAI(parsed.data.rawText, guard.userId);
    return NextResponse.json({ questions });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    const isValidation = errMsg.includes("validation") || errMsg.includes("failed");
    const isTruncation = errMsg.includes("truncated") || errMsg.includes("max_tokens");
    console.error("parse-questions error:", errMsg);
    return NextResponse.json(
      {
        error: isTruncation
          ? "Input too long — the AI response was truncated. Try reducing the input text."
          : isValidation
            ? "AI returned an invalid structure. Please try rephrasing your input."
            : "Failed to parse questions. Please try again.",
      },
      { status: isTruncation || isValidation ? 422 : 500 }
    );
  }
}
