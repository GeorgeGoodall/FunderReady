import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => ({}));
  const reason = typeof body.reason === "string" ? body.reason : null;

  // Verify fund exists and has been submitted for sharing
  const { data: fund } = await auth.serviceClient
    .from("funds")
    .select("shared")
    .eq("id", id)
    .single();

  if (!fund) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!fund.shared) {
    return NextResponse.json(
      { error: "Fund has not been submitted for sharing" },
      { status: 400 }
    );
  }

  const { data, error } = await auth.serviceClient
    .from("funds")
    .update({ rejected: true, rejection_reason: reason, approved: false })
    .eq("id", id)
    .select("id")
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    console.error("Reject fund error:", error);
    return NextResponse.json({ error: "Failed to reject" }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
