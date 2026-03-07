import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: funds, error } = await supabase
    .from("funds")
    .select("id, name, organisation_id, organisations(id, name), url, notes, approved, shared, created_at")
    .eq("created_by", user.id)
    .eq("creator_hidden", false)
    .eq("rejected", false)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("My funds fetch error:", error);
    return NextResponse.json({ error: "Failed to fetch funds" }, { status: 500 });
  }

  return NextResponse.json({ funds: funds ?? [] });
}
