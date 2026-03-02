import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const VALID_ITEM_TYPES = new Set(["inline_comment", "criteria_score", "strength", "weakness", "cross_reference_summary", "cross_reference_finding"]);
const VALID_SENTIMENTS = new Set(["up", "down"]);
const MAX_ITEM_PATH_LENGTH = 500;

/** Verify user owns the application and the review belongs to it. */
async function verifyOwnership(
  supabase: Awaited<ReturnType<typeof createClient>>,
  applicationId: string,
  reviewId: string
) {
  // RLS ensures user can only see their own applications
  const { data: application, error: appError } = await supabase
    .from("applications")
    .select("id")
    .eq("id", applicationId)
    .single();

  if (appError) return { error: "Failed to verify application" as const, status: 500 as const };
  if (!application) return { error: "Application not found" as const, status: 404 as const };

  // Verify the review belongs to this application
  const { data: review, error: reviewError } = await supabase
    .from("application_reviews")
    .select("id")
    .eq("id", reviewId)
    .eq("application_id", applicationId)
    .single();

  if (reviewError && !review) return { error: "Failed to verify review" as const, status: 500 as const };
  if (!review) return { error: "Review not found" as const, status: 404 as const };

  return null;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; reviewId: string }> }
) {
  const { id, reviewId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ownershipError = await verifyOwnership(supabase, id, reviewId);
  if (ownershipError) {
    return NextResponse.json({ error: ownershipError.error }, { status: ownershipError.status });
  }

  // Load all feedback for this review by this user
  const { data: feedbackRows } = await supabase
    .from("review_feedback")
    .select("item_path, sentiment")
    .eq("review_id", reviewId)
    .eq("user_id", user.id)
    .limit(1000);

  const feedback: Record<string, string> = {};
  for (const row of feedbackRows ?? []) {
    feedback[row.item_path] = row.sentiment;
  }

  return NextResponse.json({ feedback });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; reviewId: string }> }
) {
  const { id, reviewId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ownershipError = await verifyOwnership(supabase, id, reviewId);
  if (ownershipError) {
    return NextResponse.json({ error: ownershipError.error }, { status: ownershipError.status });
  }

  // H1: Parse body safely
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { item_path, item_type, sentiment } = body;

  if (!item_path || typeof item_path !== "string") {
    return NextResponse.json({ error: "item_path is required" }, { status: 400 });
  }

  // M1: Length limit
  if (item_path.length > MAX_ITEM_PATH_LENGTH) {
    return NextResponse.json({ error: `item_path must be ${MAX_ITEM_PATH_LENGTH} characters or fewer` }, { status: 400 });
  }

  // Validate item_type before sentiment branch so deletes are also validated
  if (typeof item_type !== "string" || !VALID_ITEM_TYPES.has(item_type)) {
    return NextResponse.json(
      { error: `Invalid item_type. Must be one of: ${[...VALID_ITEM_TYPES].join(", ")}` },
      { status: 400 }
    );
  }

  // sentiment: null = remove feedback, "up" | "down" = upsert
  if (sentiment === null || sentiment === undefined) {
    // Delete existing feedback
    const { error: deleteError } = await supabase
      .from("review_feedback")
      .delete()
      .eq("review_id", reviewId)
      .eq("user_id", user.id)
      .eq("item_path", item_path);

    // M3: Check delete result
    if (deleteError) {
      return NextResponse.json({ error: "Failed to delete feedback" }, { status: 500 });
    }

    return NextResponse.json({ status: "deleted" });
  }

  if (!VALID_SENTIMENTS.has(sentiment as string)) {
    return NextResponse.json(
      { error: `Invalid sentiment. Must be "up", "down", or null` },
      { status: 400 }
    );
  }

  // Upsert feedback
  const { error } = await supabase
    .from("review_feedback")
    .upsert(
      {
        review_id: reviewId,
        user_id: user.id,
        item_path,
        item_type: item_type as string,
        sentiment: sentiment as string,
      },
      { onConflict: "review_id,user_id,item_path" }
    );

  // M2: Generic error message
  if (error) {
    return NextResponse.json({ error: "Failed to save feedback" }, { status: 500 });
  }

  return NextResponse.json({ status: "ok", sentiment });
}
