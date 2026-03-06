import { describe, it, expect } from "vitest";
import { FundSchema, CreateFundSchema } from "../criteria";

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
