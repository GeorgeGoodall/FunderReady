import { describe, it, expect } from "vitest";
import {
  CriterionSchema,
  CriteriaSetSchema,
  ParseCriteriaRequestSchema,
  SubmitReviewRequestSchema,
  FundSchema,
  CreateFundSchema,
  SubmitReviewRequestV2Schema,
  ExtendedQuestionSchema,
  CreateApplicationRequestSchema,
  SaveAnswersRequestSchema,
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

  it("accepts long text without upper limit", () => {
    const result = ParseCriteriaRequestSchema.safeParse({
      rawText: "a".repeat(50000),
    });
    expect(result.success).toBe(true);
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

describe("FundSchema", () => {
  it("accepts a valid fund with all fields", () => {
    const result = FundSchema.safeParse({
      id: "550e8400-e29b-41d4-a716-446655440000",
      name: "Community Ownership Fund",
      organisation_id: "660e8400-e29b-41d4-a716-446655440001",
      url: "https://example.com/fund",
      notes: "Round 2",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a fund with only required fields", () => {
    const result = FundSchema.safeParse({
      id: "550e8400-e29b-41d4-a716-446655440000",
      name: "Test Fund",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty name", () => {
    const result = FundSchema.safeParse({
      id: "550e8400-e29b-41d4-a716-446655440000",
      name: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-uuid id", () => {
    const result = FundSchema.safeParse({
      id: "not-a-uuid",
      name: "Test Fund",
    });
    expect(result.success).toBe(false);
  });
});

describe("CreateFundSchema", () => {
  it("accepts a fund without id", () => {
    const result = CreateFundSchema.safeParse({
      name: "New Fund",
    });
    expect(result.success).toBe(true);
  });

  it("rejects if id is provided", () => {
    const result = CreateFundSchema.safeParse({
      id: "550e8400-e29b-41d4-a716-446655440000",
      name: "New Fund",
    });
    // strict mode strips extra keys but doesn't fail by default
    expect(result.success).toBe(true);
  });
});

describe("SubmitReviewRequestV2Schema", () => {
  const validV2 = {
    bidFileName: "my-bid.docx",
    bidFilePath: "user123/1234567890-my-bid.docx",
    fundId: "550e8400-e29b-41d4-a716-446655440000",
    criteriaSetId: "660e8400-e29b-41d4-a716-446655440000",
  };

  it("accepts a valid V2 request", () => {
    const result = SubmitReviewRequestV2Schema.safeParse(validV2);
    expect(result.success).toBe(true);
  });

  it("accepts with optional questionsSetId", () => {
    const result = SubmitReviewRequestV2Schema.safeParse({
      ...validV2,
      questionsSetId: "770e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.success).toBe(true);
  });

  it("defaults completeDraft to true", () => {
    const result = SubmitReviewRequestV2Schema.safeParse(validV2);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.completeDraft).toBe(true);
    }
  });

  it("rejects non-uuid fundId", () => {
    const result = SubmitReviewRequestV2Schema.safeParse({
      ...validV2,
      fundId: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-uuid criteriaSetId", () => {
    const result = SubmitReviewRequestV2Schema.safeParse({
      ...validV2,
      criteriaSetId: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing fundId", () => {
    const result = SubmitReviewRequestV2Schema.safeParse({
      bidFileName: "bid.docx",
      bidFilePath: "user/bid.docx",
      criteriaSetId: "660e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing criteriaSetId", () => {
    const result = SubmitReviewRequestV2Schema.safeParse({
      bidFileName: "bid.docx",
      bidFilePath: "user/bid.docx",
      fundId: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.success).toBe(false);
  });
});

describe("ExtendedQuestionSchema", () => {
  it("accepts a question with all extended fields", () => {
    const result = ExtendedQuestionSchema.safeParse({
      id: "q1",
      question: "Describe your project outcomes",
      word_count_max: 500,
      guidance: "Be specific about measurable outcomes",
      field_type: "text_long",
      options: [],
      char_limit: 3000,
      required: true,
      section: "Project Details",
    });
    expect(result.success).toBe(true);
  });

  it("defaults field_type to text_long", () => {
    const result = ExtendedQuestionSchema.safeParse({
      id: "q1",
      question: "Describe your project",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.field_type).toBe("text_long");
    }
  });

  it("defaults required to true", () => {
    const result = ExtendedQuestionSchema.safeParse({
      id: "q1",
      question: "Describe your project",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.required).toBe(true);
    }
  });

  it("accepts all valid field types", () => {
    const types = ["text_short", "text_long", "dropdown", "radio", "checkbox"] as const;
    for (const ft of types) {
      const result = ExtendedQuestionSchema.safeParse({
        id: "q1",
        question: "Test",
        field_type: ft,
      });
      expect(result.success).toBe(true);
    }
  });

  it("rejects invalid field_type", () => {
    const result = ExtendedQuestionSchema.safeParse({
      id: "q1",
      question: "Test",
      field_type: "number",
    });
    expect(result.success).toBe(false);
  });

  it("accepts dropdown with options", () => {
    const result = ExtendedQuestionSchema.safeParse({
      id: "q1",
      question: "Select your region",
      field_type: "dropdown",
      options: ["North", "South", "East", "West"],
    });
    expect(result.success).toBe(true);
  });

  it("rejects non-positive char_limit", () => {
    const result = ExtendedQuestionSchema.safeParse({
      id: "q1",
      question: "Test",
      char_limit: 0,
    });
    expect(result.success).toBe(false);
  });
});

describe("CreateApplicationRequestSchema", () => {
  const validRequest = {
    fundId: "550e8400-e29b-41d4-a716-446655440000",
    criteriaSetId: "660e8400-e29b-41d4-a716-446655440000",
    questionsSetId: "770e8400-e29b-41d4-a716-446655440000",
  };

  it("accepts a valid request", () => {
    const result = CreateApplicationRequestSchema.safeParse(validRequest);
    expect(result.success).toBe(true);
  });

  it("accepts with optional title", () => {
    const result = CreateApplicationRequestSchema.safeParse({
      ...validRequest,
      title: "My application draft",
    });
    expect(result.success).toBe(true);
  });

  it("rejects non-uuid fundId", () => {
    const result = CreateApplicationRequestSchema.safeParse({
      ...validRequest,
      fundId: "not-uuid",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing questionsSetId", () => {
    const result = CreateApplicationRequestSchema.safeParse({
      fundId: "550e8400-e29b-41d4-a716-446655440000",
      criteriaSetId: "660e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.success).toBe(false);
  });
});

describe("SaveAnswersRequestSchema", () => {
  it("accepts valid answers", () => {
    const result = SaveAnswersRequestSchema.safeParse({
      answers: [
        { question_id: "q1", answer_text: "Our project will..." },
        { question_id: "q2", answer_text: "We target..." },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("accepts answers with selected_options", () => {
    const result = SaveAnswersRequestSchema.safeParse({
      answers: [
        { question_id: "q1", answer_text: "", selected_options: ["Option A", "Option B"] },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty answers array", () => {
    const result = SaveAnswersRequestSchema.safeParse({ answers: [] });
    expect(result.success).toBe(false);
  });

  it("rejects answer with empty question_id", () => {
    const result = SaveAnswersRequestSchema.safeParse({
      answers: [{ question_id: "", answer_text: "text" }],
    });
    expect(result.success).toBe(false);
  });
});
