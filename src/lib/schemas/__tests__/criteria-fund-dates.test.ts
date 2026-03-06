import { describe, it, expect } from "vitest";
import { FundSchema, CreateFundSchema, ParseCriteriaResponseSchema } from "../criteria";

describe("FundSchema — date fields", () => {
  it("accepts fund without dates", () => {
    const result = FundSchema.safeParse({
      id: "550e8400-e29b-41d4-a716-446655440000",
      name: "Test Fund",
    });
    expect(result.success).toBe(true);
  });

  it("accepts fund with both dates", () => {
    const result = FundSchema.safeParse({
      id: "550e8400-e29b-41d4-a716-446655440000",
      name: "Test Fund",
      opens_at: "2026-03-01T00:00:00.000Z",
      closes_at: "2026-04-30T00:00:00.000Z",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.opens_at).toBe("2026-03-01T00:00:00.000Z");
      expect(result.data.closes_at).toBe("2026-04-30T00:00:00.000Z");
    }
  });

  it("accepts fund with only closes_at", () => {
    const result = FundSchema.safeParse({
      id: "550e8400-e29b-41d4-a716-446655440000",
      name: "Test Fund",
      closes_at: "2026-04-30T00:00:00.000Z",
    });
    expect(result.success).toBe(true);
  });

  it("accepts null dates", () => {
    const result = FundSchema.safeParse({
      id: "550e8400-e29b-41d4-a716-446655440000",
      name: "Test Fund",
      opens_at: null,
      closes_at: null,
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid date string", () => {
    const result = FundSchema.safeParse({
      id: "550e8400-e29b-41d4-a716-446655440000",
      name: "Test Fund",
      closes_at: "not-a-date",
    });
    expect(result.success).toBe(false);
  });
});

describe("CreateFundSchema — date fields", () => {
  it("accepts create fund with dates", () => {
    const result = CreateFundSchema.safeParse({
      name: "Test Fund",
      opens_at: "2026-03-01T00:00:00.000Z",
      closes_at: "2026-04-30T00:00:00.000Z",
    });
    expect(result.success).toBe(true);
  });

  it("accepts create fund without dates", () => {
    const result = CreateFundSchema.safeParse({
      name: "Test Fund",
    });
    expect(result.success).toBe(true);
  });
});

describe("ParseCriteriaResponseSchema — date fields", () => {
  const baseCriteria = {
    name: "Test Fund",
    criteria: [{ id: "c1", criterion: "Clear need", sub_questions: [] }],
  };

  it("accepts response without dates", () => {
    const result = ParseCriteriaResponseSchema.safeParse(baseCriteria);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.opens_at).toBeUndefined();
      expect(result.data.closes_at).toBeUndefined();
    }
  });

  it("accepts response with valid ISO dates", () => {
    const result = ParseCriteriaResponseSchema.safeParse({
      ...baseCriteria,
      opens_at: "2026-03-01T00:00:00Z",
      closes_at: "2026-04-30T00:00:00Z",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.opens_at).toBe("2026-03-01T00:00:00Z");
      expect(result.data.closes_at).toBe("2026-04-30T00:00:00Z");
    }
  });

  it("rejects non-ISO date strings", () => {
    const result = ParseCriteriaResponseSchema.safeParse({
      ...baseCriteria,
      closes_at: "April 30, 2026",
    });
    expect(result.success).toBe(false);
  });

  it("accepts response with only closes_at", () => {
    const result = ParseCriteriaResponseSchema.safeParse({
      ...baseCriteria,
      closes_at: "2026-04-30T00:00:00Z",
    });
    expect(result.success).toBe(true);
  });
});
