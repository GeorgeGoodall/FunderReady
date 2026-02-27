import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  _request: Request,
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

  // Verify ownership via RLS
  const { data: application } = await supabase
    .from("applications")
    .select("id, status, review_count")
    .eq("id", id)
    .single();

  if (!application) {
    return NextResponse.json({ error: "Application not found" }, { status: 404 });
  }

  // Fetch all reviews ordered by review_number ascending
  const { data: reviews } = await supabase
    .from("application_reviews")
    .select("id, review_number, status, results, error_message, created_at")
    .eq("application_id", id)
    .order("review_number", { ascending: true });

  // Return lean summaries — extract overall_score from results JSONB
  const summaries = (reviews ?? []).map((r) => {
    const results = r.results as Record<string, unknown> | null;
    const scoring = results?.scoring as Record<string, unknown> | undefined;
    return {
      id: r.id,
      review_number: r.review_number,
      status: r.status,
      overall_score: typeof scoring?.overall_score === "number" ? scoring.overall_score : null,
      submission_readiness: typeof scoring?.submission_readiness === "string" ? scoring.submission_readiness : null,
      error_message: r.error_message,
      created_at: r.created_at,
    };
  });

  return NextResponse.json({ reviews: summaries });
}
