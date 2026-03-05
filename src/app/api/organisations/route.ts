import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { CreateOrganisationSchema } from "@/lib/schemas/criteria";

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
    // Return user's own orgs when no query
    const { data: orgs, error } = await supabase
      .from("organisations")
      .select("id, name, url, description, approved")
      .eq("created_by", user.id)
      .eq("rejected", false)
      .order("created_at", { ascending: false })
      .limit(10);

    if (error) {
      return NextResponse.json({ error: "Failed to fetch organisations" }, { status: 500 });
    }

    return NextResponse.json({ organisations: orgs ?? [] });
  }

  const tsQuery = q
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => `${w}:*`)
    .join(" & ");

  // Approved orgs + creator's own unapproved
  const { data: orgs, error } = await supabase
    .from("organisations")
    .select("id, name, url, description, approved")
    .textSearch("name", tsQuery)
    .or(`approved.eq.true,created_by.eq.${user.id}`)
    .eq("rejected", false)
    .order("approved", { ascending: false })
    .order("name")
    .limit(10);

  if (error) {
    console.error("Organisation search error:", error);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }

  return NextResponse.json({ organisations: orgs ?? [] });
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

  const parsed = CreateOrganisationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? "Invalid request" },
      { status: 400 }
    );
  }

  const { name, url, description } = parsed.data;

  const { data: organisation, error } = await supabase
    .from("organisations")
    .insert({
      name,
      url: url ?? null,
      description: description ?? null,
      created_by: user.id,
    })
    .select("id, name, url, description, approved")
    .single();

  if (error) {
    console.error("Organisation create error:", error);
    return NextResponse.json({ error: "Failed to create organisation" }, { status: 500 });
  }

  return NextResponse.json({ organisation }, { status: 201 });
}
