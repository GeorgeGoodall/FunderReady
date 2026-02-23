import { describe, it, expect } from "vitest";
import type { ParsedBid, Section } from "../parse-bid";
import type { SectionAnalysis } from "../schemas";
import {
  formatCriteria,
  formatDocumentMap,
  formatSectionText,
  formatDocumentMapLite,
  formatAnalysesSummary,
  buildSectionAnalysisSystemPrompt,
  buildScoringSystemPrompt,
  createSkippedSectionAnalysis,
  buildPreFlightPrompt,
  buildSectionAnalysisPrompt,
  buildCrossReferencePrompt,
  buildScoringPrompt,
  SYSTEM_PERSONA,
  SCORING_RUBRIC,
  FEW_SHOT_COMMENTS,
  COMMENT_CATEGORIES_DESC,
  ANTI_HALLUCINATION,
  MIN_SECTION_WORDS,
  type Criterion,
} from "../prompt-templates";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const criteria: Criterion[] = [
  { id: "c1", criterion: "Value for money", weight: "30%", sub_questions: ["How is VFM demonstrated?", "What benchmarks?"] },
  { id: "c2", criterion: "Impact", sub_questions: [] },
  { id: "c3", criterion: "Sustainability" },
];

const section1: Section = {
  id: "s1",
  title: "Introduction",
  level: 1,
  word_count: 120,
  paragraph_ids: ["p1", "p2"],
};

const section2: Section = {
  id: "s2",
  title: "Budget",
  level: 2,
  word_count: 30,
  paragraph_ids: ["p3"],
};

const parsedBid: ParsedBid = {
  metadata: {
    source_file: "test.docx",
    parsed_at: "2025-01-01T00:00:00Z",
    total_words: 150,
    total_sections: 2,
    total_paragraphs: 3,
    heading_styles_detected: true,
  },
  sections: [section1, section2],
  paragraphs: {
    p1: { id: "p1", section_id: "s1", text: "This is the introduction.", word_count: 5 },
    p2: { id: "p2", section_id: "s1", text: "More introduction content here.", word_count: 5 },
    p3: { id: "p3", section_id: "s2", text: "Budget details go here.", word_count: 4 },
  },
  full_text: "This is the introduction. More introduction content here. Budget details go here.",
};

const sectionAnalyses: SectionAnalysis[] = [
  {
    section_id: "s1",
    inline_comments: [
      {
        paragraph_id: "p1",
        target_text: "the introduction",
        category: "CLARITY",
        issue: "This introduction lacks specificity about the project.",
        suggestion: "Add a clear statement of what the project does.",
      },
    ],
    criteria_relevance: [
      { criterion_id: "c1", relevance: "directly_addresses", notes: "Covers VFM" },
      { criterion_id: "c2", relevance: "not_relevant" },
    ],
    strengths: ["Clear opening", "Good structure"],
    weaknesses: ["Lacks evidence"],
  },
  {
    section_id: "s2",
    inline_comments: [],
    criteria_relevance: [],
    strengths: [],
    weaknesses: [],
  },
];

// ---------------------------------------------------------------------------
// formatCriteria
// ---------------------------------------------------------------------------

describe("formatCriteria", () => {
  it("formats criteria with weight and sub-questions", () => {
    const result = formatCriteria(criteria);
    expect(result).toContain("c1. Value for money (Weight: 30%)");
    expect(result).toContain("   - How is VFM demonstrated?");
    expect(result).toContain("   - What benchmarks?");
  });

  it("formats criteria without weight", () => {
    const result = formatCriteria(criteria);
    expect(result).toContain("c2. Impact");
    expect(result).not.toContain("c2. Impact (Weight:");
  });

  it("omits sub-questions when empty array", () => {
    const result = formatCriteria(criteria);
    // c2 has empty sub_questions — should have no indented lines after it
    const c2Line = result.split("\n\n").find((block) => block.startsWith("c2."))!;
    expect(c2Line).toBe("c2. Impact");
  });

  it("omits sub-questions when undefined", () => {
    const result = formatCriteria(criteria);
    const c3Line = result.split("\n\n").find((block) => block.startsWith("c3."))!;
    expect(c3Line).toBe("c3. Sustainability");
  });

  it("separates criteria with double newlines", () => {
    const result = formatCriteria(criteria);
    expect(result).toContain("\n\n");
  });

  it("returns empty string for empty array", () => {
    expect(formatCriteria([])).toBe("");
  });
});

