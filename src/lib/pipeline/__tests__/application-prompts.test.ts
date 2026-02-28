import { describe, it, expect } from "vitest";
import { buildAnswerAnalysisPrompt, type AnswerContext } from "../application-prompts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAnswer(overrides: Partial<AnswerContext> = {}): AnswerContext {
  return {
    question_id: "q1",
    question_text: "Describe your project",
    answer_text: "We will deliver training to 50 young people in the region.",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Factual field types: email, url, phone, number
// ---------------------------------------------------------------------------

describe("buildAnswerAnalysisPrompt — factual field types", () => {
  const factualTypes = ["email", "url", "phone", "number"] as const;

  for (const fieldType of factualTypes) {
    it(`suppresses word count section for field_type="${fieldType}"`, () => {
      const prompt = buildAnswerAnalysisPrompt(
        makeAnswer({ field_type: fieldType, answer_text: "test@example.com", word_count_max: 300 })
      );
      expect(prompt).not.toContain("## Word Count");
      expect(prompt).not.toContain("utilised");
    });

    it(`includes factual field notice for field_type="${fieldType}"`, () => {
      const prompt = buildAnswerAnalysisPrompt(
        makeAnswer({ field_type: fieldType, answer_text: "test@example.com" })
      );
      expect(prompt).toContain("factual single-value field");
      expect(prompt).toContain(fieldType);
    });

    it(`does NOT include constrained-input notice for field_type="${fieldType}"`, () => {
      const prompt = buildAnswerAnalysisPrompt(
        makeAnswer({ field_type: fieldType, answer_text: "test@example.com" })
      );
      expect(prompt).not.toContain("selected from predefined options");
    });
  }
});

// ---------------------------------------------------------------------------
// Short text field: text_short
// ---------------------------------------------------------------------------

describe("buildAnswerAnalysisPrompt — text_short field type", () => {
  it("suppresses word count section even when word_count_max is set", () => {
    const prompt = buildAnswerAnalysisPrompt(
      makeAnswer({ field_type: "text_short", answer_text: "Transform Training", word_count_max: 300 })
    );
    expect(prompt).not.toContain("Word Count");
    expect(prompt).not.toContain("utilised");
  });

  it("does NOT include factual field notice (text_short may still expect narrative)", () => {
    const prompt = buildAnswerAnalysisPrompt(
      makeAnswer({ field_type: "text_short", answer_text: "Transform Training" })
    );
    expect(prompt).not.toContain("factual single-value field");
  });

  it("does NOT include constrained-input notice", () => {
    const prompt = buildAnswerAnalysisPrompt(
      makeAnswer({ field_type: "text_short", answer_text: "Transform Training" })
    );
    expect(prompt).not.toContain("selected from predefined options");
  });
});

// ---------------------------------------------------------------------------
// Constrained field types: dropdown, radio, checkbox
// ---------------------------------------------------------------------------

describe("buildAnswerAnalysisPrompt — constrained field types", () => {
  const constrainedTypes = ["dropdown", "radio", "checkbox"] as const;

  for (const fieldType of constrainedTypes) {
    it(`includes constrained-input notice for field_type="${fieldType}"`, () => {
      const prompt = buildAnswerAnalysisPrompt(
        makeAnswer({ field_type: fieldType, answer_text: "Yes" })
      );
      expect(prompt).toContain("selected from predefined options");
      expect(prompt).toContain(fieldType);
    });

    it(`suppresses word count section for field_type="${fieldType}"`, () => {
      const prompt = buildAnswerAnalysisPrompt(
        makeAnswer({ field_type: fieldType, answer_text: "Yes", word_count_max: 300 })
      );
      expect(prompt).not.toContain("## Word Count");
      expect(prompt).not.toContain("utilised");
    });
  }
});

// ---------------------------------------------------------------------------
// Word count logic for text_long
// ---------------------------------------------------------------------------

describe("buildAnswerAnalysisPrompt — word count section (text_long)", () => {
  it("includes word count section when word_count_max is set", () => {
    const prompt = buildAnswerAnalysisPrompt(
      makeAnswer({ field_type: "text_long", word_count_max: 300 })
    );
    expect(prompt).toContain("Word Count");
    expect(prompt).toContain("300");
  });

  it("omits word count section when no limit is set", () => {
    const prompt = buildAnswerAnalysisPrompt(
      makeAnswer({ field_type: "text_long" })
    );
    expect(prompt).not.toContain("Word Count");
  });

  it("flags below minimum word count", () => {
    const prompt = buildAnswerAnalysisPrompt(
      makeAnswer({
        field_type: "text_long",
        answer_text: "short answer",
        word_count_min: 100,
        word_count_max: 300,
      })
    );
    expect(prompt).toContain("BELOW the minimum");
  });

  it("flags conciseness when over 85% of limit used", () => {
    const longText = "word ".repeat(260).trim(); // 260 words, 86% of 300
    const prompt = buildAnswerAnalysisPrompt(
      makeAnswer({ field_type: "text_long", answer_text: longText, word_count_max: 300 })
    );
    expect(prompt).toContain("CONCISENESS");
  });

  it("shows balanced guidance at 70-85% utilisation", () => {
    const midText = "word ".repeat(220).trim(); // 220 words, 73% of 300
    const prompt = buildAnswerAnalysisPrompt(
      makeAnswer({ field_type: "text_long", answer_text: midText, word_count_max: 300 })
    );
    expect(prompt).toContain("Balance suggestions");
  });
});

// ---------------------------------------------------------------------------
// Guidance section
// ---------------------------------------------------------------------------

describe("buildAnswerAnalysisPrompt — guidance section", () => {
  it("includes guidance when present", () => {
    const prompt = buildAnswerAnalysisPrompt(
      makeAnswer({ guidance: "Focus on measurable outcomes and impact." })
    );
    expect(prompt).toContain("Funder Guidance for This Question");
    expect(prompt).toContain("Focus on measurable outcomes");
  });

  it("omits guidance section when not provided", () => {
    const prompt = buildAnswerAnalysisPrompt(makeAnswer());
    expect(prompt).not.toContain("Funder Guidance for This Question");
  });
});

// ---------------------------------------------------------------------------
// Priority section
// ---------------------------------------------------------------------------

describe("buildAnswerAnalysisPrompt — priority", () => {
  it("includes priority when set", () => {
    const prompt = buildAnswerAnalysisPrompt(makeAnswer({ priority: 4 }));
    expect(prompt).toContain("Priority/weight: 4/5");
  });

  it("omits priority section when not set", () => {
    const prompt = buildAnswerAnalysisPrompt(makeAnswer());
    expect(prompt).not.toContain("Priority/weight");
  });
});

// ---------------------------------------------------------------------------
// Question ID and text always present
// ---------------------------------------------------------------------------

describe("buildAnswerAnalysisPrompt — always-present content", () => {
  it("includes question_id in the task header", () => {
    const prompt = buildAnswerAnalysisPrompt(makeAnswer({ question_id: "q7" }));
    expect(prompt).toContain('Question "q7"');
  });

  it("includes question text", () => {
    const prompt = buildAnswerAnalysisPrompt(
      makeAnswer({ question_text: "What is your theory of change?" })
    );
    expect(prompt).toContain("What is your theory of change?");
  });

  it("includes answer text", () => {
    const prompt = buildAnswerAnalysisPrompt(
      makeAnswer({ answer_text: "Our theory is based on systemic change." })
    );
    expect(prompt).toContain("Our theory is based on systemic change.");
  });
});
