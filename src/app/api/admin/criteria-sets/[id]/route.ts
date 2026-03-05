import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { error } = await auth.serviceClient
    .from("criteria_sets")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("Delete criteria set error:", error);
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  }

  return new NextResponse(null, { status: 204 });
}
