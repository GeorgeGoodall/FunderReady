import { describe, it, expect } from "vitest";
import {
  CriterionSchema,
  CriteriaSetSchema,
  ParseCriteriaRequestSchema,
  SubmitReviewRequestSchema,
} from "../criteria";

describe("CriterionSchema", () => {
  it("accepts a valid criterion with all fields", () => {
    const result = CriterionSchema.safeParse({
      id: "c1",
      criterion: "Demonstrates clear need for the project",
      weight: "25%",
      sub_questions: [
        "What evidence is there of the need?",
        "Who are the beneficiaries?",
      ],
    });
    expect(result.success).toBe(true);
  });

  it("accepts a criterion without optional fields", () => {
    const result = CriterionSchema.safeParse({
      id: "c1",
      criterion: "Clear outcomes",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sub_questions).toEqual([]);
    }
  });

  it("rejects empty id", () => {
    const result = CriterionSchema.safeParse({
      id: "",
      criterion: "Something",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty criterion name", () => {
    const result = CriterionSchema.safeParse({
      id: "c1",
      criterion: "",
    });
    expect(result.success).toBe(false);
  });
});

describe("CriteriaSetSchema", () => {
  const validSet = {
    name: "Community Fund",
    description: "National Lottery Community Fund criteria",
    criteria: [
      {
        id: "c1",
        criterion: "Demonstrates clear need",
        weight: "25%",
        sub_questions: ["What evidence?"],
      },
      {
        id: "c2",
        criterion: "Delivers measurable outcomes",
        sub_questions: [],
      },
    ],
  };

  it("accepts a valid criteria set", () => {
    const result = CriteriaSetSchema.safeParse(validSet);
    expect(result.success).toBe(true);
  });

  it("rejects empty criteria array", () => {
    const result = CriteriaSetSchema.safeParse({
      ...validSet,
      criteria: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects more than 20 criteria", () => {
    const manyCriteria = Array.from({ length: 21 }, (_, i) => ({
      id: `c${i + 1}`,
      criterion: `Criterion ${i + 1}`,
      sub_questions: [],
    }));
    const result = CriteriaSetSchema.safeParse({
      ...validSet,
      criteria: manyCriteria,
    });
    expect(result.success).toBe(false);
  });

  it("accepts up to 20 criteria", () => {
    const twentyCriteria = Array.from({ length: 20 }, (_, i) => ({
      id: `c${i + 1}`,
      criterion: `Criterion ${i + 1}`,
      sub_questions: [],
    }));
    const result = CriteriaSetSchema.safeParse({
      ...validSet,
      criteria: twentyCriteria,
    });
    expect(result.success).toBe(true);
  });
});

describe("ParseCriteriaRequestSchema", () => {
  it("accepts valid raw text", () => {
    const result = ParseCriteriaRequestSchema.safeParse({
      rawText: "1. Clear need for the project (25%)\n2. Measurable outcomes (25%)",
    });
    expect(result.success).toBe(true);
  });

  it("rejects text shorter than 10 characters", () => {
    const result = ParseCriteriaRequestSchema.safeParse({
      rawText: "short",
    });
    expect(result.success).toBe(false);
  });

  it("rejects text longer than 10000 characters", () => {
    const result = ParseCriteriaRequestSchema.safeParse({
      rawText: "a".repeat(10001),
    });
    expect(result.success).toBe(false);
  });
});

describe("SubmitReviewRequestSchema", () => {
  it("accepts a valid submit request", () => {
    const result = SubmitReviewRequestSchema.safeParse({
      bidFileName: "my-bid.docx",
      bidFilePath: "user123/1234567890-my-bid.docx",
      criteriaJson: {
        name: "Test Criteria",
        criteria: [
          { id: "c1", criterion: "Need", sub_questions: [] },
        ],
      },
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing file name", () => {
    const result = SubmitReviewRequestSchema.safeParse({
      bidFileName: "",
      bidFilePath: "some/path",
      criteriaJson: {
        name: "Test",
        criteria: [{ id: "c1", criterion: "Need", sub_questions: [] }],
      },
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing file path", () => {
    const result = SubmitReviewRequestSchema.safeParse({
      bidFileName: "bid.docx",
      bidFilePath: "",
      criteriaJson: {
        name: "Test",
        criteria: [{ id: "c1", criterion: "Need", sub_questions: [] }],
      },
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid nested criteria (empty criteria array)", () => {
    const result = SubmitReviewRequestSchema.safeParse({
      bidFileName: "bid.docx",
      bidFilePath: "user/bid.docx",
      criteriaJson: {
        name: "Test",
        criteria: [],
      },
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing criteriaJson entirely", () => {
    const result = SubmitReviewRequestSchema.safeParse({
      bidFileName: "bid.docx",
      bidFilePath: "user/bid.docx",
    });
    expect(result.success).toBe(false);
  });
});
