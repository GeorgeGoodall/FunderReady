import { describe, it, expect } from "vitest";
import { CreateApplicationRequestSchema } from "../schemas/criteria";

describe("CreateApplicationRequestSchema", () => {
  it("accepts questionsSetId as optional", () => {
    const result = CreateApplicationRequestSchema.safeParse({
      fundId: "00000000-0000-0000-0000-000000000001",
      criteriaSetId: "00000000-0000-0000-0000-000000000002",
    });
    expect(result.success).toBe(true);
  });

  it("still validates questionsSetId as uuid when provided", () => {
    const result = CreateApplicationRequestSchema.safeParse({
      fundId: "00000000-0000-0000-0000-000000000001",
      criteriaSetId: "00000000-0000-0000-0000-000000000002",
      questionsSetId: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a valid questionsSetId when provided", () => {
    const result = CreateApplicationRequestSchema.safeParse({
      fundId: "00000000-0000-0000-0000-000000000001",
      criteriaSetId: "00000000-0000-0000-0000-000000000002",
      questionsSetId: "00000000-0000-0000-0000-000000000003",
    });
    expect(result.success).toBe(true);
    expect(result.data?.questionsSetId).toBe("00000000-0000-0000-0000-000000000003");
  });
});
