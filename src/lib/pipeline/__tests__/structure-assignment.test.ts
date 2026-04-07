import { describe, it, expect } from "vitest";
import {
  StructureAssignmentSchema,
  buildStructureAssignmentPrompt,
} from "../structure-assignment";

describe("StructureAssignmentSchema", () => {
  it("validates a valid structure assignment response", () => {
    const data = {
      sections: [
        { id: "s1", title: "Organisation Overview", content: "We are a housing association..." },
        { id: "s2", title: "Project Rationale", content: "This project addresses..." },
      ],
    };
    expect(StructureAssignmentSchema.parse(data)).toEqual(data);
  });

  it("rejects empty sections array", () => {
    expect(() => StructureAssignmentSchema.parse({ sections: [] })).toThrow();
  });

  it("rejects sections missing required fields", () => {
    expect(() =>
      StructureAssignmentSchema.parse({
        sections: [{ id: "s1", title: "Overview" }], // missing content
      })
    ).toThrow();
  });

  it("rejects a single-section response (minimum is 2)", () => {
    expect(() =>
      StructureAssignmentSchema.parse({
        sections: [{ id: "s1", title: "Overview", content: "Some content" }],
      })
    ).toThrow();
  });

  it("rejects section with empty content", () => {
    expect(() =>
      StructureAssignmentSchema.parse({
        sections: [{ id: "s1", title: "Overview", content: "" }],
      })
    ).toThrow();
  });
});

describe("buildStructureAssignmentPrompt", () => {
  const criteria = [
    { id: "c1", criterion: "Community benefit" },
    { id: "c2", criterion: "Financial sustainability" },
  ];

  it("returns systemPrompt and userPrompt strings", () => {
    const { systemPrompt, userPrompt } = buildStructureAssignmentPrompt(
      "This is a test document about our project.",
      criteria
    );
    expect(typeof systemPrompt).toBe("string");
    expect(typeof userPrompt).toBe("string");
    expect(systemPrompt.length).toBeGreaterThan(50);
  });

  it("includes document text in userPrompt", () => {
    const docText = "Unique document content xyz123";
    const { userPrompt } = buildStructureAssignmentPrompt(docText, criteria);
    expect(userPrompt).toContain(docText);
  });

  it("includes criteria in userPrompt", () => {
    const { userPrompt } = buildStructureAssignmentPrompt("doc", criteria);
    expect(userPrompt).toContain("Community benefit");
    expect(userPrompt).toContain("Financial sustainability");
  });
});
