import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe/client";
import {
  handleCheckoutCompleted,
  handleSubscriptionUpdated,
  handleSubscriptionDeleted,
  handleInvoicePaymentFailed,
} from "@/lib/stripe/webhooks";

export async function POST(request: Request) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json(
      { error: "Missing stripe-signature header" },
      { status: 400 }
    );
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return NextResponse.json(
      { error: "Invalid signature" },
      { status: 400 }
    );
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(
          event.data.object as import("stripe").default.Checkout.Session
        );
        break;
      case "customer.subscription.updated":
        await handleSubscriptionUpdated(
          event.data.object as import("stripe").default.Subscription
        );
        break;
      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(
          event.data.object as import("stripe").default.Subscription
        );
        break;
      case "invoice.payment_failed":
        await handleInvoicePaymentFailed(
          event.data.object as import("stripe").default.Invoice
        );
        break;
    }
  } catch (err) {
    console.error(`Error handling ${event.type}:`, err);
    return NextResponse.json(
      { error: `Failed to handle ${event.type}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ received: true });
}
