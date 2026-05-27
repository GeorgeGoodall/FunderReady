import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { extractAnswersFromDocument } from "@/lib/ai/extract-answers";
import mammoth from "mammoth";
import { z } from "zod";

/**
 * Converts a mammoth HTML string to structured plain text on the server side
 * (no DOMParser in Node.js). Preserves headings as markdown # markers so
 * Claude can use document structure when mapping sections to questions.
 */
function htmlToStructuredText(html: string): string {
  return html
    // Headings → markdown heading markers
    .replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, "\n# $1\n")
    .replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, "\n## $1\n")
    .replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, "\n### $1\n")
    .replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, "\n#### $1\n")
    .replace(/<h5[^>]*>([\s\S]*?)<\/h5>/gi, "\n##### $1\n")
    .replace(/<h6[^>]*>([\s\S]*?)<\/h6>/gi, "\n###### $1\n")
    // Table rows → pipe-separated lines (basic, good enough for extraction)
    .replace(/<tr[^>]*>([\s\S]*?)<\/tr>/gi, (_, cells) => {
      const cols = [...cells.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)]
        .map((m) => m[1].replace(/<[^>]+>/g, "").trim());
      return cols.join(" | ") + "\n";
    })
    .replace(/<table[^>]*>/gi, "\n")
    .replace(/<\/table>/gi, "\n")
    // Block elements → newlines
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    // Strip all remaining tags
    .replace(/<[^>]+>/g, "")
    // Decode common HTML entities
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#160;/g, " ")
    // Collapse runs of blank lines
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const RequestSchema = z.object({
  content: z.string().min(1).max(14_000_000), // ~10 MB docx
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

  if (!questionsSet?.questions_json) {
    return NextResponse.json({ error: "Questions not found" }, { status: 404 });
  }

  const QuestionItemSchema = z.object({
    id: z.string(),
    question: z.string(),
    field_type: z.string().optional(),
    options: z.array(z.string()).optional(),
  });
  const questionsParseResult = z.array(QuestionItemSchema).safeParse(questionsSet.questions_json);
  if (!questionsParseResult.success) {
    return NextResponse.json({ error: "Questions data is malformed" }, { status: 500 });
  }
  const questions = questionsParseResult.data;

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

  // Extract plain text from docx if needed, then run AI extraction
  try {
    let documentText: string;
    if (parsed.data.contentType === "docx_base64") {
      const buffer = Buffer.from(parsed.data.content, "base64");
      // Use convertToHtml rather than extractRawText so that headings and
      // section structure are preserved. htmlToStructuredText converts
      // <h1>–<h6> to markdown headings so Claude can use them to map
      // sections to questions instead of guessing by content alone.
      const { value: html } = await mammoth.convertToHtml({ buffer });
      documentText = htmlToStructuredText(html).trim();
    } else {
      documentText = parsed.data.content;
    }

    if (!documentText.trim()) {
      return NextResponse.json({ error: "Document is empty" }, { status: 400 });
    }

    const extractedAnswers = await extractAnswersFromDocument(documentText, questions);
    return NextResponse.json({ answers: extractedAnswers });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[extract-answers] error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
