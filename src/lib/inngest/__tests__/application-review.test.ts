import { describe, it, expect } from "vitest";
import { countWords } from "../application-review";

describe("countWords", () => {
  it("counts words in a normal sentence", () => {
    expect(countWords("The quick brown fox")).toBe(4);
  });
  it("returns 0 for empty string", () => {
    expect(countWords("")).toBe(0);
    expect(countWords("   ")).toBe(0);
  });
  it("handles multiple spaces", () => {
    expect(countWords("hello   world")).toBe(2);
  });
});
