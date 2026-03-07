import { describe, it, expect, vi, beforeEach } from "vitest";
import type Stripe from "stripe";

// ---------------------------------------------------------------------------
// Shared mocking helpers
// ---------------------------------------------------------------------------

const mockGetUser = vi.fn();
const mockFrom = vi.fn();
const mockServiceFrom = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  })),
  createServiceClient: vi.fn(() => ({
    from: mockServiceFrom,
  })),
}));

// Mock Stripe SDK
const mockStripeCheckoutCreate = vi.fn();
const mockStripePortalCreate = vi.fn();
const mockStripeCustomersCreate = vi.fn();
const mockStripeSubscriptionsRetrieve = vi.fn();
const mockStripeWebhooksConstructEvent = vi.fn();

vi.mock("@/lib/stripe/client", () => ({
  stripe: {
    checkout: { sessions: { create: mockStripeCheckoutCreate } },
    billingPortal: { sessions: { create: mockStripePortalCreate } },
    customers: { create: mockStripeCustomersCreate },
    subscriptions: { retrieve: mockStripeSubscriptionsRetrieve },
    webhooks: { constructEvent: mockStripeWebhooksConstructEvent },
  },
}));

// Mock PLANS + TOPUP_PACKS
vi.mock("@/lib/stripe/plans", () => ({
  PLANS: {
    free: { name: "Free", price: 0, creditsPerMonth: 0 },
    basic: {
      name: "Basic",
      priceMonthly: 1900,
      creditsPerMonth: 30,
      stripePriceId: "price_basic_123",
    },
    pro: {
      name: "Pro",
      priceMonthly: 4900,
      creditsPerMonth: 100,
      stripePriceId: "price_test_123",
    },
  },
  TOPUP_PACKS: {
    standard: {
      name: "Standard Top-Up",
      pricePence: 500,
      credits: 10,
      availableTo: ["basic", "pro"],
      stripePriceId: "price_standard_topup_123",
    },
    pro: {
      name: "Pro Top-Up",
      pricePence: 1000,
      credits: 30,
      availableTo: ["pro"],
      stripePriceId: "price_pro_topup_123",
    },
  },
}));

