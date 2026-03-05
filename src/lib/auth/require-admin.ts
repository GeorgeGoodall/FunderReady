import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

type AdminResult =
  | { error: NextResponse; serviceClient?: undefined; userId?: undefined }
  | {
      error?: undefined;
      serviceClient: ReturnType<typeof createServiceClient>;
      userId: string;
    };

export async function requireAdmin(): Promise<AdminResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const serviceClient = createServiceClient();
  const { data: profile } = await serviceClient
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();

  if (!profile?.is_admin) {
    return {
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return { serviceClient, userId: user.id };
}