// ---------------------------------------------------------------------------
// formatDocumentMap
// ---------------------------------------------------------------------------

describe("formatDocumentMap", () => {
  it("includes section id, title, level, word count and paragraph ids", () => {
    const result = formatDocumentMap(parsedBid);
    expect(result).toContain('s1: "Introduction" (Level 1, 120 words, paragraphs: p1, p2)');
    expect(result).toContain('s2: "Budget" (Level 2, 30 words, paragraphs: p3)');
  });

  it("joins sections with newlines", () => {
    const lines = formatDocumentMap(parsedBid).split("\n");
    expect(lines).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// formatSectionText
// ---------------------------------------------------------------------------

describe("formatSectionText", () => {
  it("formats paragraph IDs with text", () => {
    const result = formatSectionText(section1, parsedBid.paragraphs);
    expect(result).toContain("[p1] This is the introduction.");
    expect(result).toContain("[p2] More introduction content here.");
  });

  it("separates paragraphs with double newlines", () => {
    const result = formatSectionText(section1, parsedBid.paragraphs);
    expect(result).toContain("\n\n");
  });

  it("handles missing paragraph gracefully", () => {
    const sectionWithMissing: Section = {
      id: "s99",
      title: "Ghost",
      level: 1,
      word_count: 0,
      paragraph_ids: ["p999"],
    };
    const result = formatSectionText(sectionWithMissing, parsedBid.paragraphs);
    expect(result).toContain("[p999] (missing)");
  });
});

// ---------------------------------------------------------------------------
// formatDocumentMapLite
// ---------------------------------------------------------------------------

describe("formatDocumentMapLite", () => {
  it("shows only section id and title", () => {
    const result = formatDocumentMapLite(parsedBid);
    expect(result).toBe('s1: "Introduction"\ns2: "Budget"');
  });
});

// ---------------------------------------------------------------------------
// formatAnalysesSummary
// ---------------------------------------------------------------------------

describe("formatAnalysesSummary", () => {
  it("includes section id as heading", () => {
    const result = formatAnalysesSummary(sectionAnalyses);
    expect(result).toContain("## s1");
    expect(result).toContain("## s2");
  });

  it("includes relevant criteria (filters out not_relevant)", () => {
    const result = formatAnalysesSummary(sectionAnalyses);
    expect(result).toContain("c1 (directly_addresses)");
    expect(result).not.toContain("c2");
  });

  it("includes strengths joined by semicolons", () => {
    const result = formatAnalysesSummary(sectionAnalyses);
    expect(result).toContain("Strengths: Clear opening; Good structure");
  });

  it("includes weaknesses", () => {
    const result = formatAnalysesSummary(sectionAnalyses);
    expect(result).toContain("Weaknesses: Lacks evidence");
  });

  it("includes comment count", () => {
    const result = formatAnalysesSummary(sectionAnalyses);
    expect(result).toContain("Comments: 1");
    expect(result).toContain("Comments: 0");
  });

  it("omits criteria/strengths/weaknesses lines when empty", () => {
    const s2Block = formatAnalysesSummary(sectionAnalyses)
      .split("\n\n")
      .find((b) => b.includes("## s2"))!;
    expect(s2Block).not.toContain("Criteria:");
    expect(s2Block).not.toContain("Strengths:");
    expect(s2Block).not.toContain("Weaknesses:");
    expect(s2Block).toContain("Comments: 0");
  });
});

// ---------------------------------------------------------------------------
// createSkippedSectionAnalysis
// ---------------------------------------------------------------------------

describe("createSkippedSectionAnalysis", () => {
  it("returns empty analysis with correct section_id", () => {
    const result = createSkippedSectionAnalysis(section1);
    expect(result.section_id).toBe("s1");
    expect(result.inline_comments).toEqual([]);
    expect(result.criteria_relevance).toEqual([]);
    expect(result.strengths).toEqual([]);
    expect(result.weaknesses).toEqual([]);
    expect(result.questions_for_later_sections).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// MIN_SECTION_WORDS
// ---------------------------------------------------------------------------

describe("MIN_SECTION_WORDS", () => {
  it("is 50", () => {
    expect(MIN_SECTION_WORDS).toBe(50);
  });
});

// ---------------------------------------------------------------------------
// buildSectionAnalysisSystemPrompt
// ---------------------------------------------------------------------------

describe("buildSectionAnalysisSystemPrompt", () => {
  it("returns a single cache block", () => {
    const blocks = buildSectionAnalysisSystemPrompt(criteria);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe("text");
    expect(blocks[0].cache_control).toEqual({ type: "ephemeral" });
  });

  it("includes all shared components", () => {
    const text = buildSectionAnalysisSystemPrompt(criteria)[0].text;
    expect(text).toContain(SYSTEM_PERSONA);
    expect(text).toContain(SCORING_RUBRIC);
    expect(text).toContain(FEW_SHOT_COMMENTS);
    expect(text).toContain(COMMENT_CATEGORIES_DESC);
    expect(text).toContain(ANTI_HALLUCINATION);
  });

  it("includes formatted criteria", () => {
    const text = buildSectionAnalysisSystemPrompt(criteria)[0].text;
    expect(text).toContain("Value for money (Weight: 30%)");
    expect(text).toContain("Funder Criteria");
  });
});

// ---------------------------------------------------------------------------
// buildScoringSystemPrompt
// ---------------------------------------------------------------------------

describe("buildScoringSystemPrompt", () => {
  it("returns a cache block with persona and rubric", () => {
    const blocks = buildScoringSystemPrompt();
    expect(blocks).toHaveLength(1);
    expect(blocks[0].text).toContain(SYSTEM_PERSONA);
    expect(blocks[0].text).toContain(SCORING_RUBRIC);
    expect(blocks[0].cache_control).toEqual({ type: "ephemeral" });
  });
});

// ---------------------------------------------------------------------------
// buildPreFlightPrompt
// ---------------------------------------------------------------------------

describe("buildPreFlightPrompt", () => {
  it("includes system persona", () => {
    const prompt = buildPreFlightPrompt(parsedBid);
    expect(prompt).toContain(SYSTEM_PERSONA);
  });

  it("includes first 2000 chars of full_text", () => {
    const prompt = buildPreFlightPrompt(parsedBid);
    expect(prompt).toContain("This is the introduction.");
  });

  it("truncates full_text at 2000 chars", () => {
    const longBid: ParsedBid = {
      ...parsedBid,
      full_text: "A".repeat(5000),
    };
    const prompt = buildPreFlightPrompt(longBid);
    // The prompt should contain exactly 2000 A's, not 5000
    const match = prompt.match(/A+/);
    expect(match![0].length).toBe(2000);
  });

  it("includes pre-flight JSON schema", () => {
    const prompt = buildPreFlightPrompt(parsedBid);
    expect(prompt).toContain('"is_bid"');
    expect(prompt).toContain('"substantive"');
  });
});

// ---------------------------------------------------------------------------
// buildSectionAnalysisPrompt
// ---------------------------------------------------------------------------

describe("buildSectionAnalysisPrompt", () => {
  it("includes section title and id", () => {
    const prompt = buildSectionAnalysisPrompt(parsedBid, section1);
    expect(prompt).toContain('Analyse Section "Introduction"');
    expect(prompt).toContain("Section to Analyse: s1");
  });

  it("includes document map lite", () => {
    const prompt = buildSectionAnalysisPrompt(parsedBid, section1);
    expect(prompt).toContain('s1: "Introduction"');
    expect(prompt).toContain('s2: "Budget"');
  });

  it("includes section text with paragraph ids", () => {
    const prompt = buildSectionAnalysisPrompt(parsedBid, section1);
    expect(prompt).toContain("[p1] This is the introduction.");
    expect(prompt).toContain("[p2] More introduction content here.");
  });

  it("includes word count and paragraph ids in header", () => {
    const prompt = buildSectionAnalysisPrompt(parsedBid, section1);
    expect(prompt).toContain("120 words, paragraphs: p1, p2");
  });
});

// ---------------------------------------------------------------------------
// buildCrossReferencePrompt
// ---------------------------------------------------------------------------

describe("buildCrossReferencePrompt", () => {
  it("includes system persona", () => {
    const prompt = buildCrossReferencePrompt(parsedBid, sectionAnalyses, criteria);
    expect(prompt).toContain(SYSTEM_PERSONA);
  });

  it("includes criteria", () => {
    const prompt = buildCrossReferencePrompt(parsedBid, sectionAnalyses, criteria);
    expect(prompt).toContain("Value for money");
  });

  it("includes document map", () => {
    const prompt = buildCrossReferencePrompt(parsedBid, sectionAnalyses, criteria);
    expect(prompt).toContain('s1: "Introduction"');
  });

  it("includes analyses summary", () => {
    const prompt = buildCrossReferencePrompt(parsedBid, sectionAnalyses, criteria);
    expect(prompt).toContain("## s1");
    expect(prompt).toContain("Clear opening; Good structure");
  });

  it("lists all 6 finding types", () => {
    const prompt = buildCrossReferencePrompt(parsedBid, sectionAnalyses, criteria);
    expect(prompt).toContain("Contradictions");
    expect(prompt).toContain("Gaps");
    expect(prompt).toContain("Missing criteria");
    expect(prompt).toContain("Unresolved references");
    expect(prompt).toContain("Inconsistencies");
    expect(prompt).toContain("Repetition");
  });
});

// ---------------------------------------------------------------------------
// buildScoringPrompt
// ---------------------------------------------------------------------------

describe("buildScoringPrompt", () => {
  const crossRef = {
    findings: [],
    overall_coherence: "adequate",
    summary: "Coherent bid.",
  };

  it("includes criteria", () => {
    const prompt = buildScoringPrompt(parsedBid, sectionAnalyses, crossRef, criteria);
    expect(prompt).toContain("Value for money");
    expect(prompt).toContain("Impact");
  });

  it("includes document map", () => {
    const prompt = buildScoringPrompt(parsedBid, sectionAnalyses, crossRef, criteria);
    expect(prompt).toContain('s1: "Introduction"');
  });

  it("includes analyses summary", () => {
    const prompt = buildScoringPrompt(parsedBid, sectionAnalyses, crossRef, criteria);
    expect(prompt).toContain("## s1");
  });

  it("includes cross-reference as JSON", () => {
    const prompt = buildScoringPrompt(parsedBid, sectionAnalyses, crossRef, criteria);
    expect(prompt).toContain('"overall_coherence": "adequate"');
    expect(prompt).toContain("Coherent bid.");
  });

  it("includes scoring JSON schema example", () => {
    const prompt = buildScoringPrompt(parsedBid, sectionAnalyses, crossRef, criteria);
    expect(prompt).toContain('"criteria_scores"');
    expect(prompt).toContain('"overall_score"');
    expect(prompt).toContain('"submission_readiness"');
    expect(prompt).toContain('"improvement_appendix"');
  });
});
