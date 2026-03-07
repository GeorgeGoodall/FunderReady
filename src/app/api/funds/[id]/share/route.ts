import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
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

  if (typeof (body as Record<string, unknown>)?.shared !== "boolean") {
    return NextResponse.json(
      { error: "shared must be a boolean" },
      { status: 400 }
    );
  }

  const shared = (body as { shared: boolean }).shared;

  // Fetch fund — must belong to this user
  const { data: fund, error: fetchError } = await supabase
    .from("funds")
    .select("id, approved, shared, created_by")
    .eq("id", id)
    .eq("created_by", user.id)
    .eq("rejected", false)
    .single();

  if (fetchError || !fund) {
    return NextResponse.json({ error: "Fund not found" }, { status: 404 });
  }

  // Cannot unshare an approved fund
  if (!shared && fund.approved) {
    return NextResponse.json(
      { error: "Cannot unshare an approved fund" },
      { status: 400 }
    );
  }

  // No-op if already in desired state
  if (fund.shared === shared) {
    return NextResponse.json({ success: true });
  }

  const { error: updateError } = await supabase
    .from("funds")
    .update({ shared })
    .eq("id", id)
    .eq("created_by", user.id);

  if (updateError) {
    console.error("Share toggle error:", updateError);
    return NextResponse.json(
      { error: "Failed to update sharing" },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
