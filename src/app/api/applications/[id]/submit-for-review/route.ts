import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { inngest } from "@/lib/inngest/client";
import { getUsagePeriod } from "@/lib/usage/period";

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

  // Get profile for tier and billing period
  const { data: profile } = await serviceClient
    .from("profiles")
    .select("subscription_tier, current_period_end")
    .eq("id", user.id)
    .single();

  const tier = profile?.subscription_tier ?? "free";

  if (tier !== "pro") {
    return NextResponse.json(
      { error: "Active subscription required" },
      { status: 403 }
    );
  }

  const defaultLimit = 10;
  const { periodKey: period } = getUsagePeriod(tier, profile?.current_period_end);

  // Upsert usage row
  await serviceClient.from("usage").upsert(
    {
      user_id: user.id,
      period,
      reviews_used: 0,
      reviews_limit: defaultLimit,
      bonus_reviews: 0,
    },
    { onConflict: "user_id,period", ignoreDuplicates: true }
  );

  // Check remaining reviews
  const { data: usage } = await serviceClient
    .from("usage")
    .select("reviews_used, reviews_limit, bonus_reviews")
    .eq("user_id", user.id)
    .eq("period", period)
    .single();

  if (!usage) {
    return NextResponse.json({ error: "Usage check failed" }, { status: 500 });
  }

  const effectiveLimit = usage.reviews_limit + (usage.bonus_reviews ?? 0);
  if (usage.reviews_used >= effectiveLimit) {
    return NextResponse.json(
      { error: "Monthly review limit reached" },
      { status: 403 }
    );
  }

  // Check there are non-empty, non-disabled answers
  const { data: answers } = await supabase
    .from("application_answers")
    .select("question_id, answer_text, is_disabled")
    .eq("application_id", id);

  const nonEmptyCount = (answers ?? []).filter(
    (a) => !a.is_disabled && a.answer_text.trim().length > 0
  ).length;
  if (nonEmptyCount === 0) {
    return NextResponse.json(
      { error: "At least one answer must be filled in" },
      { status: 400 }
    );
  }

  const reviewNumber = application.review_count + 1;

  // Create application_reviews row
  const { data: review, error: reviewError } = await serviceClient
    .from("application_reviews")
    .insert({
      application_id: id,
      review_number: reviewNumber,
      status: "pending",
      progress: {},
      questions_set_id: application.questions_set_id,
      criteria_set_id: application.criteria_set_id,
    })
    .select("id")
    .single();

  if (reviewError || !review) {
    console.error("application_reviews insert error:", reviewError);
    return NextResponse.json(
      { error: "Failed to create review" },
      { status: 500 }
    );
  }

  // Update application status + increment review count and usage
  await Promise.all([
    serviceClient
      .from("applications")
      .update({
        status: "submitted_for_review",
        review_count: reviewNumber,
      })
      .eq("id", id),
    serviceClient
      .from("usage")
      .update({ reviews_used: usage.reviews_used + 1 })
      .eq("user_id", user.id)
      .eq("period", period),
  ]);

  // Fire Inngest event
  await inngest.send({
    name: "application/review-requested",
    data: {
      applicationId: id,
      reviewId: review.id,
      reviewNumber,
      userId: user.id,
    },
  });

  return NextResponse.json(
    { reviewId: review.id, reviewNumber },
    { status: 201 }
  );
}
