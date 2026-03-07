import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => ({}));

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json(
      { error: "name is required" },
      { status: 400 }
    );
  }

  if (!body.organisation_id || typeof body.organisation_id !== "string") {
    return NextResponse.json(
      { error: "organisation_id is required" },
      { status: 400 }
    );
  }

  const record: Record<string, unknown> = {
    name,
    organisation_id: body.organisation_id,
    approved: true,
    shared: true,
    created_by: auth.userId,
  };
  if (typeof body.url === "string") record.url = body.url;
  if (typeof body.notes === "string") record.notes = body.notes;

  const { data, error } = await auth.serviceClient
    .from("funds")
    .insert(record)
    .select()
    .single();

  if (error) {
    console.error("Create fund error:", error);
    return NextResponse.json({ error: "Failed to create" }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
