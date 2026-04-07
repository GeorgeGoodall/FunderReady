import { describe, it, expect, vi, type MockedFunction } from "vitest";
import { extractAnswersFromDocument } from "../extract-answers";
import { callClaude } from "../anthropic";

vi.mock("../anthropic", () => ({
  callClaude: vi.fn(),
}));

const mockCallClaude = callClaude as MockedFunction<typeof callClaude>;

describe("extractAnswersFromDocument", () => {
  it("returns extracted answers for each question", async () => {
    mockCallClaude.mockResolvedValueOnce({
      answers: [
        { question_id: "q1", answer_text: "We are a community organisation." },
        { question_id: "q2", answer_text: "Our project will run for 12 months." },
      ],
    });

    const result = await extractAnswersFromDocument(
      "We are a community organisation. Our project will run for 12 months.",
      [
        { id: "q1", question: "Describe your organisation." },
        { id: "q2", question: "What is your project timeline?" },
      ]
    );

    expect(result).toEqual([
      { question_id: "q1", answer_text: "We are a community organisation." },
      { question_id: "q2", answer_text: "Our project will run for 12 months." },
    ]);
  });

  it("returns empty answer_text for questions with no match", async () => {
    mockCallClaude.mockResolvedValueOnce({
      answers: [
        { question_id: "q1", answer_text: "" },
      ],
    });

    const result = await extractAnswersFromDocument("Short document.", [
      { id: "q1", question: "Describe your budget." },
    ]);

    expect(result[0].answer_text).toBe("");
  });
});
