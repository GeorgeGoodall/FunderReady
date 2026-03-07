import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";

export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  // Verify fund is shared (submitted for community review)
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
    .update({ approved: true, rejected: false, rejection_reason: null })
    .eq("id", id)
    .select("id")
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    console.error("Approve fund error:", error);
    return NextResponse.json({ error: "Failed to approve" }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
