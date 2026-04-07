import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const service = createServiceClient();

  // Gather auth identity (email, created_at, last_sign_in_at)
  const { data: authData } = await service.auth.admin.getUserById(user.id);

  const [
    { data: profile },
    { data: organisations },
    { data: funds },
    { data: criteriaSets },
    { data: questionsSets },
    { data: applications },
    { data: answers },
    { data: reviews },
    { data: feedback },
    { data: usage },
  ] = await Promise.all([
    service.from("profiles").select("*").eq("id", user.id),
    service.from("organisations").select("*").eq("created_by", user.id).order("created_at"),
    service.from("funds").select("*").eq("created_by", user.id).order("created_at"),
    service.from("criteria_sets").select("*").eq("created_by", user.id).order("created_at"),
    service.from("questions_sets").select("*").eq("created_by", user.id).order("created_at"),
    service.from("applications").select("*").eq("user_id", user.id).order("created_at"),
    service.from("application_answers").select("*").eq("user_id", user.id).order("updated_at"),
    service.from("application_reviews").select("*").eq("user_id", user.id).order("created_at"),
    service.from("review_feedback").select("*").eq("user_id", user.id).order("created_at"),
    service.from("usage").select("*").eq("user_id", user.id).order("period"),
  ]);

  const exportPayload = {
    exported_at: new Date().toISOString(),
    account: {
      id: user.id,
      email: authData?.user?.email ?? null,
      created_at: authData?.user?.created_at ?? null,
      last_sign_in_at: authData?.user?.last_sign_in_at ?? null,
    },
    profile: profile ?? [],
    organisations: organisations ?? [],
    funds: funds ?? [],
    criteria_sets: criteriaSets ?? [],
    questions_sets: questionsSets ?? [],
    applications: applications ?? [],
    application_answers: answers ?? [],
    application_reviews: reviews ?? [],
    review_feedback: feedback ?? [],
    usage: usage ?? [],
  };

  const filename = `funderready-data-export-${new Date().toISOString().slice(0, 10)}.json`;

  return new NextResponse(JSON.stringify(exportPayload, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
