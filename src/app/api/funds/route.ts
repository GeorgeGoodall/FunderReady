import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
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

  const tsQuery = q
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => `${w}:*`)
    .join(" & ");

  // Search funds by name
  const { data: fundsByName, error: nameError } = await supabase
    .from("funds")
    .select("id, name, organisation_id, organisations(id, name), url, notes, created_at")
    .textSearch("name", tsQuery)
    .order("created_at", { ascending: false })
    .limit(10);

  if (nameError) {
    console.error("Fund search error:", nameError);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }

  // Search organisations by name to find matching funds via org
  const { data: matchingOrgs } = await supabase
    .from("organisations")
    .select("id")
    .textSearch("name", tsQuery)
    .or(`approved.eq.true,created_by.eq.${user.id}`)
    .limit(20);

  let fundsByOrg: typeof fundsByName = [];
  if (matchingOrgs && matchingOrgs.length > 0) {
    const orgIds = matchingOrgs.map((o) => o.id);
    const { data: orgFunds } = await supabase
      .from("funds")
      .select("id, name, organisation_id, organisations(id, name), url, notes, created_at")
      .in("organisation_id", orgIds)
      .order("created_at", { ascending: false })
      .limit(10);
    fundsByOrg = orgFunds ?? [];
  }

  // Merge + deduplicate by fund id
  const seen = new Set<string>();
  const funds: typeof fundsByName = [];
  for (const f of [...(fundsByName ?? []), ...fundsByOrg]) {
    if (!seen.has(f.id)) {
      seen.add(f.id);
      funds.push(f);
    }
  }
  funds.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  return NextResponse.json({ funds: funds.slice(0, 10) });
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

  const { name, organisation_id, url, notes } = parsed.data;

  // Validate organisation exists if provided
  if (organisation_id) {
    const serviceClient = createServiceClient();
    const { data: org } = await serviceClient
      .from("organisations")
      .select("id")
      .eq("id", organisation_id)
      .single();
    if (!org) {
      return NextResponse.json({ error: "Organisation not found" }, { status: 400 });
    }
  }

  const { data: fund, error } = await supabase
    .from("funds")
    .insert({
      name,
      organisation_id: organisation_id ?? null,
      url: url ?? null,
      notes: notes ?? null,
      created_by: user.id,
    })
    .select("id, name, organisation_id, organisations(id, name), url, notes, created_at")
    .single();

  if (error) {
    console.error("Fund create error:", error);
    return NextResponse.json({ error: "Failed to create fund" }, { status: 500 });
  }

  return NextResponse.json({ fund }, { status: 201 });
}
