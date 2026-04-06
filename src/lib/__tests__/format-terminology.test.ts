import { describe, it, expect } from "vitest";
import { FORMAT_LABELS, getFormatLabels, APPLICATION_FORMATS } from "../format-terminology";

describe("APPLICATION_FORMATS", () => {
  it("contains exactly three formats", () => {
    expect(APPLICATION_FORMATS).toEqual(["question_form", "structured_doc", "unstructured_doc"]);
  });
});

describe("FORMAT_LABELS.question_form", () => {
  it("uses Question/Answer terminology", () => {
    expect(FORMAT_LABELS.question_form.item).toBe("Question");
    expect(FORMAT_LABELS.question_form.items).toBe("Questions");
    expect(FORMAT_LABELS.question_form.answer).toBe("Answer");
  });
  it("itemNumber returns 'Question 3'", () => {
    expect(FORMAT_LABELS.question_form.itemNumber(3)).toBe("Question 3");
  });
});

describe("FORMAT_LABELS.structured_doc", () => {
  it("uses Section/Content terminology", () => {
    expect(FORMAT_LABELS.structured_doc.item).toBe("Section");
    expect(FORMAT_LABELS.structured_doc.items).toBe("Sections");
    expect(FORMAT_LABELS.structured_doc.answer).toBe("Content");
  });
  it("itemNumber returns 'Section 2'", () => {
    expect(FORMAT_LABELS.structured_doc.itemNumber(2)).toBe("Section 2");
  });
});

describe("FORMAT_LABELS.unstructured_doc", () => {
  it("uses Document/Content terminology", () => {
    expect(FORMAT_LABELS.unstructured_doc.item).toBe("Document");
    expect(FORMAT_LABELS.unstructured_doc.items).toBe("Document");
    expect(FORMAT_LABELS.unstructured_doc.answer).toBe("Content");
  });
  it("itemNumber always returns 'Document'", () => {
    expect(FORMAT_LABELS.unstructured_doc.itemNumber(1)).toBe("Document");
    expect(FORMAT_LABELS.unstructured_doc.itemNumber(5)).toBe("Document");
  });
});

describe("getFormatLabels", () => {
  it("returns the correct labels object for each format", () => {
    expect(getFormatLabels("question_form")).toBe(FORMAT_LABELS.question_form);
    expect(getFormatLabels("structured_doc")).toBe(FORMAT_LABELS.structured_doc);
    expect(getFormatLabels("unstructured_doc")).toBe(FORMAT_LABELS.unstructured_doc);
  });
});
