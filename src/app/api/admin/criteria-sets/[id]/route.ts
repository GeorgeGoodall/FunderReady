import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { count, error: countError } = await auth.serviceClient
    .from("applications")
    .select("id", { count: "exact", head: true })
    .eq("criteria_set_id", id);

  if (countError) {
    console.error("Check criteria set dependencies error:", countError);
    return NextResponse.json({ error: "Failed to check dependencies" }, { status: 500 });
  }

  if (count && count > 0) {
    return NextResponse.json(
      { error: "Cannot delete criteria set with existing applications" },
      { status: 409 }
    );
  }

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
