import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { extractAnswersFromDocument } from "@/lib/ai/extract-answers";
import mammoth from "mammoth";
import { z } from "zod";

const RequestSchema = z.object({
  content: z.string().min(1),
  contentType: z.enum(["docx_base64", "plain_text"]),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify user owns this application
  const { data: application } = await supabase
    .from("applications")
    .select("id, questions_set_id")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (!application) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!application.questions_set_id) {
    return NextResponse.json(
      { error: "This application format does not support answer extraction" },
      { status: 400 }
    );
  }

  // Load questions
  const serviceClient = createServiceClient();
  const { data: questionsSet } = await serviceClient
    .from("questions_sets")
    .select("questions_json")
    .eq("id", application.questions_set_id)
    .single();

  if (!questionsSet?.questions_json || !Array.isArray(questionsSet.questions_json)) {
    return NextResponse.json({ error: "Questions not found" }, { status: 404 });
  }

  const questions = questionsSet.questions_json as Array<{ id: string; question: string }>;

  // Parse request body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? "Invalid request" },
      { status: 400 }
    );
  }

  // Extract plain text from docx if needed
  let documentText: string;
  if (parsed.data.contentType === "docx_base64") {
    const buffer = Buffer.from(parsed.data.content, "base64");
    const { value } = await mammoth.extractRawText({ buffer });
    documentText = value.trim();
  } else {
    documentText = parsed.data.content;
  }

  if (!documentText.trim()) {
    return NextResponse.json({ error: "Document is empty" }, { status: 400 });
  }

  const extractedAnswers = await extractAnswersFromDocument(documentText, questions);

  return NextResponse.json({ answers: extractedAnswers });
}
