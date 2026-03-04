import Stripe from "stripe";
import { createServiceClient } from "@/lib/supabase/server";
import { PLANS } from "@/lib/stripe/plans";
import { getUsagePeriod } from "@/lib/usage/period";

// Map Stripe subscription statuses to DB CHECK constraint values: 'active' | 'past_due' | 'cancelled'
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

async function syncUsageOnUpgrade(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
  currentPeriodEnd: string | null
) {
  const { periodKey: period } = getUsagePeriod("pro", currentPeriodEnd);
  await supabase.from("usage").upsert(
    {
      user_id: userId,
      period,
      reviews_limit: PLANS.pro.reviewsPerMonth,
      reviews_used: 0,
      bonus_reviews: 0,
    },
    { onConflict: "user_id,period" }
  );
}

async function syncUsageOnDowngrade(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string
) {
  const period = new Date().toISOString().slice(0, 7);
  await supabase
    .from("usage")
    .update({ reviews_limit: 0 })
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

  const supabase = createServiceClient();
  const { data: profile, error } = await supabase
    .from("profiles")
    .update({
      subscription_tier: "pro",
      subscription_status: "active",
      stripe_customer_id: customerId,
      stripe_subscription_id: subscriptionId,
      current_period_end: getPeriodEnd(subscription),
    })
    .eq("stripe_customer_id", customerId)
    .select("id")
    .single();

  if (error || !profile) {
    console.error("Failed to update profile by customer_id:", error);
    return;
  }

  await syncUsageOnUpgrade(supabase, profile.id, getPeriodEnd(subscription));
}

export async function handleSubscriptionUpdated(
  subscription: Stripe.Subscription
) {
  const customerId = subscription.customer as string;

  const supabase = createServiceClient();
  await supabase
    .from("profiles")
    .update({
      subscription_status: mapStripeStatus(subscription.status),
      current_period_end: getPeriodEnd(subscription),
    })
    .eq("stripe_customer_id", customerId);
}

export async function handleSubscriptionDeleted(
  subscription: Stripe.Subscription
) {
  const customerId = subscription.customer as string;

  const supabase = createServiceClient();
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
    await syncUsageOnDowngrade(supabase, profile.id);
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
