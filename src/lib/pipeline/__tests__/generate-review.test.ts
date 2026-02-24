import { describe, it, expect } from "vitest";
import { generateReviewDoc } from "../generate-review";
import type { ParsedBid } from "../parse-bid";
import type { SectionAnalysis, Scoring } from "../schemas";

function mockParsedBid(): ParsedBid {
  return {
    metadata: {
      source_file: "test-bid.docx",
      parsed_at: new Date().toISOString(),
      total_words: 500,
      total_sections: 2,
      total_paragraphs: 4,
      heading_styles_detected: true,
    },
    sections: [
      { id: "s1", title: "Introduction", level: 1, word_count: 250, paragraph_ids: ["p1", "p2"] },
      { id: "s2", title: "Methodology", level: 1, word_count: 250, paragraph_ids: ["p3", "p4"] },
    ],
    paragraphs: {
      p1: { id: "p1", section_id: "s1", text: "Our organisation aims to support young people in Southwark.", word_count: 9 },
      p2: { id: "p2", section_id: "s1", text: "We have delivered similar projects for over 10 years with proven outcomes.", word_count: 12 },
      p3: { id: "p3", section_id: "s2", text: "The project will use a community-based approach to engagement.", word_count: 10 },
      p4: { id: "p4", section_id: "s2", text: "Weekly sessions will run for 12 months reaching 200 participants.", word_count: 10 },
    },
    full_text: "Our organisation aims to support young people...",
  };
}

function mockSectionAnalyses(): SectionAnalysis[] {
  return [
    {
      section_id: "s1",
      inline_comments: [
        {
          paragraph_id: "p1",
          target_text: "aims to support young people",
          category: "SPECIFICITY",
          issue: "The statement lacks detail about specific support activities planned.",
          suggestion: "Specify the types of support, e.g., mentoring, workshops, counselling.",
        },
      ],
      criteria_relevance: [
        { criterion_id: "c1", relevance: "directly_addresses", notes: "Good alignment" },
      ],
      strengths: ["Clear target group identified"],
      weaknesses: ["Lacks specific activity detail"],
    },
    {
      section_id: "s2",
      inline_comments: [],
      criteria_relevance: [
        { criterion_id: "c2", relevance: "partially_addresses" },
      ],
      strengths: ["Good delivery plan"],
      weaknesses: ["No evaluation framework"],
    },
  ];
}

function mockScoring(): Scoring {
  return {
    criteria_scores: [
      {
        criterion_id: "c1",
        criterion: "Clear Need",
        score: "Fair",
        bid_evidence: ["Section 1 describes target group"],
        gaps: ["No statistics on need"],
        summary: "Need is described but lacks data",
      },
      {
        criterion_id: "c2",
        criterion: "Delivery Plan",
        score: "Strong",
        bid_evidence: ["Section 2 outlines 12-month plan"],
        gaps: [],
        summary: "Well-structured delivery plan",
      },
    ],
    overall_score: 68,
    overall_descriptor: "Needs Revisions",
    submission_readiness: "Needs revisions",
    top_strengths: ["Clear target group", "Structured delivery plan"],
    top_improvements: ["Add needs data", "Include evaluation framework"],
    improvement_appendix: [
      {
        criterion_id: "c1",
        criterion: "Clear Need",
        what_funder_wants: "Evidence-based needs assessment",
        how_bid_addresses: "Identifies target group",
        whats_missing: "Quantitative data on need",
        example_language: "According to ONS 2024 data, 35% of young people in Southwark...",
      },
    ],
  };
}

describe("generateReviewDoc", () => {
  it("produces a valid Buffer output", async () => {
    const buffer = await generateReviewDoc(
      mockParsedBid(),
      mockSectionAnalyses(),
      mockScoring(),
      "Test Bid"
    );

    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(1000);

    // .docx files are ZIP format — should start with PK signature
    expect(buffer[0]).toBe(0x50); // P
    expect(buffer[1]).toBe(0x4b); // K
  });

  it("handles empty section analyses", async () => {
    const buffer = await generateReviewDoc(mockParsedBid(), [], mockScoring(), "Test Bid");

    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(500);
  });

  it("handles scoring with no improvement appendix", async () => {
    const scoring = mockScoring();
    scoring.improvement_appendix = undefined;

    const buffer = await generateReviewDoc(
      mockParsedBid(),
      mockSectionAnalyses(),
      scoring,
      "Test Bid"
    );

    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(500);
  });
});
