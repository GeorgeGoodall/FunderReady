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

  const { error } = await auth.serviceClient
    .from("questions_sets")
    .update({ rejected: true, rejection_reason: reason })
    .eq("id", id);

  if (error) {
    console.error("Reject questions set error:", error);
    return NextResponse.json({ error: "Failed to reject" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
