import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";

export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { error } = await auth.serviceClient
    .from("questions_sets")
    .update({ approved: true })
    .eq("id", id);

  if (error) {
    console.error("Approve questions set error:", error);
    return NextResponse.json({ error: "Failed to approve" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
