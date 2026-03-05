import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";

const ALLOWED_FIELDS = [
  "name",
  "url",
  "notes",
  "published",
  "organisation_id",
] as const;

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

  const STRING_FIELDS = ["name", "url", "notes", "organisation_id"];
  const BOOLEAN_FIELDS = ["published"];
  for (const field of STRING_FIELDS) {
    if (field in updates && typeof updates[field] !== "string") {
      return NextResponse.json(
        { error: `${field} must be a string` },
        { status: 400 }
      );
    }
  }
  for (const field of BOOLEAN_FIELDS) {
    if (field in updates && typeof updates[field] !== "boolean") {
      return NextResponse.json(
        { error: `${field} must be a boolean` },
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
    .from("funds")
    .update(updates)
    .eq("id", id)
    .select("id")
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    console.error("Edit fund error:", error);
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

  // Check for dependent sets and applications
  const [
    { count: criteriaCount, error: criteriaErr },
    { count: questionsCount, error: questionsErr },
    { count: appsCount, error: appsErr },
  ] = await Promise.all([
    auth.serviceClient
      .from("criteria_sets")
      .select("id", { count: "exact", head: true })
      .eq("fund_id", id),
    auth.serviceClient
      .from("questions_sets")
      .select("id", { count: "exact", head: true })
      .eq("fund_id", id),
    auth.serviceClient
      .from("applications")
      .select("id", { count: "exact", head: true })
      .eq("fund_id", id),
  ]);

  if (criteriaErr || questionsErr || appsErr) {
    console.error("Check fund dependencies error:", criteriaErr || questionsErr || appsErr);
    return NextResponse.json({ error: "Failed to check dependencies" }, { status: 500 });
  }

  if ((criteriaCount && criteriaCount > 0) || (questionsCount && questionsCount > 0) || (appsCount && appsCount > 0)) {
    return NextResponse.json(
      { error: "Cannot delete fund with existing sets or applications" },
      { status: 409 }
    );
  }

  const { error } = await auth.serviceClient
    .from("funds")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("Delete fund error:", error);
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  }

  return new NextResponse(null, { status: 204 });
}
