import { describe, it, expect } from "vitest";
import { generateMarkdown, getExportFilename, type GenerateMarkdownParams } from "../markdown-export";

function makeParams(overrides?: Partial<GenerateMarkdownParams>): GenerateMarkdownParams {
  return {
    application: { id: "app-1", title: "My Application" },
    fund: { id: "fund-1", name: "Community Fund", organisation: { name: "Example Org" } },
    criteria: [
      {
        id: "c1",
        criterion: "Value for money",
        weight: "high",
        sub_questions: [{ text: "How will you ensure efficiency?", required: true }],
      },
    ],
    questions: [
      {
        id: "q1",
        question: "Describe your project",
        field_type: "text_long",
        word_count_min: 100,
        word_count_max: 500,
        guidance: "Be specific about outcomes.",
        required: true,
        section: "Project Details",
      },
    ],
    answerMap: { q1: "This is our project description." },
    optionsMap: {},
    disabledMap: {},
    questionsSetId: "qs-1",
    ...overrides,
  };
}

describe("generateMarkdown", () => {
  it("includes YAML frontmatter with correct fields", () => {
    const md = generateMarkdown(makeParams({
      exportedAt: new Date("2025-06-15T10:00:00Z"),
    }));

    expect(md).toContain("---\napplication_id: app-1");
    expect(md).toContain("questions_set_id: qs-1");
    expect(md).toContain("fund_id: fund-1");
    expect(md).toContain("exported_at: 2025-06-15T10:00:00.000Z");
  });

  it("includes fund and organisation header", () => {
    const md = generateMarkdown(makeParams());
    expect(md).toContain("**Fund:** Community Fund");
    expect(md).toContain("**Organisation:** Example Org");
  });

  it("omits organisation line when not present", () => {
    const md = generateMarkdown(makeParams({ fund: { id: "f1", name: "Fund X", organisation: null } }));
    expect(md).toContain("**Fund:** Fund X");
    expect(md).not.toContain("**Organisation:**");
  });

  it("renders criteria with weights and sub-questions", () => {
    const md = generateMarkdown(makeParams());
    expect(md).toContain("## Criteria");
    expect(md).toContain("1. **Value for money** (Weight: high)");
    expect(md).toContain("   - How will you ensure efficiency?");
  });

  it("renders text_long answer in fenced code block", () => {
    const md = generateMarkdown(makeParams());
    expect(md).toContain("<!-- question_id: q1 -->");
    expect(md).toContain("<!-- answer_start: q1 -->");
    expect(md).toContain("```\nThis is our project description.\n```");
    expect(md).toContain("<!-- answer_end: q1 -->");
  });

  it("renders section headings with HTML comments", () => {
    const md = generateMarkdown(makeParams());
    expect(md).toContain("<!-- section: Project Details -->");
    expect(md).toContain("### Project Details");
  });

  it("renders metadata blockquote with field type and word limits", () => {
    const md = generateMarkdown(makeParams());
    expect(md).toContain("> **Type:** text_long | **Word limit:** 100\u2013500");
    expect(md).toContain("> **Guidance:** Be specific about outcomes.");
  });

  it("renders radio field with (x) for selected option", () => {
    const md = generateMarkdown(makeParams({
      questions: [{
        id: "q2",
        question: "Select region",
        field_type: "radio",
        options: ["North", "South", "East"],
        required: true,
      }],
      answerMap: { q2: "South" },
      optionsMap: { q2: ["South"] },
    }));
    expect(md).toContain("( ) North");
    expect(md).toContain("(x) South");
    expect(md).toContain("( ) East");
  });

  it("renders checkbox field with [x] for selected options", () => {
    const md = generateMarkdown(makeParams({
      questions: [{
        id: "q3",
        question: "Select services",
        field_type: "checkbox",
        options: ["Training", "Mentoring", "Coaching"],
        required: false,
      }],
      answerMap: { q3: "" },
      optionsMap: { q3: ["Training", "Coaching"] },
    }));
    expect(md).toContain("[x] Training");
    expect(md).toContain("[ ] Mentoring");
    expect(md).toContain("[x] Coaching");
  });

  it("renders dropdown same as radio", () => {
    const md = generateMarkdown(makeParams({
      questions: [{
        id: "q4",
        question: "Priority level",
        field_type: "dropdown",
        options: ["Low", "Medium", "High"],
        required: true,
      }],
      answerMap: { q4: "High" },
      optionsMap: { q4: ["High"] },
    }));
    expect(md).toContain("( ) Low");
    expect(md).toContain("( ) Medium");
    expect(md).toContain("(x) High");
  });

  it("marks disabled questions with [DISABLED]", () => {
    const md = generateMarkdown(makeParams({
      disabledMap: { q1: true },
    }));
    expect(md).toContain("[DISABLED]");
  });

  it("handles empty answers", () => {
    const md = generateMarkdown(makeParams({ answerMap: {} }));
    expect(md).toContain("```\n\n```");
  });

  it("escapes triple backticks in answer text", () => {
    const md = generateMarkdown(makeParams({
      answerMap: { q1: "Here is some code: ``` example ```" },
    }));
    expect(md).toContain("\\```");
  });

  it("renders required marker", () => {
    const md = generateMarkdown(makeParams());
    expect(md).toContain("*(required)*");
  });

  it("omits required marker when question is not required", () => {
    const md = generateMarkdown(makeParams({
      questions: [{
        id: "q1",
        question: "Optional question",
        field_type: "text_short",
        required: false,
      }],
    }));
    expect(md).not.toContain("*(required)*");
  });

  it("handles multiple sections", () => {
    const md = generateMarkdown(makeParams({
      questions: [
        { id: "q1", question: "Q1", section: "Section A" },
        { id: "q2", question: "Q2", section: "Section A" },
        { id: "q3", question: "Q3", section: "Section B" },
      ],
      answerMap: { q1: "A1", q2: "A2", q3: "A3" },
    }));
    expect(md).toContain("### Section A");
    expect(md).toContain("### Section B");
    expect(md).toContain("#### 1. Q1");
    expect(md).toContain("#### 2. Q2");
    expect(md).toContain("#### 3. Q3");
  });

  it("handles no criteria", () => {
    const md = generateMarkdown(makeParams({ criteria: [] }));
    expect(md).not.toContain("## Criteria");
  });

  it("renders sub_questions as plain strings", () => {
    const md = generateMarkdown(makeParams({
      criteria: [{
        id: "c1",
        criterion: "Impact",
        sub_questions: ["How many people?", "What outcomes?"],
      }],
    }));
    expect(md).toContain("   - How many people?");
    expect(md).toContain("   - What outcomes?");
  });

  it("renders questions without sections (no section heading)", () => {
    const md = generateMarkdown(makeParams({
      questions: [
        { id: "q1", question: "Q1" },
        { id: "q2", question: "Q2" },
      ],
      answerMap: { q1: "A1", q2: "A2" },
    }));
    // No "### Section" headings (but #### question headings are fine)
    expect(md).not.toMatch(/^### /m);
    expect(md).toContain("#### 1. Q1");
    expect(md).toContain("#### 2. Q2");
  });

  it("renders word_count_max only", () => {
    const md = generateMarkdown(makeParams({
      questions: [{ id: "q1", question: "Q1", word_count_max: 300 }],
    }));
    expect(md).toContain("**Word limit:** 300");
  });

  it("renders word_count_min only", () => {
    const md = generateMarkdown(makeParams({
      questions: [{ id: "q1", question: "Q1", word_count_min: 50 }],
    }));
    expect(md).toContain("**Word limit:** 50+");
  });
});

describe("getExportFilename", () => {
  it("returns formatted filename", () => {
    expect(getExportFilename("Community Fund", "My Project", "abc-123")).toBe(
      "FunderReady - Community Fund - My Project.md"
    );
  });

  it("uses application ID prefix when no title", () => {
    expect(getExportFilename("Fund", null, "abcdefgh-1234")).toBe(
      "FunderReady - Fund - abcdefgh.md"
    );
  });

  it("sanitises invalid filename characters", () => {
    expect(getExportFilename("Fund: Special/Edition", 'Title "Quoted"', "id")).toBe(
      "FunderReady - Fund- Special-Edition - Title -Quoted-.md"
    );
  });
});
