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
    .map((w) => w.replace(/[!&|():<>\\]/g, ""))
    .filter((w) => w.length > 0)
    .map((w) => `${w}:*`)
    .join(" & ");

  if (!tsQuery) {
    return NextResponse.json({ funds: [] });
  }

  const fundSelect = "id, name, organisation_id, organisations(id, name), url, notes, opens_at, closes_at, created_at, application_format, created_by";

  // Search funds by name — two passes: community funds + user's own
  const [{ data: communityByName, error: nameError }, { data: ownByName }] = await Promise.all([
    supabase
      .from("funds")
      .select(fundSelect)
      .textSearch("name", tsQuery)
      .eq("approved", true)
      .eq("shared", true)
      .eq("rejected", false)
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("funds")
      .select(fundSelect)
      .textSearch("name", tsQuery)
      .eq("created_by", user.id)
      .eq("rejected", false)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

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
    .eq("rejected", false)
    .limit(20);

  let communityByOrg: NonNullable<typeof communityByName> = [];
  let ownByOrg: NonNullable<typeof communityByName> = [];
  if (matchingOrgs && matchingOrgs.length > 0) {
    const orgIds = matchingOrgs.map((o) => o.id);
    const [{ data: comOrgFunds }, { data: ownOrgFunds }] = await Promise.all([
      supabase
        .from("funds")
        .select(fundSelect)
        .in("organisation_id", orgIds)
        .eq("approved", true)
        .eq("shared", true)
        .eq("rejected", false)
        .order("created_at", { ascending: false })
        .limit(10),
      supabase
        .from("funds")
        .select(fundSelect)
        .in("organisation_id", orgIds)
        .eq("created_by", user.id)
        .eq("rejected", false)
        .order("created_at", { ascending: false })
        .limit(10),
    ]);
    communityByOrg = comOrgFunds ?? [];
    ownByOrg = ownOrgFunds ?? [];
  }

  // Merge + deduplicate by fund id, tagging user's own funds
  // Own funds are added first so is_own is preserved on duplicates
  const seen = new Set<string>();
  const funds: Array<{ id: string; name: string; organisation_id: string | null; organisations: unknown; url: string | null; notes: string | null; opens_at: string | null; closes_at: string | null; created_at: string; application_format: string; is_own: boolean }> = [];
  const allOwn = [...(ownByName ?? []), ...ownByOrg];
  const allCommunity = [...(communityByName ?? []), ...communityByOrg];
  for (const f of [...allOwn, ...allCommunity]) {
    if (!seen.has(f.id)) {
      seen.add(f.id);
      const { created_by, ...rest } = f;
      funds.push({ ...rest, is_own: created_by === user.id });
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

  const { data: profile } = await supabase
    .from("profiles")
    .select("subscription_tier")
    .eq("id", user.id)
    .single();

  if (profile?.subscription_tier !== "pro") {
    return NextResponse.json(
      { error: "Pro subscription required" },
      { status: 403 }
    );
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

  const { name, organisation_id, url, notes, opens_at, closes_at, shared, application_format } = parsed.data;

  if (opens_at && closes_at && new Date(opens_at) > new Date(closes_at)) {
    return NextResponse.json(
      { error: "opens_at must be before closes_at" },
      { status: 400 }
    );
  }

  // Validate organisation exists if provided
  if (organisation_id) {
    const serviceClient = createServiceClient();
    const { data: org } = await serviceClient
      .from("organisations")
      .select("id")
      .eq("id", organisation_id)
      .eq("rejected", false)
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
      opens_at: opens_at ?? null,
      closes_at: closes_at ?? null,
      shared: shared ?? false,
      application_format: application_format ?? "question_form",
      created_by: user.id,
    })
    .select("id, name, organisation_id, organisations(id, name), url, notes, opens_at, closes_at, created_at, application_format")
    .single();

  if (error) {
    console.error("Fund create error:", error);
    return NextResponse.json({ error: "Failed to create fund" }, { status: 500 });
  }

  return NextResponse.json({ fund }, { status: 201 });
}
