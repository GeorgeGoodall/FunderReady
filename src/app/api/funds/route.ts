import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { CreateFundSchema } from "@/lib/schemas/criteria";

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();

  if (!q || q.length < 2) {
    return NextResponse.json({ funds: [] });
  }

  // Full-text search on name and funder_organisation
  const tsQuery = q
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => `${w}:*`)
    .join(" & ");

  const { data: funds, error } = await supabase
    .from("funds")
    .select("id, name, funder_organisation, url, notes, created_at")
    .or(
      `name.fts.${tsQuery},funder_organisation.fts.${tsQuery}`
    )
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) {
    console.error("Fund search error:", error);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }

  return NextResponse.json({ funds: funds ?? [] });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = CreateFundSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? "Invalid request" },
      { status: 400 }
    );
  }

  const { name, funder_organisation, url, notes } = parsed.data;

  const { data: fund, error } = await supabase
    .from("funds")
    .insert({
      name,
      funder_organisation: funder_organisation ?? null,
      url: url ?? null,
      notes: notes ?? null,
      created_by: user.id,
    })
    .select("id, name, funder_organisation, url, notes, created_at")
    .single();

  if (error) {
    console.error("Fund create error:", error);
    return NextResponse.json({ error: "Failed to create fund" }, { status: 500 });
  }

  return NextResponse.json({ fund }, { status: 201 });
}
