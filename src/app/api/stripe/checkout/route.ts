import { NextResponse } from "next/server";

// Stripe imports preserved for re-enablement:
// import { createClient, createServiceClient } from "@/lib/supabase/server";
// import { stripe } from "@/lib/stripe/client";
// import { PLANS } from "@/lib/stripe/plans";

export async function POST() {
  // Subscriptions disabled during beta — re-enable when Stripe is ready
  return NextResponse.json(
    { error: "Subscriptions are not yet available" },
    { status: 503 }
  );

  /* --- Re-enable block below when Stripe is ready ---
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const serviceClient = createServiceClient();
  const { data: profile } = await serviceClient
    .from("profiles")
    .select("subscription_tier, stripe_customer_id")
    .eq("id", user.id)
    .single();

  if (profile?.subscription_tier === "pro") {
    return NextResponse.json(
      { error: "Already subscribed to Pro" },
      { status: 400 }
    );
  }

  let customerId = profile?.stripe_customer_id;
  if (!customerId) {
    const customer = await stripe.customers.create(
      {
        email: user.email,
        metadata: { userId: user.id },
      },
      { idempotencyKey: `create-customer-${user.id}` }
    );
    customerId = customer.id;

    await serviceClient
      .from("profiles")
      .update({ stripe_customer_id: customerId })
      .eq("id", user.id);
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: PLANS.pro.stripePriceId, quantity: 1 }],
    success_url: `${appUrl}/billing?upgraded=true`,
    cancel_url: `${appUrl}/billing`,
    metadata: { userId: user.id },
  });

  return NextResponse.json({ url: session.url });
  --- end re-enable block */
}
