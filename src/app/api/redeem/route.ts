import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const code = typeof body.code === "string" ? body.code.trim() : "";

  if (!code) {
    return NextResponse.json({ error: "code is required" }, { status: 400 });
  }

  const service = createServiceClient();

  // Pre-read: get link details
  const { data: link } = await service
    .from("gift_links")
    .select("id, credits, redeemed_at, expires_at")
    .eq("code", code)
    .maybeSingle();

  if (!link) {
    return NextResponse.json({ error: "Gift link not found" }, { status: 404 });
  }

  if (link.redeemed_at) {
    return NextResponse.json({ error: "This link has already been used" }, { status: 410 });
  }

  if (link.expires_at && new Date(link.expires_at) < new Date()) {
    return NextResponse.json({ error: "This link has expired" }, { status: 422 });
  }

  // Atomic claim: only succeeds if redeemed_at is still NULL
  const { data: claimed } = await service
    .from("gift_links")
    .update({
      redeemed_by: user.id,
      redeemed_at: new Date().toISOString(),
    })
    .eq("code", code)
    .is("redeemed_at", null)
    .select()
    .maybeSingle();

  if (!claimed) {
    // Race condition — another request claimed it first
    return NextResponse.json({ error: "This link has already been used" }, { status: 410 });
  }

  // Grant credits
  await service.rpc("increment_purchased_credits", {
    p_user_id: user.id,
    p_credits: link.credits,
  });

  return NextResponse.json({ credits: link.credits });
}
