import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
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

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const limit = Math.min(
    50,
    Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10) || 20)
  );

  const from = (page - 1) * limit;
  const to = from + limit; // fetch one extra to determine hasMore

  const { data: funds, error } = await supabase
    .from("funds")
    .select(
      "id, name, organisation_id, organisations(id, name), url, notes, opens_at, closes_at, created_at"
    )
    .eq("published", true)
    .eq("rejected", false)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) {
    console.error("Fund browse error:", error);
    return NextResponse.json(
      { error: "Failed to fetch funds" },
      { status: 500 }
    );
  }

  const hasMore = (funds?.length ?? 0) > limit;
  const trimmed = (funds ?? []).slice(0, limit);

  return NextResponse.json({ funds: trimmed, hasMore });
}
