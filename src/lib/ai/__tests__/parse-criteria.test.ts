import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCreate = vi.fn();

vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: class MockAnthropic {
      messages = { create: mockCreate };
    },
  };
});

import { parseCriteriaWithAI } from "../parse-criteria";

describe("parseCriteriaWithAI", () => {
  beforeEach(() => {
    mockCreate.mockReset();
  });

  it("returns a valid CriteriaSet from AI response", async () => {
    mockCreate.mockResolvedValue({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            name: "Test Fund",
            description: "Test criteria set",
            criteria: [
              {
                id: "c1",
                criterion: "Demonstrates clear need",
                weight: "25%",
                sub_questions: ["What evidence of need?"],
              },
              {
                id: "c2",
                criterion: "Measurable outcomes",
                sub_questions: [],
              },
            ],
          }),
        },
      ],
    });

    const result = await parseCriteriaWithAI("1. Clear need (25%)\n2. Measurable outcomes");

    expect(result.name).toBe("Test Fund");
    expect(result.criteria).toHaveLength(2);
    expect(result.criteria[0].id).toBe("c1");
    expect(result.criteria[0].weight).toBe("25%");
  });

  it("handles markdown-wrapped JSON from AI", async () => {
    mockCreate.mockResolvedValue({
      content: [
        {
          type: "text",
          text: '```json\n{"name":"Wrapped","criteria":[{"id":"c1","criterion":"Test","sub_questions":[]}]}\n```',
        },
      ],
    });

    const result = await parseCriteriaWithAI("Some criteria text here");
    expect(result.name).toBe("Wrapped");
    expect(result.criteria).toHaveLength(1);
  });

  it("throws on invalid AI response", async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: "text", text: "not json" }],
    });

    await expect(parseCriteriaWithAI("test input")).rejects.toThrow();
  });

  it("throws when AI returns no text block", async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: "tool_use", id: "x", name: "y", input: {} }],
    });

    await expect(parseCriteriaWithAI("test input")).rejects.toThrow("No text response from AI");
  });

  it("throws when AI returns valid JSON but invalid schema", async () => {
    mockCreate.mockResolvedValue({
      content: [
        {
          type: "text",
          text: JSON.stringify({ name: "Test", criteria: [{ id: "c1" }] }),
        },
      ],
    });

    await expect(parseCriteriaWithAI("test input")).rejects.toThrow();
  });
});
