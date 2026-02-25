import { describe, it, expect } from "vitest";
import { matchQuestionsToSections } from "../question-matcher";
import type { ParsedBid } from "../parse-bid";
import type { Question } from "@/lib/schemas/criteria";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeBid(sections: Array<{ id: string; title: string; word_count?: number; paragraph_ids?: string[] }>): ParsedBid {
  const paragraphs: ParsedBid["paragraphs"] = {};
  for (const s of sections) {
    for (const pid of s.paragraph_ids ?? [`${s.id}_p1`]) {
      paragraphs[pid] = { id: pid, section_id: s.id, text: "test", word_count: s.word_count ?? 100 };
    }
  }
  return {
    metadata: {
      source_file: "test.docx",
      parsed_at: new Date().toISOString(),
      total_words: 500,
      total_sections: sections.length,
      total_paragraphs: Object.keys(paragraphs).length,
      heading_styles_detected: true,
    },
    sections: sections.map((s) => ({
      id: s.id,
      title: s.title,
      level: 1,
      word_count: s.word_count ?? 100,
      paragraph_ids: s.paragraph_ids ?? [`${s.id}_p1`],
    })),
    paragraphs,
    full_text: "test",
  };
}

function makeQuestions(qs: Array<{ id: string; question: string; word_count_max?: number; guidance?: string }>): Question[] {
  return qs.map((q) => ({
    id: q.id,
    question: q.question,
    ...(q.word_count_max ? { word_count_max: q.word_count_max } : {}),
    ...(q.guidance ? { guidance: q.guidance } : {}),
  }));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("matchQuestionsToSections", () => {
  it("matches exact heading text to question text", () => {
    const bid = makeBid([
      { id: "s1", title: "Organisation Background" },
      { id: "s2", title: "Project Need and Evidence" },
      { id: "s3", title: "Budget and Value for Money" },
    ]);
    const questions = makeQuestions([
      { id: "q1", question: "Describe your organisation background" },
      { id: "q2", question: "What is the project need and evidence?" },
      { id: "q3", question: "Explain your budget and value for money" },
    ]);

    const result = matchQuestionsToSections(bid, questions);

    expect(result.sections[0].question_id).toBe("q1");
    expect(result.sections[1].question_id).toBe("q2");
    expect(result.sections[2].question_id).toBe("q3");
    expect(result.match_confidence).toBe("high");
    expect(result.unmatched_paragraph_ids).toHaveLength(0);
  });

  it("matches fuzzy/partial heading text", () => {
    const bid = makeBid([
      { id: "s1", title: "Background & Context" },
      { id: "s2", title: "Outcomes and Impact" },
    ]);
    const questions = makeQuestions([
      { id: "q1", question: "Tell us about the background and context for this project" },
      { id: "q2", question: "What outcomes and impact will the project achieve?" },
    ]);

    const result = matchQuestionsToSections(bid, questions);

    expect(result.sections[0].question_id).toBe("q1");
    expect(result.sections[1].question_id).toBe("q2");
    expect(result.match_confidence).toBe("high");
  });

  it("matches numbered headings (Q1, Q2) to questions by position", () => {
    const bid = makeBid([
      { id: "s1", title: "Q1: First response" },
      { id: "s2", title: "Q2: Second response" },
      { id: "s3", title: "Q3: Third response" },
    ]);
    const questions = makeQuestions([
      { id: "q1", question: "Tell us about your organisation" },
      { id: "q2", question: "What is the project need?" },
      { id: "q3", question: "Describe your delivery plan" },
    ]);

    const result = matchQuestionsToSections(bid, questions);

    expect(result.sections[0].question_id).toBe("q1");
    expect(result.sections[1].question_id).toBe("q2");
    expect(result.sections[2].question_id).toBe("q3");
  });

  it("matches '1.' style numbered headings", () => {
    const bid = makeBid([
      { id: "s1", title: "1. Introduction" },
      { id: "s2", title: "2. Methodology" },
    ]);
    const questions = makeQuestions([
      { id: "q1", question: "Provide an introduction to your approach" },
      { id: "q2", question: "Describe your methodology" },
    ]);

    const result = matchQuestionsToSections(bid, questions);

    expect(result.sections[0].question_id).toBe("q1");
    expect(result.sections[1].question_id).toBe("q2");
  });

  it("falls back to sequential assignment when <50% matched", () => {
    const bid = makeBid([
      { id: "s1", title: "Alpha" },
      { id: "s2", title: "Beta" },
      { id: "s3", title: "Gamma" },
    ]);
    const questions = makeQuestions([
      { id: "q1", question: "Completely unrelated topic one" },
      { id: "q2", question: "Completely unrelated topic two" },
      { id: "q3", question: "Completely unrelated topic three" },
    ]);

    const result = matchQuestionsToSections(bid, questions);

    // Sequential fallback assigns in order
    expect(result.sections[0].question_id).toBe("q1");
    expect(result.sections[1].question_id).toBe("q2");
    expect(result.sections[2].question_id).toBe("q3");
    expect(result.match_confidence).toBe("low");
  });

  it("tracks unmatched paragraphs", () => {
    const bid = makeBid([
      { id: "s1", title: "Preamble", paragraph_ids: ["p1", "p2"] },
      { id: "s2", title: "Project Need and Evidence", paragraph_ids: ["p3", "p4"] },
    ]);
    const questions = makeQuestions([
      { id: "q1", question: "What is the project need and evidence?" },
    ]);

    const result = matchQuestionsToSections(bid, questions);

    // s2 should match q1, s1 should be unmatched
    expect(result.sections[1].question_id).toBe("q1");
    expect(result.sections[0].question_id).toBeUndefined();
    expect(result.unmatched_paragraph_ids).toContain("p1");
    expect(result.unmatched_paragraph_ids).toContain("p2");
  });

  it("carries word count limits from questions to matched sections", () => {
    const bid = makeBid([
      { id: "s1", title: "Organisation Background" },
    ]);
    const questions = makeQuestions([
      { id: "q1", question: "Describe your organisation background", word_count_max: 300 },
    ]);

    const result = matchQuestionsToSections(bid, questions);

    expect(result.sections[0].word_count_max).toBe(300);
  });

  it("handles empty questions gracefully", () => {
    const bid = makeBid([{ id: "s1", title: "Test" }]);
    const result = matchQuestionsToSections(bid, []);
    expect(result.match_confidence).toBe("low");
    expect(result.sections).toHaveLength(1);
  });

  it("uses guidance text for better matching when question text is vague", () => {
    const bid = makeBid([
      { id: "s1", title: "Project Overview" },
      { id: "s2", title: "Community Involvement" },
      { id: "s3", title: "Funding Priorities" },
    ]);
    const questions = makeQuestions([
      {
        id: "q1",
        question: "What would you like to do?",
        word_count_max: 300,
        guidance: "Tell us about your project: what you would like to do, what difference your project will make",
      },
      {
        id: "q2",
        question: "How does your project involve your community?",
        word_count_max: 200,
        guidance: "Tell us how your community came up with the idea for your project",
      },
      {
        id: "q3",
        question: "How does your project meet our funding priorities?",
        word_count_max: 150,
        guidance: "We can fund projects that bring people together and build strong relationships",
      },
    ]);

    const result = matchQuestionsToSections(bid, questions);

    // q1 guidance mentions "project" → matches "Project Overview"
    // q2 mentions "community" → matches "Community Involvement"
    // q3 mentions "funding priorities" → matches "Funding Priorities"
    expect(result.sections[0].question_id).toBe("q1");
    expect(result.sections[1].question_id).toBe("q2");
    expect(result.sections[2].question_id).toBe("q3");
    expect(result.sections[0].word_count_max).toBe(300);
    expect(result.sections[1].word_count_max).toBe(200);
    expect(result.sections[2].word_count_max).toBe(150);
    expect(result.match_confidence).toBe("high");
  });

  it("handles more questions than sections", () => {
    const bid = makeBid([
      { id: "s1", title: "Project Need" },
    ]);
    const questions = makeQuestions([
      { id: "q1", question: "What is the project need?" },
      { id: "q2", question: "Describe your approach" },
      { id: "q3", question: "Budget details" },
    ]);

    const result = matchQuestionsToSections(bid, questions);

    // Should match what it can without error
    expect(result.sections).toHaveLength(1);
    expect(result.sections[0].question_id).toBe("q1");
  });
});
