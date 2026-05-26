import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { estimateReviewCostWithStats } from "@/lib/usage/estimate-review-cost";
import { checkUsage } from "@/lib/usage/check-usage";
import { getEstimationStats } from "@/lib/usage/estimation-stats";

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

  // Load application to get current criteria set
  const { data: application } = await supabase
    .from("applications")
    .select("criteria_set_id")
    .eq("id", id)
    .single();

  if (!application) {
    return NextResponse.json({ error: "Application not found" }, { status: 404 });
  }

  // Load answers with last_reviewed_text for change detection
  const { data: answers } = await supabase
    .from("application_answers")
    .select("question_id, answer_text, is_disabled, last_reviewed_text")
    .eq("application_id", id);

  const enabledAnswers = (answers ?? []).filter(
    (a) => !a.is_disabled && a.answer_text.trim().length > 0
  );

  // Check if previous review used the same criteria set
  const { data: prevReview } = await supabase
    .from("application_reviews")
    .select("criteria_set_id")
    .eq("application_id", id)
    .eq("status", "completed")
    .order("review_number", { ascending: false })
    .limit(1)
    .single();

  const criteriaSetMatch = prevReview?.criteria_set_id === application.criteria_set_id;

  // Count fresh answers (changed or never reviewed, or criteria set changed)
  const freshCount = enabledAnswers.filter((a) => {
    if (!criteriaSetMatch) return true;
    if (a.last_reviewed_text === null || a.last_reviewed_text === undefined) return true;
    return a.answer_text !== a.last_reviewed_text;
  }).length;

  const usage = await checkUsage(supabase, user.id);

  // Try stats-based estimate first
  const stats = await getEstimationStats();
  const answerTexts = enabledAnswers.map((a) => a.answer_text);
  const statsEstimate = estimateReviewCostWithStats(
    freshCount, enabledAnswers.length, answerTexts, stats
  );

  if (statsEstimate) {
    return NextResponse.json({
      estimate: statsEstimate,
      credits: {
        remaining: usage.remaining,
        period: Math.max(0, usage.limit - usage.used),
      },
      canAfford: usage.remaining >= statsEstimate.low,
    });
  }

  // Not enough historical data — no estimate shown
  return NextResponse.json({
    estimate: null,
    credits: {
      remaining: usage.remaining,
      period: Math.max(0, usage.limit - usage.used),
    },
    canAfford: usage.remaining > 0,
  });
}
