import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { stripe } from "@/lib/stripe/client";
import { PLANS } from "@/lib/stripe/plans";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const tier = body.tier as "basic" | "pro";

  if (tier !== "basic" && tier !== "pro") {
    return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
  }

  const plan = PLANS[tier];

  // Get or create Stripe customer
  const { data: profile } = await supabase
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", user.id)
    .single();

  let customerId = profile?.stripe_customer_id;

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      metadata: { supabase_user_id: user.id },
    });
    customerId = customer.id;

    await supabase
      .from("profiles")
      .update({ stripe_customer_id: customerId })
      .eq("id", user.id);
  }

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    line_items: [{ price: plan.stripePriceId, quantity: 1 }],
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/billing?checkout=success`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/billing?checkout=cancelled`,
  });

  return NextResponse.json({ url: session.url });
}
