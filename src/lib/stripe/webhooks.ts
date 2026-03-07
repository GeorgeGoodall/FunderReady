import Stripe from "stripe";
import { createServiceClient } from "@/lib/supabase/server";
import { PLANS, TOPUP_PACKS, type PlanTier } from "@/lib/stripe/plans";
import { getUsagePeriod } from "@/lib/usage/period";

function mapStripeStatus(status: string): "active" | "past_due" | "cancelled" {
  switch (status) {
    case "active":
    case "trialing":
      return "active";
    case "past_due":
    case "incomplete":
    case "incomplete_expired":
    case "unpaid":
      return "past_due";
    case "canceled":
    case "paused":
      return "cancelled";
    default:
      console.warn(`[stripe] Unknown subscription status: ${status}, defaulting to past_due`);
      return "past_due";
  }
}

function getPeriodEnd(subscription: Stripe.Subscription): string | null {
  const item = subscription.items?.data?.[0];
  if (!item) return null;
  return new Date(item.current_period_end * 1000).toISOString();
}

function tierFromPriceId(priceId: string): PlanTier {
  if (priceId === PLANS.basic.stripePriceId) return "basic";
  if (priceId === PLANS.pro.stripePriceId) return "pro";
  console.warn(`[stripe] Unknown price ID: ${priceId}, defaulting to basic`);
  return "basic";
}

async function syncUsageOnUpgrade(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
  tier: PlanTier,
  currentPeriodEnd: string | null
) {
  const { periodKey: period } = getUsagePeriod(tier, currentPeriodEnd);
  const creditsLimit = PLANS[tier]?.creditsPerMonth ?? 0;
  // Try to insert a new row. If the row already exists (user already has usage
  // data for this period), only update credits_limit — never reset credits_used.
  const { error: insertError } = await supabase.from("usage").insert({
    user_id: userId,
    period,
    credits_limit: creditsLimit,
    credits_used: 0,
    bonus_reviews: 0,
  });
  if (insertError) {
    // Row exists — update only credits_limit, leave credits_used untouched.
    await supabase
      .from("usage")
      .update({ credits_limit: creditsLimit })
      .eq("user_id", userId)
      .eq("period", period);
  }
}

async function syncUsageOnDowngrade(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
  currentPeriodEnd: string | null
) {
  // Use the profile's current_period_end to compute the correct period key
  // (billing-anchored for paid tiers) rather than hardcoding the calendar month.
  const { periodKey: period } = getUsagePeriod("basic", currentPeriodEnd);
  await supabase
    .from("usage")
    .update({ credits_limit: 0 })
    .eq("user_id", userId)
    .eq("period", period);
}

export async function handleCheckoutCompleted(
  session: Stripe.Checkout.Session
) {
  const subscriptionId = session.subscription as string;
  const customerId = session.customer as string;

  if (!subscriptionId || !customerId) {
    console.error("Missing subscription or customer ID in checkout session");
    return;
  }

  const { stripe } = await import("@/lib/stripe/client");
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);

  const priceId = subscription.items?.data?.[0]?.price?.id;
  const tier = priceId ? tierFromPriceId(priceId) : "basic";

  const supabase = createServiceClient();

  // Primary lookup: by stripe_customer_id.
  let { data: profile, error } = await supabase
    .from("profiles")
    .update({
      subscription_tier: tier,
      subscription_status: "active",
      stripe_customer_id: customerId,
      stripe_subscription_id: subscriptionId,
      current_period_end: getPeriodEnd(subscription),
    })
    .eq("stripe_customer_id", customerId)
    .select("id")
    .single();

  // Fallback: if the customer ID hasn't been persisted yet (race with checkout
  // route), look up by supabase_user_id from session metadata.
  if ((error || !profile) && session.metadata?.supabase_user_id) {
    console.warn(
      "[stripe] Profile not found by customer_id, falling back to supabase_user_id:",
      session.metadata.supabase_user_id
    );
    const fallback = await supabase
      .from("profiles")
      .update({
        subscription_tier: tier,
        subscription_status: "active",
        stripe_customer_id: customerId,
        stripe_subscription_id: subscriptionId,
        current_period_end: getPeriodEnd(subscription),
      })
      .eq("id", session.metadata.supabase_user_id)
      .select("id")
      .single();
    profile = fallback.data;
    error = fallback.error;
  }

  if (error || !profile) {
    console.error("Failed to update profile by customer_id or supabase_user_id:", error);
    return;
  }

  await syncUsageOnUpgrade(supabase, profile.id, tier, getPeriodEnd(subscription));
}

