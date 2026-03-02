import { describe, it, expect } from "vitest";
import { getModalVariant, getConfirmLabel, formatErrorItem } from "../ImportResultModal";
import type { ParseResult } from "@/lib/markdown-import";

function makeResult(overrides?: Partial<ParseResult>): ParseResult {
  return {
    ok: true,
    metadata: { application_id: "app-1", questions_set_id: "qs-1", fund_id: "fund-1" },
    answers: [{ question_id: "q1", answer_text: "Test", is_disabled: false }],
    errors: [],
    warnings: [],
    ...overrides,
  };
}

describe("getModalVariant", () => {
  it("returns 'error' when errors are present", () => {
    const result = makeResult({
      ok: false,
      errors: [{ type: "error", message: "Missing field" }],
    });
    expect(getModalVariant(result)).toBe("error");
  });

  it("returns 'error' even when both errors and warnings exist", () => {
    const result = makeResult({
      ok: false,
      errors: [{ type: "error", message: "Bad ID" }],
      warnings: [{ type: "warning", message: "Word limit" }],
    });
    expect(getModalVariant(result)).toBe("error");
  });

  it("returns 'warning' when only warnings exist", () => {
    const result = makeResult({
      warnings: [{ type: "warning", message: "Word limit exceeded" }],
    });
    expect(getModalVariant(result)).toBe("warning");
  });

  it("returns 'success' when no errors or warnings", () => {
    const result = makeResult();
    expect(getModalVariant(result)).toBe("success");
  });
});

describe("getConfirmLabel", () => {
  it("returns null for error variant (no confirm button)", () => {
    expect(getConfirmLabel("error")).toBeNull();
  });

  it("returns 'Import Anyway' for warning variant", () => {
    expect(getConfirmLabel("warning")).toBe("Import Anyway");
  });

  it("returns 'Apply Import' for success variant", () => {
    expect(getConfirmLabel("success")).toBe("Apply Import");
  });
});

describe("formatErrorItem", () => {
  it("prefixes with question_id when present", () => {
    expect(formatErrorItem({ question_id: "q1", message: "Missing answer" })).toBe(
      "[q1] Missing answer"
    );
  });

  it("returns message only when no question_id", () => {
    expect(formatErrorItem({ message: "Frontmatter missing" })).toBe("Frontmatter missing");
  });

  it("handles undefined question_id", () => {
    expect(formatErrorItem({ question_id: undefined, message: "Error" })).toBe("Error");
  });
});
