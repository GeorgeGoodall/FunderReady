import { describe, it, expect } from "vitest";
import { sanitizeExampleLanguage } from "../application-review";
import type { ImprovementAppendixItem } from "@/lib/pipeline/schemas";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeItem(overrides: Partial<ImprovementAppendixItem> = {}): ImprovementAppendixItem {
  return {
    criterion_id: "c1",
    criterion: "Clear need",
    what_funder_wants: "Evidence of need",
    how_bid_addresses: "Mentions need",
    whats_missing: "Specific data",
    ...overrides,
  };
}

describe("sanitizeExampleLanguage", () => {
  it("replaces fabricated percentages not in known numbers", () => {
    const items = [makeItem({ example_language: "We achieved 85% success rate" })];
    const known = new Set<string>();
    const result = sanitizeExampleLanguage(items, known);
    expect(result[0].example_language).toBe("We achieved [X]% success rate");
  });

  it("preserves percentages found in original answer text", () => {
    const items = [makeItem({ example_language: "Our 78% retention rate" })];
    // extractKnownNumbers adds both "78%" and "78" (standalone number also matches)
    const known = new Set(["78%", "78"]);
    const result = sanitizeExampleLanguage(items, known);
    expect(result[0].example_language).toBe("Our 78% retention rate");
  });

  it("replaces fabricated multi-digit numbers not in known numbers", () => {
    const items = [makeItem({ example_language: "We reached 340 young people" })];
    const known = new Set<string>();
    const result = sanitizeExampleLanguage(items, known);
    expect(result[0].example_language).toBe("We reached [X] young people");
  });

  it("preserves known multi-digit numbers from answer text", () => {
    const items = [makeItem({ example_language: "Our programme served 340 participants" })];
    const known = new Set(["340"]);
    const result = sanitizeExampleLanguage(items, known);
    expect(result[0].example_language).toBe("Our programme served 340 participants");
  });

  it("replaces parenthetical citations that look fabricated", () => {
    const items = [makeItem({ example_language: "As shown (Smith & Associates, 2024) the results" })];
    // Must include "2024" in known so number replacement doesn't break the year
    // before the citation regex runs
    const known = new Set(["2024"]);
    const result = sanitizeExampleLanguage(items, known);
    expect(result[0].example_language).toContain("[cite source, year]");
    expect(result[0].example_language).not.toContain("Smith");
  });

  it("leaves items without example_language unchanged", () => {
    const items = [makeItem()];
    const known = new Set<string>();
    const result = sanitizeExampleLanguage(items, known);
    expect(result[0].example_language).toBeUndefined();
  });

  it("handles empty appendix array", () => {
    const result = sanitizeExampleLanguage([], new Set());
    expect(result).toEqual([]);
  });

  it("handles multiple items with mixed fabricated and known numbers", () => {
    const items = [
      makeItem({ example_language: "Achieved 95% with 200 participants" }),
      makeItem({ example_language: "Our 50 volunteers reached 78% target" }),
    ];
    // extractKnownNumbers would add both "78%" and "78" for "78%" in text
    const known = new Set(["78%", "78", "50"]);
    const result = sanitizeExampleLanguage(items, known);
    expect(result[0].example_language).toBe("Achieved [X]% with [X] participants");
    expect(result[1].example_language).toBe("Our 50 volunteers reached 78% target");
  });

  it("does not replace single-digit numbers", () => {
    const items = [makeItem({ example_language: "We have 3 partners and 5 staff" })];
    const known = new Set<string>();
    const result = sanitizeExampleLanguage(items, known);
    // Single digits (1 digit) should not be touched since regex is \b(\d{2,})\b
    expect(result[0].example_language).toBe("We have 3 partners and 5 staff");
  });

  it("does not mutate original items (returns new array)", () => {
    const original = makeItem({ example_language: "We reached 500 people with 90% satisfaction" });
    const items = [original];
    const known = new Set<string>();
    sanitizeExampleLanguage(items, known);
    // Original item should be unchanged
    expect(original.example_language).toBe("We reached 500 people with 90% satisfaction");
  });

  it("handles text with only percentages and no standalone numbers", () => {
    const items = [makeItem({ example_language: "Achieved 5% growth" })];
    const known = new Set<string>();
    const result = sanitizeExampleLanguage(items, known);
    expect(result[0].example_language).toBe("Achieved [X]% growth");
  });

  it("handles text with multiple fabricated citations", () => {
    const items = [makeItem({
      example_language: "See (Jones, 2023) and (Smith, 2024) for evidence",
    })];
    const known = new Set(["2023", "2024"]);
    const result = sanitizeExampleLanguage(items, known);
    expect(result[0].example_language).toContain("[cite source, year]");
    expect(result[0].example_language).not.toContain("Jones");
    expect(result[0].example_language).not.toContain("Smith");
  });

  it("handles percentage at boundary (100%)", () => {
    const items = [makeItem({ example_language: "100% completion rate" })];
    const known = new Set<string>();
    const result = sanitizeExampleLanguage(items, known);
    expect(result[0].example_language).toBe("[X]% completion rate");
  });

  it("preserves text with no numbers or citations", () => {
    const items = [makeItem({ example_language: "We will deliver high-quality outcomes" })];
    const known = new Set<string>();
    const result = sanitizeExampleLanguage(items, known);
    expect(result[0].example_language).toBe("We will deliver high-quality outcomes");
  });

  it("handles citation that does not match pattern (no year)", () => {
    const items = [makeItem({ example_language: "As noted (see appendix) earlier" })];
    const known = new Set<string>();
    const result = sanitizeExampleLanguage(items, known);
    // This parenthetical doesn't match the fabricated citation pattern (no year)
    expect(result[0].example_language).toContain("(see appendix)");
  });
});
