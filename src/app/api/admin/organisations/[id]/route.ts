import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";

const ALLOWED_FIELDS = ["name", "url", "description"] as const;

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => ({}));

  const updates: Record<string, unknown> = {};
  for (const field of ALLOWED_FIELDS) {
    if (field in body) {
      updates[field] = body[field];
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { error: "No valid fields provided" },
      { status: 400 }
    );
  }

  const STRING_FIELDS = ["name", "url", "description"];
  for (const field of STRING_FIELDS) {
    if (field in updates && typeof updates[field] !== "string") {
      return NextResponse.json(
        { error: `${field} must be a string` },
        { status: 400 }
      );
    }
  }

  if (typeof updates.name === "string" && updates.name.trim().length === 0) {
    return NextResponse.json(
      { error: "name must not be empty" },
      { status: 400 }
    );
  }

  if (typeof updates.url === "string" && updates.url.trim().length > 0 && !/^https?:\/\//i.test(updates.url as string)) {
    return NextResponse.json(
      { error: "url must start with http:// or https://" },
      { status: 400 }
    );
  }

  const { data, error } = await auth.serviceClient
    .from("organisations")
    .update(updates)
    .eq("id", id)
    .select("id")
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    console.error("Edit organisation error:", error);
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  // Check if organisation has funds
  const { count, error: countError } = await auth.serviceClient
    .from("funds")
    .select("id", { count: "exact", head: true })
    .eq("organisation_id", id);

  if (countError) {
    console.error("Check org funds error:", countError);
    return NextResponse.json(
      { error: "Failed to check dependencies" },
      { status: 500 }
    );
  }

  if (count && count > 0) {
    return NextResponse.json(
      { error: "Cannot delete organisation with existing funds" },
      { status: 409 }
    );
  }

  const { error } = await auth.serviceClient
    .from("organisations")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("Delete organisation error:", error);
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  }

  return new NextResponse(null, { status: 204 });
}