export async function handleSubscriptionUpdated(
  subscription: Stripe.Subscription
) {
  const customerId = subscription.customer as string;
  const newStatus = mapStripeStatus(subscription.status);
  const newPeriodEnd = getPeriodEnd(subscription);
  const priceId = subscription.items?.data?.[0]?.price?.id;
  const newTier = priceId ? tierFromPriceId(priceId) : null;

  const supabase = createServiceClient();

  // Fetch existing profile to detect tier changes.
  const { data: existingProfile } = await supabase
    .from("profiles")
    .select("id, subscription_tier, current_period_end")
    .eq("stripe_customer_id", customerId)
    .single();

  const updatePayload: Record<string, unknown> = {
    subscription_status: newStatus,
    current_period_end: newPeriodEnd,
  };

  if (newTier && newTier !== existingProfile?.subscription_tier) {
    updatePayload.subscription_tier = newTier;
  }

  await supabase
    .from("profiles")
    .update(updatePayload)
    .eq("stripe_customer_id", customerId);

  // If tier changed and we have a user ID, sync usage accordingly.
  if (newTier && existingProfile && newTier !== existingProfile.subscription_tier) {
    const previousTier = existingProfile.subscription_tier as PlanTier;
    const isUpgrade =
      (previousTier === "free" && (newTier === "basic" || newTier === "pro")) ||
      (previousTier === "basic" && newTier === "pro");
    if (isUpgrade) {
      await syncUsageOnUpgrade(supabase, existingProfile.id, newTier, newPeriodEnd);
    } else {
      await syncUsageOnDowngrade(supabase, existingProfile.id, existingProfile.current_period_end ?? null);
    }
  }
}

export async function handleSubscriptionDeleted(
  subscription: Stripe.Subscription
) {
  const customerId = subscription.customer as string;

  const supabase = createServiceClient();
  // Pre-fetch current_period_end before clearing it so syncUsageOnDowngrade
  // can compute the correct billing-anchored period key.
  const { data: existing } = await supabase
    .from("profiles")
    .select("id, current_period_end")
    .eq("stripe_customer_id", customerId)
    .single();

  const { data: profile, error } = await supabase
    .from("profiles")
    .update({
      subscription_tier: "free",
      subscription_status: "cancelled",
      stripe_subscription_id: null,
      current_period_end: null,
    })
    .eq("stripe_customer_id", customerId)
    .select("id")
    .single();

  if (error) {
    console.error("Failed to downgrade profile:", error);
    return;
  }

  if (profile) {
    await syncUsageOnDowngrade(supabase, profile.id, existing?.current_period_end ?? null);
  }
}

export async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  const customerId = invoice.customer as string;

  const supabase = createServiceClient();
  await supabase
    .from("profiles")
    .update({
      subscription_status: "past_due",
    })
    .eq("stripe_customer_id", customerId);
}

export async function handleTopupCompleted(session: Stripe.Checkout.Session) {
  const userId = session.metadata?.user_id;
  const packType = session.metadata?.pack_type as keyof typeof TOPUP_PACKS | undefined;
  const metadataCredits = Number(session.metadata?.credits);
  const quantity = Number(session.metadata?.quantity) || 1;
  const paymentIntentId = session.payment_intent as string;

  if (!userId || !packType || !paymentIntentId) {
    console.error("[stripe] Invalid top-up metadata:", session.metadata);
    return;
  }

  // Re-derive credit count from pack_type + quantity against TOPUP_PACKS to
  // avoid trusting metadata.credits blindly (could be tampered or stale).
  const packConfig = TOPUP_PACKS[packType];
  if (!packConfig) {
    console.error("[stripe] Unknown pack_type in metadata:", packType);
    return;
  }
  const derivedCredits = packConfig.credits * quantity;
  if (derivedCredits !== metadataCredits) {
    console.warn(
      `[stripe] metadata.credits (${metadataCredits}) doesn't match derived amount (${derivedCredits}) for pack=${packType} qty=${quantity}. Using derived amount.`
    );
  }
  const credits = derivedCredits;

  if (credits <= 0) {
    console.error("[stripe] Derived credits <= 0, aborting top-up:", { packType, quantity });
    return;
  }

  const supabase = createServiceClient();

  // Idempotency: check if this payment intent has already been processed.
  const { data: existing } = await supabase
    .from("credit_purchases")
    .select("id")
    .eq("stripe_payment_intent_id", paymentIntentId)
    .maybeSingle();

  if (existing) {
    console.warn("[stripe] Top-up already processed for payment intent:", paymentIntentId);
    return;
  }

  const { error: profileError } = await supabase.rpc("increment_purchased_credits", {
    p_user_id: userId,
    p_credits: credits,
  });

  if (profileError) {
    console.error("[stripe] Failed to increment purchased credits:", profileError);
    return;
  }

  await supabase.from("credit_purchases").insert({
    user_id: userId,
    credits,
    amount_pence: session.amount_total ?? 0,
    pack_type: packType,
    stripe_payment_intent_id: paymentIntentId,
  });
}
