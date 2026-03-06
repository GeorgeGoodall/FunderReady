import { describe, it, expect } from "vitest";
import { PLANS, TOPUP_PACKS, COST_PER_CREDIT_USD } from "../plans";

describe("PLANS", () => {
  it("has free, basic, and pro tiers", () => {
    expect(PLANS.free).toBeDefined();
    expect(PLANS.basic).toBeDefined();
    expect(PLANS.pro).toBeDefined();
  });

  it("free tier has 0 credits", () => {
    expect(PLANS.free.creditsPerMonth).toBe(0);
  });

  it("basic tier has 30 credits at £19/month", () => {
    expect(PLANS.basic.creditsPerMonth).toBe(30);
    expect(PLANS.basic.priceMonthly).toBe(1900);
  });

  it("pro tier has 100 credits at £49/month", () => {
    expect(PLANS.pro.creditsPerMonth).toBe(100);
    expect(PLANS.pro.priceMonthly).toBe(4900);
  });

  it("does not have reviewsPerMonth on any tier", () => {
    for (const plan of Object.values(PLANS)) {
      expect(plan).not.toHaveProperty("reviewsPerMonth");
    }
  });
});

describe("TOPUP_PACKS", () => {
  it("has standard and pro packs", () => {
    expect(TOPUP_PACKS.standard).toBeDefined();
    expect(TOPUP_PACKS.pro).toBeDefined();
  });

  it("standard pack: £5 for 10 credits, available to basic and pro", () => {
    expect(TOPUP_PACKS.standard.pricePence).toBe(500);
    expect(TOPUP_PACKS.standard.credits).toBe(10);
    expect(TOPUP_PACKS.standard.availableTo).toEqual(["basic", "pro"]);
  });

  it("pro pack: £10 for 30 credits, available to pro only", () => {
    expect(TOPUP_PACKS.pro.pricePence).toBe(1000);
    expect(TOPUP_PACKS.pro.credits).toBe(30);
    expect(TOPUP_PACKS.pro.availableTo).toEqual(["pro"]);
  });
});

describe("COST_PER_CREDIT_USD", () => {
  it("is a positive number", () => {
    expect(COST_PER_CREDIT_USD).toBeGreaterThan(0);
  });
});
