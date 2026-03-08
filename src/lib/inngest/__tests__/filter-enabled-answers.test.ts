import { describe, it, expect } from "vitest";
import { filterEnabledAnswers } from "../application-review";

// ---------------------------------------------------------------------------
// filterEnabledAnswers
// ---------------------------------------------------------------------------

describe("filterEnabledAnswers", () => {
  it("includes answer with non-empty answer_text", () => {
    const answers = [
      { question_id: "q1", answer_text: "Some text", field_type: "text_long", selected_options: null, is_disabled: false, last_reviewed_text: null },
    ];
    const result = filterEnabledAnswers(answers);
    expect(result).toHaveLength(1);
  });

  it("excludes disabled answers even if answer_text is non-empty", () => {
    const answers = [
      { question_id: "q1", answer_text: "Some text", field_type: "text_long", selected_options: null, is_disabled: true, last_reviewed_text: null },
    ];
    const result = filterEnabledAnswers(answers);
    expect(result).toHaveLength(0);
  });

  it("includes answer with empty answer_text but non-empty selected_options", () => {
    const answers = [
      { question_id: "q1", answer_text: "", field_type: "radio", selected_options: ["Yes"], is_disabled: false, last_reviewed_text: null },
    ];
    const result = filterEnabledAnswers(answers);
    expect(result).toHaveLength(1);
  });

  it("excludes answer with empty answer_text and empty selected_options array", () => {
    const answers = [
      { question_id: "q1", answer_text: "", field_type: "checkbox", selected_options: [], is_disabled: false, last_reviewed_text: null },
    ];
    const result = filterEnabledAnswers(answers);
    expect(result).toHaveLength(0);
  });

  it("excludes answer with empty answer_text and null selected_options", () => {
    const answers = [
      { question_id: "q1", answer_text: "", field_type: "text_long", selected_options: null, is_disabled: false, last_reviewed_text: null },
    ];
    const result = filterEnabledAnswers(answers);
    expect(result).toHaveLength(0);
  });

  it("excludes answer with whitespace-only answer_text and null selected_options", () => {
    const answers = [
      { question_id: "q1", answer_text: "   ", field_type: "text_long", selected_options: null, is_disabled: false, last_reviewed_text: null },
    ];
    const result = filterEnabledAnswers(answers);
    expect(result).toHaveLength(0);
  });

  it("includes radio_other answer with selected_options=['Yes'] and empty answer_text", () => {
    const answers = [
      { question_id: "q1", answer_text: "", field_type: "radio_other", selected_options: ["Yes"], is_disabled: false, last_reviewed_text: null },
    ];
    const result = filterEnabledAnswers(answers);
    expect(result).toHaveLength(1);
  });

  it("includes checkbox_other answer with Other checked and answer_text", () => {
    const answers = [
      { question_id: "q1", answer_text: "custom text", field_type: "checkbox_other", selected_options: ["A", "Other"], is_disabled: false, last_reviewed_text: null },
    ];
    const result = filterEnabledAnswers(answers);
    expect(result).toHaveLength(1);
  });

  it("filters mixed list correctly", () => {
    const answers = [
      { question_id: "q1", answer_text: "text", field_type: "text_long", selected_options: null, is_disabled: false, last_reviewed_text: null },
      { question_id: "q2", answer_text: "", field_type: "radio", selected_options: ["Yes"], is_disabled: false, last_reviewed_text: null },
      { question_id: "q3", answer_text: "", field_type: "checkbox", selected_options: [], is_disabled: false, last_reviewed_text: null },
      { question_id: "q4", answer_text: "text", field_type: "text_long", selected_options: null, is_disabled: true, last_reviewed_text: null },
    ];
    const result = filterEnabledAnswers(answers);
    expect(result).toHaveLength(2);
    expect(result.map((a) => a.question_id)).toEqual(["q1", "q2"]);
  });
});
