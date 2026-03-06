export const COST_PER_CREDIT_USD = 0.05;

export const PLANS = {
  free: {
    name: "Free",
    price: 0,
    creditsPerMonth: 0,
    features: ["No active plan"],
  },
  basic: {
    name: "Basic",
    priceMonthly: 1900, // pence
    creditsPerMonth: 30,
    model: "sonnet" as const,
    stripePriceId: process.env.STRIPE_BASIC_PRICE_ID!,
    features: ["Full review", "Inline comments", "Improvement appendix"],
  },
  pro: {
    name: "Pro",
    priceMonthly: 4900, // pence
    creditsPerMonth: 100,
    model: "sonnet" as const,
    stripePriceId: process.env.STRIPE_PRO_PRICE_ID!,
    features: [
      "Full review",
      "Inline comments",
      "Improvement appendix",
      "Pro top-up packs",
    ],
  },
} as const;

export type PlanTier = keyof typeof PLANS;

export const TOPUP_PACKS = {
  standard: {
    name: "Standard Top-Up",
    pricePence: 500,
    credits: 10,
    availableTo: ["basic", "pro"] as const,
    stripePriceId: process.env.STRIPE_STANDARD_TOPUP_PRICE_ID!,
  },
  pro: {
    name: "Pro Top-Up",
    pricePence: 1000,
    credits: 30,
    availableTo: ["pro"] as const,
    stripePriceId: process.env.STRIPE_PRO_TOPUP_PRICE_ID!,
  },
} as const;

export type TopupPack = keyof typeof TOPUP_PACKS;
