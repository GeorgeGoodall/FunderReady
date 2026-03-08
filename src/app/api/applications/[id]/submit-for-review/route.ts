import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { inngest } from "@/lib/inngest/client";
import { getUsagePeriod } from "@/lib/usage/period";
import { estimateReviewCost, estimateReviewCostWithStats } from "@/lib/usage/estimate-review-cost";
import { getEstimationStats } from "@/lib/usage/estimation-stats";
import { PLANS } from "@/lib/stripe/plans";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const isDraft = body.is_draft === true;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify ownership and status (RLS enforced)
  const { data: application } = await supabase
    .from("applications")
    .select("id, status, review_count, fund_id, criteria_set_id, questions_set_id")
    .eq("id", id)
    .single();

  if (!application) {
    return NextResponse.json({ error: "Application not found" }, { status: 404 });
  }

  if (application.status !== "draft" && application.status !== "reviewed") {
    return NextResponse.json(
      { error: "Application is already being reviewed" },
      { status: 409 }
    );
  }

  const serviceClient = createServiceClient();

  // Get profile for tier, status, and billing period
  const { data: profile } = await serviceClient
    .from("profiles")
    .select("subscription_tier, subscription_status, current_period_end")
    .eq("id", user.id)
    .single();

  const tier = (profile?.subscription_tier ?? "free") as keyof typeof PLANS;

  const validTiers = Object.keys(PLANS) as Array<keyof typeof PLANS>;
  if (!validTiers.includes(tier)) {
    return NextResponse.json({ error: "Invalid subscription tier" }, { status: 403 });
  }

  if (tier === "free") {
    return NextResponse.json(
      { error: "Active subscription required" },
      { status: 403 }
    );
  }

  if (profile?.subscription_status !== "active") {
    return NextResponse.json(
      { error: "Active subscription required" },
      { status: 403 }
    );
  }

  const defaultLimit = PLANS[tier]?.creditsPerMonth ?? 0;
  const { periodKey: period } = getUsagePeriod(tier, profile?.current_period_end);

  // Check there are non-empty, non-disabled answers
  const { data: answers } = await supabase
    .from("application_answers")
    .select("question_id, answer_text, is_disabled, last_reviewed_text")
    .eq("application_id", id);

  const enabledAnswers = (answers ?? []).filter(
    (a) => !a.is_disabled && a.answer_text.trim().length > 0
  );
  if (enabledAnswers.length === 0) {
    return NextResponse.json(
      { error: "At least one answer must be filled in" },
      { status: 400 }
    );
  }

  // Check if previous review used the same criteria set (for reuse estimation)
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

  // Try stats-based estimate, fall back to hardcoded
  const stats = await getEstimationStats();
  const answerTexts = enabledAnswers.map((a) => a.answer_text);
  const statsEstimate = estimateReviewCostWithStats(
    freshCount, enabledAnswers.length, answerTexts, stats
  );
  const fallbackEstimate = estimateReviewCost(freshCount, enabledAnswers.length);
  const estimate = statsEstimate ?? fallbackEstimate;

  // When no stats available, use fallback estimate's low value (minimum 1)
  const gatingCredits = estimate.low > 0 ? estimate.low : 1;

  const reviewNumber = application.review_count + 1;

  // Atomic: check credits + in-progress + create review
  const { data: rpcResult, error: rpcError } = await serviceClient.rpc(
    "submit_review",
    {
      p_application_id: id,
      p_user_id: user.id,
      p_review_number: reviewNumber,
      p_questions_set_id: application.questions_set_id,
      p_criteria_set_id: application.criteria_set_id,
      p_period: period,
      p_default_limit: defaultLimit,
      p_estimated_credits_low: gatingCredits,
      p_is_draft: isDraft,
    }
  );

  if (rpcError) {
    if (rpcError.message?.includes("INSUFFICIENT_CREDITS")) {
      return NextResponse.json(
        { error: "Insufficient credits", estimate },
        { status: 402 }
      );
    }
    if (rpcError.message?.includes("REVIEW_IN_PROGRESS")) {
      return NextResponse.json(
        { error: "You already have a review in progress" },
        { status: 409 }
      );
    }
    console.error("submit_review RPC error:", rpcError);
    return NextResponse.json(
      { error: "Failed to submit review" },
      { status: 500 }
    );
  }

  const reviewId = rpcResult?.[0]?.review_id ?? rpcResult?.review_id;
  if (!reviewId) {
    console.error("submit_review RPC returned no review_id:", rpcResult);
    return NextResponse.json(
      { error: "Failed to create review" },
      { status: 500 }
    );
  }

  // Fire Inngest event — non-fatal if Inngest is unavailable (review already created)
  try {
    await inngest.send({
      name: "application/review-requested",
      data: {
        applicationId: id,
        reviewId,
        reviewNumber,
        userId: user.id,
        isDraft,
      },
    });
  } catch (err) {
    console.error("Failed to send Inngest event (review still created):", err);
  }

  return NextResponse.json(
    { reviewId, reviewNumber, estimate },
    { status: 201 }
  );
}
