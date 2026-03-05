import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { detectFundName } from "@/lib/ai/detect-fund";
import { z } from "zod";
import { requireProWithRateLimit, isGuardError } from "@/lib/usage/require-pro-with-rate-limit";

const DetectFundRequestSchema = z.object({
  fileName: z.string().min(1),
  bidTextPreview: z.string().optional(),
});

export async function POST(request: Request) {
  const guard = await requireProWithRateLimit();
  if (isGuardError(guard)) return guard;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = DetectFundRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? "Invalid request" },
      { status: 400 }
    );
  }

  const { fileName, bidTextPreview } = parsed.data;

  // Build text for AI detection: filename + first ~500 words of bid
  const detectionText = [
    `Filename: ${fileName}`,
    bidTextPreview ? `\nDocument content:\n${bidTextPreview}` : "",
  ].join("");

  let detectedName: string | null = null;
  try {
    detectedName = await detectFundName(detectionText, guard.userId);
  } catch (error) {
    console.error("Fund detection AI error:", error);
    // Non-fatal — continue without AI detection
  }

  // Search DB for matching fund if we got a name
  const supabase = await createClient();
  let matchedFund = null;
  if (detectedName) {
    const tsQuery = detectedName
      .split(/\s+/)
      .filter((w) => w.length > 2)
      .map((w) => `${w}:*`)
      .join(" & ");

    if (tsQuery) {
      const { data: funds } = await supabase
        .from("funds")
        .select("id, name, organisation_id, organisations(id, name), url, notes, created_at")
        .textSearch("name", tsQuery)
        .eq("rejected", false)
        .order("created_at", { ascending: false })
        .limit(1);

      matchedFund = funds?.[0] ?? null;
    }
  }

  return NextResponse.json({
    detectedName,
    matchedFund,
  });
}
