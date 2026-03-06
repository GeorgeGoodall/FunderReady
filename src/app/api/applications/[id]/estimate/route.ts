import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { estimateReviewCost } from "@/lib/usage/estimate-review-cost";
import { checkUsage } from "@/lib/usage/check-usage";

export async function GET(
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

  // Count enabled non-empty answers
  const { data: answers } = await supabase
    .from("application_answers")
    .select("question_id, answer_text, is_disabled")
    .eq("application_id", id);

  const enabledCount = (answers ?? []).filter(
    (a) => !a.is_disabled && a.answer_text.trim().length > 0
  ).length;

  const estimate = estimateReviewCost(enabledCount);
  const usage = await checkUsage(supabase, user.id);

  return NextResponse.json({
    estimate,
    credits: {
      remaining: usage.remaining,
      period: Math.max(0, usage.limit - usage.used),
      purchased: usage.purchased,
    },
    canAfford: usage.remaining >= estimate.low,
  });
}
