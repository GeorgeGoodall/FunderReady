import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { SubmitReviewRequestV2Schema } from "@/lib/schemas/criteria";
import { inngest } from "@/lib/inngest/client";
import { getUsagePeriod } from "@/lib/usage/period";

export async function POST(request: Request) {
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

  const parsed = SubmitReviewRequestV2Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? "Invalid request" },
      { status: 400 }
    );
  }

  const { bidFileName, bidFilePath, fundId, criteriaSetId, questionsSetId, completeDraft } = parsed.data;
  const serviceClient = createServiceClient();

  // Get profile for model tier and billing period
  const { data: profile } = await serviceClient
    .from("profiles")
    .select("subscription_tier, current_period_end")
    .eq("id", user.id)
    .single();

  const tier = profile?.subscription_tier ?? "free";

  // Free tier users cannot submit reviews — must subscribe to Pro
  if (tier !== "pro") {
    return NextResponse.json(
      { error: "Active subscription required" },
      { status: 403 }
    );
  }

  const modelTier = "sonnet";
  const defaultLimit = 10;
  const { periodKey: period } = getUsagePeriod(tier, profile?.current_period_end);

  // Upsert usage row (atomic — won't fail if it already exists)
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

  // Validate that criteria set exists and belongs to the fund
  const { data: criteriaSet } = await serviceClient
    .from("criteria_sets")
    .select("id, fund_id")
    .eq("id", criteriaSetId)
    .single();

  if (!criteriaSet || criteriaSet.fund_id !== fundId) {
    return NextResponse.json(
      { error: "Invalid criteria set for this fund" },
      { status: 400 }
    );
  }

  // Validate questions set if provided
  if (questionsSetId) {
    const { data: questionsSet } = await serviceClient
      .from("questions_sets")
      .select("id, fund_id")
      .eq("id", questionsSetId)
      .single();

    if (!questionsSet || questionsSet.fund_id !== fundId) {
      return NextResponse.json(
        { error: "Invalid questions set for this fund" },
        { status: 400 }
      );
    }
  }

  // Create review row (RLS enforced via user's client)
  const { data: review, error: reviewError } = await supabase
    .from("reviews")
    .insert({
      user_id: user.id,
      status: "pending",
      bid_file_name: bidFileName,
      bid_file_path: bidFilePath,
      fund_id: fundId,
      criteria_set_id: criteriaSetId,
      questions_set_id: questionsSetId ?? null,
      model_tier: modelTier,
    })
    .select("id")
    .single();

  if (reviewError || !review) {
    console.error("review insert error:", reviewError);
    return NextResponse.json({ error: "Failed to create review" }, { status: 500 });
  }

  // Create review_results row + increment usage (service client for cross-table ops)
  const [resultsRes, usageRes] = await Promise.all([
    serviceClient.from("review_results").insert({
      review_id: review.id,
      progress: {},
      results: {},
    }),
    serviceClient
      .from("usage")
      .update({ reviews_used: usage.reviews_used + 1 })
      .eq("user_id", user.id)
      .eq("period", period),
  ]);

  if (resultsRes.error) {
    console.error("review_results insert error:", resultsRes.error);
  }
  if (usageRes.error) {
    console.error("usage update error:", usageRes.error);
  }

  // Estimate document size for advisory warning (~200 words per KB for .docx)
  let warning: string | undefined;
  const folderPath = bidFilePath.substring(0, bidFilePath.lastIndexOf("/"));
  const fileName = bidFilePath.substring(bidFilePath.lastIndexOf("/") + 1);
  const { data: fileList } = await serviceClient.storage
    .from("bid-uploads")
    .list(folderPath, { search: fileName, limit: 1 });
  const fileSizeBytes = fileList?.[0]?.metadata?.size;
  if (typeof fileSizeBytes === "number") {
    const estimatedWords = Math.round((fileSizeBytes / 1024) * 200);
    if (estimatedWords > 30_000) warning = "large_document";
  }

  // Fire Inngest event
  await inngest.send({
    name: "review/submitted",
    data: {
      reviewId: review.id,
      userId: user.id,
      completeDraft,
      hasQuestions: !!questionsSetId,
    },
  });

  return NextResponse.json(
    { reviewId: review.id, ...(warning && { warning }) },
    { status: 201 }
  );
}
