import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => ({}));

  if (!body.fund_id || typeof body.fund_id !== "string") {
    return NextResponse.json(
      { error: "fund_id is required" },
      { status: 400 }
    );
  }

  if (!body.criteria_json) {
    return NextResponse.json(
      { error: "criteria_json is required" },
      { status: 400 }
    );
  }

  if (!body.name || typeof body.name !== "string") {
    return NextResponse.json(
      { error: "name is required" },
      { status: 400 }
    );
  }

  const record: Record<string, unknown> = {
    fund_id: body.fund_id,
    criteria_json: body.criteria_json,
    name: body.name,
    approved: true,
    created_by: auth.userId,
  };
  if (typeof body.label === "string") record.label = body.label;
  if (typeof body.description === "string") record.description = body.description;

  const { data, error } = await auth.serviceClient
    .from("criteria_sets")
    .insert(record)
    .select()
    .single();

  if (error) {
    console.error("Create criteria set error:", error);
    return NextResponse.json({ error: "Failed to create" }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
