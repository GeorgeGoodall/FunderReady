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

  const record: Record<string, unknown> = {
    name,
    approved: true,
    created_by: auth.userId,
  };
  if (typeof body.url === "string") record.url = body.url;
  if (typeof body.description === "string") record.description = body.description;

  const { data, error } = await auth.serviceClient
    .from("organisations")
    .insert(record)
    .select()
    .single();

  if (error) {
    console.error("Create organisation error:", error);
    return NextResponse.json({ error: "Failed to create" }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