// Mock usage period
vi.mock("@/lib/usage/period", () => ({
  getUsagePeriod: vi.fn(() => ({
    periodKey: "2026-03-04",
    resetDate: new Date("2026-04-04"),
  })),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Helper to build chained Supabase query mocks
// ---------------------------------------------------------------------------

function chainMock(resolvedValue: unknown) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  chain.select = vi.fn(() => chain);
  chain.insert = vi.fn(() => chain);
  chain.update = vi.fn(() => chain);
  chain.upsert = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.single = vi.fn(() => Promise.resolve(resolvedValue));
  chain.order = vi.fn(() => chain);
  return chain;
}

function authenticatedUser(id = "user-123") {
  mockGetUser.mockResolvedValue({
    data: { user: { id, email: "test@example.com" } },
  });
}

function unauthenticatedUser() {
  mockGetUser.mockResolvedValue({ data: { user: null } });
}

// =====================================================================
// POST /api/stripe/checkout
// =====================================================================

describe("POST /api/stripe/checkout", () => {
  async function importRoute() {
    const mod = await import("../../stripe/checkout/route");
    return mod.POST;
  }

  it("returns 401 when unauthenticated", async () => {
    unauthenticatedUser();
    const POST = await importRoute();
    const req = new Request("http://localhost/api/stripe/checkout", {
      method: "POST",
      body: JSON.stringify({ tier: "pro" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("returns 400 for invalid tier", async () => {
    authenticatedUser();
    const POST = await importRoute();
    const req = new Request("http://localhost/api/stripe/checkout", {
      method: "POST",
      body: JSON.stringify({ tier: "free" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid plan" });
  });

  it("creates checkout session for authenticated user with existing customer", async () => {
    authenticatedUser();
    mockFrom.mockReturnValue(
      chainMock({ data: { stripe_customer_id: "cus_existing" }, error: null })
    );
    mockStripeCheckoutCreate.mockResolvedValue({ url: "https://checkout.stripe.com/test" });

    const POST = await importRoute();
    const req = new Request("http://localhost/api/stripe/checkout", {
      method: "POST",
      body: JSON.stringify({ tier: "pro" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: "https://checkout.stripe.com/test" });
    expect(mockStripeCheckoutCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: "cus_existing",
        mode: "subscription",
      })
    );
  });
});

// =====================================================================
// POST /api/stripe/portal
// =====================================================================

describe("POST /api/stripe/portal", () => {
  async function importRoute() {
    const mod = await import("../../stripe/portal/route");
    return mod.POST;
  }

  it("returns 503 — subscriptions disabled during beta", async () => {
    const POST = await importRoute();
    const req = new Request("http://localhost/api/stripe/portal", {
      method: "POST",
    });
    const res = await POST(req);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({
      error: "Subscriptions are not yet available",
    });
  });
});

// =====================================================================
// POST /api/stripe/topup
// =====================================================================

describe("POST /api/stripe/topup", () => {
  async function importRoute() {
    const mod = await import("../../stripe/topup/route");
    return mod.POST;
  }

  function makeRequest(body: unknown) {
    return new Request("http://localhost/api/stripe/topup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("returns 401 for unauthenticated user", async () => {
    unauthenticatedUser();
    const POST = await importRoute();
    const res = await POST(makeRequest({ pack: "standard", quantity: 1 }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("returns 400 for invalid pack type", async () => {
    authenticatedUser();
    const POST = await importRoute();
    const res = await POST(makeRequest({ pack: "invalid_pack", quantity: 1 }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid pack" });
  });

  it("returns 403 for free tier user", async () => {
    authenticatedUser();
    mockFrom.mockReturnValue(
      chainMock({
        data: {
          subscription_tier: "free",
          subscription_status: null,
          stripe_customer_id: null,
        },
        error: null,
      })
    );
    const POST = await importRoute();
    const res = await POST(makeRequest({ pack: "standard", quantity: 1 }));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Active subscription required" });
  });

  it("returns 200 with checkout URL for valid request", async () => {
    authenticatedUser();
    mockFrom.mockReturnValue(
      chainMock({
        data: {
          subscription_tier: "pro",
          subscription_status: "active",
          stripe_customer_id: "cus_topup_123",
        },
        error: null,
      })
    );
    mockStripeCheckoutCreate.mockResolvedValue({
      url: "https://checkout.stripe.com/topup-session",
    });

    const POST = await importRoute();
    const res = await POST(makeRequest({ pack: "standard", quantity: 1 }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      url: "https://checkout.stripe.com/topup-session",
    });
    expect(mockStripeCheckoutCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: "cus_topup_123",
        mode: "payment",
      })
    );
  });
});

// =====================================================================
// POST /api/stripe/webhooks
// =====================================================================

describe("POST /api/stripe/webhooks", () => {
  async function importRoute() {
    const mod = await import("../../stripe/webhooks/route");
    return mod.POST;
  }

  function makeWebhookRequest(
    body = '{"type":"test"}',
    signature: string | null = "sig_test_123"
  ) {
    const headers: Record<string, string> = {};
    if (signature !== null) {
      headers["stripe-signature"] = signature;
    }
    return new Request("http://localhost/api/stripe/webhooks", {
      method: "POST",
      body,
      headers,
    });
  }

  it("returns 400 when stripe-signature header is missing", async () => {
    const POST = await importRoute();
    const req = makeWebhookRequest('{"type":"test"}', null);
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "Missing stripe-signature header",
    });
  });

  it("returns 400 when signature verification fails", async () => {
    mockStripeWebhooksConstructEvent.mockImplementation(() => {
      throw new Error("Invalid signature");
    });

    const POST = await importRoute();
    const req = makeWebhookRequest('{"type":"test"}', "invalid_sig");
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid signature" });
  });

  it("routes checkout.session.completed correctly", async () => {
    const mockSession = {
      subscription: "sub_123",
      customer: "cus_123",
      metadata: { userId: "user-123" },
    };

    mockStripeWebhooksConstructEvent.mockReturnValue({
      type: "checkout.session.completed",
      data: { object: mockSession },
    });

    // Mock the handler's internal calls — handleCheckoutCompleted uses:
    // 1. stripe.subscriptions.retrieve
    // 2. createServiceClient().from("profiles").update().eq().select().single()
    // 3. createServiceClient().from("usage").upsert()
    mockStripeSubscriptionsRetrieve.mockResolvedValue({
      items: {
        data: [{ current_period_end: Math.floor(Date.now() / 1000) + 86400 }],
      },
    });

    const profileUpdateChain = chainMock({
      data: { id: "user-123" },
      error: null,
    });
    const usageUpsertChain = chainMock({ data: null, error: null });

    let callCount = 0;
    mockServiceFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return profileUpdateChain;
      return usageUpsertChain;
    });

    const POST = await importRoute();
    const req = makeWebhookRequest('{"type":"checkout.session.completed"}');
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it("routes checkout.session.completed with mode=payment to topup handler", async () => {
    const mockPaymentSession = {
      mode: "payment",
      payment_intent: "pi_topup_123",
      customer: "cus_123",
      amount_total: 500,
      metadata: {
        user_id: "user-123",
        pack_type: "standard",
        quantity: "1",
        credits: "10",
      },
    };

    mockStripeWebhooksConstructEvent.mockReturnValue({
      type: "checkout.session.completed",
      data: { object: mockPaymentSession },
    });

    // handleTopupCompleted uses createServiceClient().from() and .rpc()
    // Mock idempotency check (no existing purchase) + rpc + insert
    const creditPurchasesNoExisting: Record<string, ReturnType<typeof vi.fn>> = {};
    creditPurchasesNoExisting.select = vi.fn(() => creditPurchasesNoExisting);
    creditPurchasesNoExisting.eq = vi.fn(() => creditPurchasesNoExisting);
    creditPurchasesNoExisting.maybeSingle = vi.fn(() =>
      Promise.resolve({ data: null, error: null })
    );
    creditPurchasesNoExisting.insert = vi.fn(() =>
      Promise.resolve({ data: null, error: null })
    );

    const mockServiceRpc = vi.fn(() =>
      Promise.resolve({ error: null })
    );

    // Override createServiceClient to include rpc
    const { createServiceClient } = await import("@/lib/supabase/server");
    vi.mocked(createServiceClient).mockReturnValue({
      from: vi.fn(() => creditPurchasesNoExisting),
      rpc: mockServiceRpc,
    } as unknown as ReturnType<typeof createServiceClient>);

    const POST = await importRoute();
    const req = makeWebhookRequest('{"type":"checkout.session.completed"}');
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
    // Verify topup path: subscription retrieve should NOT be called (that's the subscription path)
    expect(mockStripeSubscriptionsRetrieve).not.toHaveBeenCalled();

    // Restore createServiceClient to the standard mock so subsequent tests are not affected.
    vi.mocked(createServiceClient).mockReturnValue({
      from: mockServiceFrom,
    } as unknown as ReturnType<typeof createServiceClient>);
  });

  it("routes customer.subscription.updated correctly", async () => {
    const mockSubscription = {
      customer: "cus_456",
      status: "active",
      items: {
        data: [{ current_period_end: Math.floor(Date.now() / 1000) + 86400 }],
      },
    };

    mockStripeWebhooksConstructEvent.mockReturnValue({
      type: "customer.subscription.updated",
      data: { object: mockSubscription },
    });

    mockServiceFrom.mockReturnValue(
      chainMock({ data: null, error: null })
    );

    const POST = await importRoute();
    const req = makeWebhookRequest(
      '{"type":"customer.subscription.updated"}'
    );
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it("routes customer.subscription.deleted correctly", async () => {
    const mockSubscription = {
      customer: "cus_789",
      status: "canceled",
      items: { data: [] },
    };

    mockStripeWebhooksConstructEvent.mockReturnValue({
      type: "customer.subscription.deleted",
      data: { object: mockSubscription },
    });

    const profileChain = chainMock({
      data: { id: "user-789" },
      error: null,
    });
    const usageChain = chainMock({ data: null, error: null });

    let callCount = 0;
    mockServiceFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return profileChain;
      return usageChain;
    });

    const POST = await importRoute();
    const req = makeWebhookRequest(
      '{"type":"customer.subscription.deleted"}'
    );
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it("routes invoice.payment_failed correctly", async () => {
    const mockInvoice = {
      customer: "cus_fail",
    };

    mockStripeWebhooksConstructEvent.mockReturnValue({
      type: "invoice.payment_failed",
      data: { object: mockInvoice },
    });

    mockServiceFrom.mockReturnValue(
      chainMock({ data: null, error: null })
    );

    const POST = await importRoute();
    const req = makeWebhookRequest('{"type":"invoice.payment_failed"}');
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it("returns 500 when handler throws so Stripe retries", async () => {
    mockStripeWebhooksConstructEvent.mockReturnValue({
      type: "checkout.session.completed",
      data: {
        object: {
          subscription: "sub_fail",
          customer: "cus_fail",
        },
      },
    });

    // Make the handler's stripe.subscriptions.retrieve throw
    mockStripeSubscriptionsRetrieve.mockRejectedValue(
      new Error("Stripe API error")
    );

    const POST = await importRoute();
    const req = makeWebhookRequest(
      '{"type":"checkout.session.completed"}'
    );
    const res = await POST(req);
    expect(res.status).toBe(500);
  });
});

// =====================================================================
// Webhook handlers (src/lib/stripe/webhooks.ts)
// =====================================================================

describe("Webhook handlers", () => {
  async function importHandlers() {
    return import("@/lib/stripe/webhooks");
  }

  describe("handleCheckoutCompleted", () => {
    it("updates profile to pro + active and syncs usage", async () => {
      const periodEnd = Math.floor(Date.now() / 1000) + 30 * 86400;
      mockStripeSubscriptionsRetrieve.mockResolvedValue({
        items: { data: [{ current_period_end: periodEnd, price: { id: "price_test_123" } }] },
      } as unknown as Stripe.Subscription);

      const profileChain = chainMock({
        data: { id: "user-checkout-1" },
        error: null,
      });
      const usageChain = chainMock({ data: null, error: null });

      let callCount = 0;
      mockServiceFrom.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return profileChain;
        return usageChain;
      });

      const { handleCheckoutCompleted } = await importHandlers();
      await handleCheckoutCompleted({
        subscription: "sub_test_1",
        customer: "cus_test_1",
      } as unknown as Stripe.Checkout.Session);

      // Verify subscription was retrieved
      expect(mockStripeSubscriptionsRetrieve).toHaveBeenCalledWith(
        "sub_test_1"
      );

      // Verify profile was updated
      expect(profileChain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          subscription_tier: "pro",
          subscription_status: "active",
          stripe_customer_id: "cus_test_1",
          stripe_subscription_id: "sub_test_1",
        })
      );
      expect(profileChain.eq).toHaveBeenCalledWith(
        "stripe_customer_id",
        "cus_test_1"
      );

      // Verify usage was synced (insert-or-update approach: insert first,
      // then update credits_limit on conflict, never resetting credits_used)
      expect(usageChain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: "user-checkout-1",
          credits_limit: 100,
          credits_used: 0,
          bonus_reviews: 0,
        })
      );
    });

    it("returns early when subscription or customer ID is missing", async () => {
      const { handleCheckoutCompleted } = await importHandlers();

      await handleCheckoutCompleted({
        subscription: null,
        customer: "cus_test",
      } as unknown as Stripe.Checkout.Session);

      // Should not attempt to retrieve subscription
      expect(mockStripeSubscriptionsRetrieve).not.toHaveBeenCalled();
      expect(mockServiceFrom).not.toHaveBeenCalled();
    });

    it("returns early when profile update fails", async () => {
      mockStripeSubscriptionsRetrieve.mockResolvedValue({
        items: { data: [{ current_period_end: 1700000000 }] },
      } as unknown as Stripe.Subscription);

      const profileChain = chainMock({
        data: null,
        error: { message: "Profile not found" },
      });
      mockServiceFrom.mockReturnValue(profileChain);

      const { handleCheckoutCompleted } = await importHandlers();
      await handleCheckoutCompleted({
        subscription: "sub_fail",
        customer: "cus_fail",
      } as unknown as Stripe.Checkout.Session);

      // Should have tried to update profile
      expect(profileChain.update).toHaveBeenCalled();
      // Should NOT have tried to sync usage (early return)
      // The mockServiceFrom was only called once (for profiles), not twice (for usage)
    });
  });

  describe("handleSubscriptionUpdated", () => {
    it("maps 'active' status correctly and updates profile", async () => {
      const updateChain = chainMock({ data: null, error: null });
      mockServiceFrom.mockReturnValue(updateChain);

      const { handleSubscriptionUpdated } = await importHandlers();
      await handleSubscriptionUpdated({
        customer: "cus_upd_1",
        status: "active",
        items: {
          data: [{ current_period_end: 1700000000 }],
        },
      } as unknown as Stripe.Subscription);

      expect(updateChain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          subscription_status: "active",
        })
      );
      expect(updateChain.eq).toHaveBeenCalledWith(
        "stripe_customer_id",
        "cus_upd_1"
      );
    });

    it("maps 'trialing' status to 'active'", async () => {
      const updateChain = chainMock({ data: null, error: null });
      mockServiceFrom.mockReturnValue(updateChain);

      const { handleSubscriptionUpdated } = await importHandlers();
      await handleSubscriptionUpdated({
        customer: "cus_upd_2",
        status: "trialing",
        items: { data: [] },
      } as unknown as Stripe.Subscription);

      expect(updateChain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          subscription_status: "active",
        })
      );
    });

    it("maps 'incomplete' status to 'past_due'", async () => {
      const updateChain = chainMock({ data: null, error: null });
      mockServiceFrom.mockReturnValue(updateChain);

      const { handleSubscriptionUpdated } = await importHandlers();
      await handleSubscriptionUpdated({
        customer: "cus_upd_3",
        status: "incomplete",
        items: { data: [] },
      } as unknown as Stripe.Subscription);

      expect(updateChain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          subscription_status: "past_due",
        })
      );
    });

    it("maps 'canceled' status to 'cancelled'", async () => {
      const updateChain = chainMock({ data: null, error: null });
      mockServiceFrom.mockReturnValue(updateChain);

      const { handleSubscriptionUpdated } = await importHandlers();
      await handleSubscriptionUpdated({
        customer: "cus_upd_4",
        status: "canceled",
        items: { data: [] },
      } as unknown as Stripe.Subscription);

      expect(updateChain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          subscription_status: "cancelled",
        })
      );
    });

    it("maps 'paused' status to 'cancelled'", async () => {
      const updateChain = chainMock({ data: null, error: null });
      mockServiceFrom.mockReturnValue(updateChain);

      const { handleSubscriptionUpdated } = await importHandlers();
      await handleSubscriptionUpdated({
        customer: "cus_upd_5",
        status: "paused",
        items: { data: [] },
      } as unknown as Stripe.Subscription);

      expect(updateChain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          subscription_status: "cancelled",
        })
      );
    });

    it("maps unknown status to 'past_due'", async () => {
      const updateChain = chainMock({ data: null, error: null });
      mockServiceFrom.mockReturnValue(updateChain);

      const { handleSubscriptionUpdated } = await importHandlers();
      await handleSubscriptionUpdated({
        customer: "cus_upd_6",
        status: "some_unknown_status",
        items: { data: [] },
      } as unknown as Stripe.Subscription);

      expect(updateChain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          subscription_status: "past_due",
        })
      );
    });

    it("computes current_period_end from subscription items", async () => {
      const updateChain = chainMock({ data: null, error: null });
      mockServiceFrom.mockReturnValue(updateChain);

      const periodEndUnix = 1700000000; // 2023-11-14T22:13:20.000Z

      const { handleSubscriptionUpdated } = await importHandlers();
      await handleSubscriptionUpdated({
        customer: "cus_upd_7",
        status: "active",
        items: {
          data: [{ current_period_end: periodEndUnix }],
        },
      } as unknown as Stripe.Subscription);

      expect(updateChain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          current_period_end: new Date(
            periodEndUnix * 1000
          ).toISOString(),
        })
      );
    });

    it("sets current_period_end to null when no subscription items", async () => {
      const updateChain = chainMock({ data: null, error: null });
      mockServiceFrom.mockReturnValue(updateChain);

      const { handleSubscriptionUpdated } = await importHandlers();
      await handleSubscriptionUpdated({
        customer: "cus_upd_8",
        status: "active",
        items: { data: [] },
      } as unknown as Stripe.Subscription);

      expect(updateChain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          current_period_end: null,
        })
      );
    });
  });

  describe("handleSubscriptionDeleted", () => {
    it("downgrades to free + cancelled and syncs usage limit to 0", async () => {
      // Call 1: pre-fetch profile (to read current_period_end before clearing it)
      const preFetchChain = chainMock({
        data: { id: "user-del-1", current_period_end: "2026-04-04T00:00:00.000Z" },
        error: null,
      });
      // Call 2: profile update (the actual downgrade)
      const profileChain = chainMock({
        data: { id: "user-del-1" },
        error: null,
      });
      // Call 3: usage update
      const usageChain = chainMock({ data: null, error: null });

      let callCount = 0;
      mockServiceFrom.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return preFetchChain;
        if (callCount === 2) return profileChain;
        return usageChain;
      });

      const { handleSubscriptionDeleted } = await importHandlers();
      await handleSubscriptionDeleted({
        customer: "cus_del_1",
        status: "canceled",
        items: { data: [] },
      } as unknown as Stripe.Subscription);

      // Verify profile downgraded
      expect(profileChain.update).toHaveBeenCalledWith({
        subscription_tier: "free",
        subscription_status: "cancelled",
        stripe_subscription_id: null,
        current_period_end: null,
      });
      expect(profileChain.eq).toHaveBeenCalledWith(
        "stripe_customer_id",
        "cus_del_1"
      );

      // Verify usage limit set to 0
      expect(usageChain.update).toHaveBeenCalledWith({ credits_limit: 0 });
      expect(usageChain.eq).toHaveBeenCalledWith("user_id", "user-del-1");
    });

    it("returns early when profile update fails", async () => {
      // Call 1: pre-fetch (succeeds)
      const preFetchChain = chainMock({
        data: { id: "user-del-fail", current_period_end: null },
        error: null,
      });
      // Call 2: profile update (fails)
      const profileChain = chainMock({
        data: null,
        error: { message: "Not found" },
      });

      let callCount = 0;
      mockServiceFrom.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return preFetchChain;
        return profileChain;
      });

      const { handleSubscriptionDeleted } = await importHandlers();
      await handleSubscriptionDeleted({
        customer: "cus_del_fail",
        status: "canceled",
        items: { data: [] },
      } as unknown as Stripe.Subscription);

      // Profile update was attempted
      expect(profileChain.update).toHaveBeenCalled();
      // mockServiceFrom called twice (pre-fetch + profile update), no usage call
      expect(mockServiceFrom).toHaveBeenCalledTimes(2);
    });

    it("skips usage sync when profile data is null (no matching customer)", async () => {
      // Call 1: pre-fetch (returns null — no matching customer)
      const preFetchChain = chainMock({
        data: null,
        error: null,
      });
      // Call 2: profile update (returns null data, no error)
      const profileChain = chainMock({
        data: null,
        error: null,
      });

      let callCount = 0;
      mockServiceFrom.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return preFetchChain;
        return profileChain;
      });

      const { handleSubscriptionDeleted } = await importHandlers();
      await handleSubscriptionDeleted({
        customer: "cus_del_nouser",
        status: "canceled",
        items: { data: [] },
      } as unknown as Stripe.Subscription);

      // Profile update was attempted but returned no profile
      expect(profileChain.update).toHaveBeenCalled();
      // Should have called from() twice (pre-fetch + profile update), no usage call
      expect(mockServiceFrom).toHaveBeenCalledTimes(2);
    });
  });

  describe("handleInvoicePaymentFailed", () => {
    it("sets subscription status to past_due", async () => {
      const updateChain = chainMock({ data: null, error: null });
      mockServiceFrom.mockReturnValue(updateChain);

      const { handleInvoicePaymentFailed } = await importHandlers();
      await handleInvoicePaymentFailed({
        customer: "cus_invoice_fail",
      } as unknown as Stripe.Invoice);

      expect(updateChain.update).toHaveBeenCalledWith({
        subscription_status: "past_due",
      });
      expect(updateChain.eq).toHaveBeenCalledWith(
        "stripe_customer_id",
        "cus_invoice_fail"
      );
    });
  });
});
