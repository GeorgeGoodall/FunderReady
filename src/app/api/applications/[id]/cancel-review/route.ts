import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export async function POST(
  _request: Request,
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

  const serviceClient = createServiceClient();
  const { data: result, error: rpcError } = await serviceClient.rpc("cancel_review", {
    p_application_id: id,
    p_user_id: user.id,
  });

  if (rpcError) {
    return NextResponse.json({ error: "Failed to cancel review" }, { status: 500 });
  }

  if (result === "not_found") {
    return NextResponse.json({ error: "Application not found" }, { status: 404 });
  }

  if (result === "not_queued") {
    return NextResponse.json(
      { error: "Application is not queued for review" },
      { status: 409 }
    );
  }

  return NextResponse.json({ success: true });
}
