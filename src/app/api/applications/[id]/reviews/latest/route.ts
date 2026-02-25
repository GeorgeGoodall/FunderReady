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

  // Verify ownership (RLS enforced)
  const { data: application } = await supabase
    .from("applications")
    .select("id, status")
    .eq("id", id)
    .single();

  if (!application) {
    return NextResponse.json({ error: "Application not found" }, { status: 404 });
  }

  // Fetch latest review by review_number desc
  const { data: review } = await supabase
    .from("application_reviews")
    .select("id, review_number, status, progress, results, error_message, created_at")
    .eq("application_id", id)
    .order("review_number", { ascending: false })
    .limit(1)
    .single();

  if (!review) {
    return NextResponse.json({ error: "No reviews found" }, { status: 404 });
  }

  return NextResponse.json({
    review,
    applicationStatus: application.status,
  });
}
