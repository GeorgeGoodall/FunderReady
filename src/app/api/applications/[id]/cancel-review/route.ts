import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(
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

  // RLS enforces ownership — if application doesn't exist or belongs to
  // another user, this returns null
  const { data: application, error: appError } = await supabase
    .from("applications")
    .select("id, status")
    .eq("id", id)
    .single();

  if (appError || !application) {
    return NextResponse.json({ error: "Application not found" }, { status: 404 });
  }

  if (application.status !== "submitted_for_review") {
    return NextResponse.json(
      { error: "Application is not queued for review" },
      { status: 409 }
    );
  }

  // Mark any pending review records as failed
  const { error: reviewError } = await supabase
    .from("application_reviews")
    .update({
      status: "failed",
      error_message: "Cancelled by user",
    })
    .eq("application_id", id)
    .in("status", ["pending"]);

  if (reviewError) {
    return NextResponse.json({ error: "Failed to cancel review" }, { status: 500 });
  }

  // Reset application to draft
  const { error: appUpdateError } = await supabase
    .from("applications")
    .update({ status: "draft" })
    .eq("id", id);

  if (appUpdateError) {
    return NextResponse.json({ error: "Failed to reset application" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
