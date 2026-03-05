import { describe, it, expect } from "vitest";
import { scoreToHsl } from "../constants";

describe("scoreToHsl", () => {
  it("returns grey for null", () => {
    expect(scoreToHsl(null)).toBe("hsl(0, 0%, 60%)");
  });

  it("returns red hue for score 0", () => {
    const hsl = scoreToHsl(0);
    expect(hsl).toMatch(/^hsl\(0,/);
  });

  it("returns amber hue for score 50", () => {
    const hsl = scoreToHsl(50);
    expect(hsl).toMatch(/^hsl\(40,/);
  });

  it("returns green hue for score 100", () => {
    const hsl = scoreToHsl(100);
    expect(hsl).toMatch(/^hsl\(130,/);
  });

  it("interpolates linearly between 0 and 50", () => {
    const hsl = scoreToHsl(25);
    expect(hsl).toMatch(/^hsl\(20,/);
  });

  it("interpolates linearly between 50 and 100", () => {
    const hsl = scoreToHsl(75);
    // hue = 40 + ((75-50)/50) * 90 = 40 + 45 = 85
    expect(hsl).toMatch(/^hsl\(85,/);
  });

  it("clamps scores below 0", () => {
    expect(scoreToHsl(-10)).toBe(scoreToHsl(0));
  });

  it("clamps scores above 100", () => {
    expect(scoreToHsl(110)).toBe(scoreToHsl(100));
  });
});
