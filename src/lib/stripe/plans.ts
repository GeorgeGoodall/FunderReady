export const PLANS = {
  free: {
    name: "Free",
    price: 0,
    reviewsPerMonth: 1,
    model: "haiku" as const,
    features: ["Scorecard only"],
  },
  pro: {
    name: "Pro",
    priceMonthly: 4900, // pence
    reviewsPerMonth: 10,
    model: "sonnet" as const,
    stripePriceId: process.env.STRIPE_PRO_PRICE_ID!,
    features: ["Full review", "Inline comments", "Improvement appendix"],
  },
} as const;

export type PlanTier = keyof typeof PLANS;
