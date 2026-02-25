import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export async function PATCH(
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

  // Check admin
  const serviceClient = createServiceClient();
  const { data: profile } = await serviceClient
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();

  if (!profile?.is_admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { error } = await serviceClient
    .from("criteria_sets")
    .update({ approved: true })
    .eq("id", id);

  if (error) {
    console.error("Approve criteria set error:", error);
    return NextResponse.json({ error: "Failed to approve" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
