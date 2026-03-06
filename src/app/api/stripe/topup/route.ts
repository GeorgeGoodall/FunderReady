import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { stripe } from "@/lib/stripe/client";
import { TOPUP_PACKS, type TopupPack } from "@/lib/stripe/plans";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const pack = body.pack as TopupPack;
  const quantity = Math.max(1, Math.min(10, Number(body.quantity) || 1));

  if (!TOPUP_PACKS[pack]) {
    return NextResponse.json({ error: "Invalid pack" }, { status: 400 });
  }

  // Get user profile
  const { data: profile } = await supabase
    .from("profiles")
    .select("subscription_tier, stripe_customer_id")
    .eq("id", user.id)
    .single();

  const tier = profile?.subscription_tier ?? "free";

  // Must have active subscription
  if (tier === "free") {
    return NextResponse.json(
      { error: "Active subscription required" },
      { status: 403 }
    );
  }

  // Check pack availability for tier
  const packConfig = TOPUP_PACKS[pack];
  if (!(packConfig.availableTo as readonly string[]).includes(tier)) {
    return NextResponse.json(
      { error: "This pack is not available on your plan" },
      { status: 403 }
    );
  }

  // Create Stripe Checkout session for one-time payment
  const session = await stripe.checkout.sessions.create({
    customer: profile?.stripe_customer_id || undefined,
    mode: "payment",
    line_items: [
      {
        price: packConfig.stripePriceId,
        quantity,
      },
    ],
    metadata: {
      user_id: user.id,
      pack_type: pack,
      credits: String(packConfig.credits * quantity),
    },
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/billing?topup=success`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/billing?topup=cancelled`,
  });

  return NextResponse.json({ url: session.url });
}
