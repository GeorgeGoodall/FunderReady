import { describe, it, expect } from "vitest";
import { formatDateUTC } from "../date-utils";

describe("formatDateUTC", () => {
  it("formats ISO date to 'd Mon YYYY' format", () => {
    expect(formatDateUTC("2026-03-04T10:30:00Z")).toBe("4 Mar 2026");
  });

  it("uses UTC month and day (not local timezone)", () => {
    // Midnight UTC — should still be March 1st in UTC
    expect(formatDateUTC("2026-03-01T00:00:00Z")).toBe("1 Mar 2026");
  });

  it("handles all months", () => {
    expect(formatDateUTC("2026-01-15T00:00:00Z")).toBe("15 Jan 2026");
    expect(formatDateUTC("2026-06-20T00:00:00Z")).toBe("20 Jun 2026");
    expect(formatDateUTC("2026-12-25T00:00:00Z")).toBe("25 Dec 2026");
  });
});
