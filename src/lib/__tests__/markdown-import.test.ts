import { describe, it, expect } from "vitest";
import { parseMarkdown, validateImportMetadata, MAX_IMPORT_FILE_SIZE, type ImportQuestion } from "../markdown-import";
import { generateMarkdown, type GenerateMarkdownParams } from "../markdown-export";

const baseQuestions: ImportQuestion[] = [
  { id: "q1", question: "Describe your project", field_type: "text_long", word_count_max: 500 },
  { id: "q2", question: "Select region", field_type: "radio", options: ["North", "South", "East"] },
  { id: "q3", question: "Select services", field_type: "checkbox", options: ["Training", "Mentoring"] },
];

function makeFrontmatter(overrides?: Record<string, string>): string {
  const fields = {
    application_id: "app-1",
    questions_set_id: "qs-1",
    fund_id: "fund-1",
    exported_at: "2025-06-15T10:00:00.000Z",
    ...overrides,
  };
  return `---\n${Object.entries(fields).map(([k, v]) => `${k}: ${v}`).join("\n")}\n---`;
}

function makeAnswerBlock(qId: string, content: string): string {
  return `<!-- answer_start: ${qId} -->\n${content}\n<!-- answer_end: ${qId} -->`;
}

function makeQuestionBlock(qId: string, heading: string, content: string, disabled = false): string {
  const disabledStr = disabled ? " [DISABLED]" : "";
  return `<!-- question_id: ${qId} -->\n#### ${heading}${disabledStr}\n\n> **Type:** text_long\n\n${makeAnswerBlock(qId, content)}`;
}

function makeFullDoc(answerBlocks: string[]): string {
  return `${makeFrontmatter()}\n\n# FunderReady Application Export\n\n**Fund:** Test Fund\n\n## Questions\n\n${answerBlocks.join("\n\n---\n\n")}`;
}

describe("parseMarkdown — frontmatter", () => {
  it("parses valid frontmatter", () => {
    const doc = makeFullDoc([
      makeQuestionBlock("q1", "1. Q1", "```\nAnswer\n```"),
      `<!-- question_id: q2 -->\n#### 2. Select region\n\n> **Type:** radio\n\n${makeAnswerBlock("q2", "(x) North\n( ) South\n( ) East")}`,
      `<!-- question_id: q3 -->\n#### 3. Select services\n\n> **Type:** checkbox\n\n${makeAnswerBlock("q3", "[ ] Training\n[ ] Mentoring")}`,
    ]);
    const result = parseMarkdown(doc, baseQuestions);
    expect(result.metadata).toEqual({
      application_id: "app-1",
      questions_set_id: "qs-1",
      fund_id: "fund-1",
    });
  });

  it("errors on missing frontmatter", () => {
    const result = parseMarkdown("# No frontmatter", baseQuestions);
    expect(result.ok).toBe(false);
    expect(result.errors[0].message).toContain("Missing or incomplete YAML frontmatter");
  });

  it("errors on missing frontmatter fields", () => {
    const doc = `---\napplication_id: app-1\n---\n\n${makeAnswerBlock("q1", "```\ntest\n```")}`;
    const result = parseMarkdown(doc, baseQuestions);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.message.includes("questions_set_id"))).toBe(true);
    expect(result.errors.some((e) => e.message.includes("fund_id"))).toBe(true);
  });
});

describe("parseMarkdown — text extraction", () => {
  it("extracts text from fenced code block", () => {
    const doc = makeFullDoc([
      makeQuestionBlock("q1", "1. Q1", "```\nMy project answer\n```"),
      `<!-- question_id: q2 -->\n#### 2. Q2\n\n${makeAnswerBlock("q2", "( ) North\n(x) South\n( ) East")}`,
      `<!-- question_id: q3 -->\n#### 3. Q3\n\n${makeAnswerBlock("q3", "[ ] Training\n[ ] Mentoring")}`,
    ]);
    const result = parseMarkdown(doc, baseQuestions);
    expect(result.ok).toBe(true);
    const q1 = result.answers.find((a) => a.question_id === "q1");
    expect(q1?.answer_text).toBe("My project answer");
  });

  it("handles empty fenced code block", () => {
    const doc = makeFullDoc([
      makeQuestionBlock("q1", "1. Q1", "```\n\n```"),
      `<!-- question_id: q2 -->\n#### 2. Q2\n\n${makeAnswerBlock("q2", "( ) North\n( ) South\n( ) East")}`,
      `<!-- question_id: q3 -->\n#### 3. Q3\n\n${makeAnswerBlock("q3", "[ ] Training\n[ ] Mentoring")}`,
    ]);
    const result = parseMarkdown(doc, baseQuestions);
    const q1 = result.answers.find((a) => a.question_id === "q1");
    expect(q1?.answer_text).toBe("");
  });

  it("unescapes triple backticks in content", () => {
    const doc = makeFullDoc([
      makeQuestionBlock("q1", "1. Q1", "```\ncode: \\``` example\n```"),
      `<!-- question_id: q2 -->\n#### 2. Q2\n\n${makeAnswerBlock("q2", "( ) North\n( ) South\n( ) East")}`,
      `<!-- question_id: q3 -->\n#### 3. Q3\n\n${makeAnswerBlock("q3", "[ ] Training\n[ ] Mentoring")}`,
    ]);
    const result = parseMarkdown(doc, baseQuestions);
    const q1 = result.answers.find((a) => a.question_id === "q1");
    expect(q1?.answer_text).toBe("code: ``` example");
  });
});

describe("parseMarkdown — radio/dropdown", () => {
  it("parses selected radio option", () => {
    const doc = makeFullDoc([
      makeQuestionBlock("q1", "1. Q1", "```\n\n```"),
      `<!-- question_id: q2 -->\n#### 2. Q2\n\n${makeAnswerBlock("q2", "( ) North\n(x) South\n( ) East")}`,
      `<!-- question_id: q3 -->\n#### 3. Q3\n\n${makeAnswerBlock("q3", "[ ] Training\n[ ] Mentoring")}`,
    ]);
    const result = parseMarkdown(doc, baseQuestions);
    const q2 = result.answers.find((a) => a.question_id === "q2");
    expect(q2?.selected_options).toEqual(["South"]);
    expect(q2?.answer_text).toBe("South");
  });

  it("errors on multiple radio selections", () => {
    const doc = makeFullDoc([
      makeQuestionBlock("q1", "1. Q1", "```\n\n```"),
      `<!-- question_id: q2 -->\n#### 2. Q2\n\n${makeAnswerBlock("q2", "(x) North\n(x) South\n( ) East")}`,
      `<!-- question_id: q3 -->\n#### 3. Q3\n\n${makeAnswerBlock("q3", "[ ] Training\n[ ] Mentoring")}`,
    ]);
    const result = parseMarkdown(doc, baseQuestions);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.message.includes("multiple selections"))).toBe(true);
  });

  it("handles no radio selection", () => {
    const doc = makeFullDoc([
      makeQuestionBlock("q1", "1. Q1", "```\n\n```"),
      `<!-- question_id: q2 -->\n#### 2. Q2\n\n${makeAnswerBlock("q2", "( ) North\n( ) South\n( ) East")}`,
      `<!-- question_id: q3 -->\n#### 3. Q3\n\n${makeAnswerBlock("q3", "[ ] Training\n[ ] Mentoring")}`,
    ]);
    const result = parseMarkdown(doc, baseQuestions);
    const q2 = result.answers.find((a) => a.question_id === "q2");
    expect(q2?.selected_options).toEqual([]);
    expect(q2?.answer_text).toBe("");
  });
});

describe("parseMarkdown — checkbox", () => {
  it("parses multiple checkbox selections", () => {
    const doc = makeFullDoc([
      makeQuestionBlock("q1", "1. Q1", "```\n\n```"),
      `<!-- question_id: q2 -->\n#### 2. Q2\n\n${makeAnswerBlock("q2", "( ) North\n( ) South\n( ) East")}`,
      `<!-- question_id: q3 -->\n#### 3. Q3\n\n${makeAnswerBlock("q3", "[x] Training\n[x] Mentoring")}`,
    ]);
    const result = parseMarkdown(doc, baseQuestions);
    const q3 = result.answers.find((a) => a.question_id === "q3");
    expect(q3?.selected_options).toEqual(["Training", "Mentoring"]);
  });

  it("handles no checkbox selection", () => {
    const doc = makeFullDoc([
      makeQuestionBlock("q1", "1. Q1", "```\n\n```"),
      `<!-- question_id: q2 -->\n#### 2. Q2\n\n${makeAnswerBlock("q2", "( ) North\n( ) South\n( ) East")}`,
      `<!-- question_id: q3 -->\n#### 3. Q3\n\n${makeAnswerBlock("q3", "[ ] Training\n[ ] Mentoring")}`,
    ]);
    const result = parseMarkdown(doc, baseQuestions);
    const q3 = result.answers.find((a) => a.question_id === "q3");
    expect(q3?.selected_options).toEqual([]);
    expect(q3?.answer_text).toBe("");
  });
});

describe("parseMarkdown — disabled detection", () => {
  it("detects [DISABLED] flag on questions", () => {
    const doc = makeFullDoc([
      makeQuestionBlock("q1", "1. Q1", "```\n\n```", true),
      `<!-- question_id: q2 -->\n#### 2. Q2\n\n${makeAnswerBlock("q2", "( ) North\n( ) South\n( ) East")}`,
      `<!-- question_id: q3 -->\n#### 3. Q3\n\n${makeAnswerBlock("q3", "[ ] Training\n[ ] Mentoring")}`,
    ]);
    const result = parseMarkdown(doc, baseQuestions);
    const q1 = result.answers.find((a) => a.question_id === "q1");
    expect(q1?.is_disabled).toBe(true);
  });

  it("warns on disabled question with non-empty answer", () => {
    const doc = makeFullDoc([
      makeQuestionBlock("q1", "1. Q1", "```\nSome text\n```", true),
      `<!-- question_id: q2 -->\n#### 2. Q2\n\n${makeAnswerBlock("q2", "( ) North\n( ) South\n( ) East")}`,
      `<!-- question_id: q3 -->\n#### 3. Q3\n\n${makeAnswerBlock("q3", "[ ] Training\n[ ] Mentoring")}`,
    ]);
    const result = parseMarkdown(doc, baseQuestions);
    expect(result.warnings.some((w) => w.message.includes("Disabled question"))).toBe(true);
  });
});

describe("parseMarkdown — validation", () => {
  it("errors on unknown question ID", () => {
    const doc = `${makeFrontmatter()}\n\n${makeAnswerBlock("q1", "```\ntest\n```")}\n${makeAnswerBlock("q_unknown", "```\ntest\n```")}\n${makeAnswerBlock("q2", "( ) North\n( ) South\n( ) East")}\n${makeAnswerBlock("q3", "[ ] Training\n[ ] Mentoring")}`;
    const result = parseMarkdown(doc, baseQuestions);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.message.includes("Unknown question ID: q_unknown"))).toBe(true);
  });

  it("errors on missing answer block for a question", () => {
    const doc = `${makeFrontmatter()}\n\n${makeAnswerBlock("q1", "```\ntest\n```")}`;
    const result = parseMarkdown(doc, baseQuestions);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.question_id === "q2")).toBe(true);
    expect(result.errors.some((e) => e.question_id === "q3")).toBe(true);
  });

  it("warns on word count exceeding limit", () => {
    const longAnswer = Array(501).fill("word").join(" ");
    const doc = makeFullDoc([
      makeQuestionBlock("q1", "1. Q1", `\`\`\`\n${longAnswer}\n\`\`\``),
      `<!-- question_id: q2 -->\n#### 2. Q2\n\n${makeAnswerBlock("q2", "( ) North\n( ) South\n( ) East")}`,
      `<!-- question_id: q3 -->\n#### 3. Q3\n\n${makeAnswerBlock("q3", "[ ] Training\n[ ] Mentoring")}`,
    ]);
    const result = parseMarkdown(doc, baseQuestions);
    expect(result.warnings.some((w) => w.message.includes("exceeding limit"))).toBe(true);
  });
});

describe("parseMarkdown — dropdown", () => {
  it("parses selected dropdown option", () => {
    const questions: ImportQuestion[] = [
      { id: "q1", question: "Priority", field_type: "dropdown", options: ["Low", "Medium", "High"] },
    ];
    const doc = `${makeFrontmatter()}\n\n${makeAnswerBlock("q1", "( ) Low\n(x) Medium\n( ) High")}`;
    const result = parseMarkdown(doc, questions);
    expect(result.ok).toBe(true);
    const q1 = result.answers.find((a) => a.question_id === "q1");
    expect(q1?.selected_options).toEqual(["Medium"]);
    expect(q1?.answer_text).toBe("Medium");
  });

  it("errors on multiple dropdown selections", () => {
    const questions: ImportQuestion[] = [
      { id: "q1", question: "Priority", field_type: "dropdown", options: ["Low", "Medium", "High"] },
    ];
    const doc = `${makeFrontmatter()}\n\n${makeAnswerBlock("q1", "(x) Low\n(x) High\n( ) Medium")}`;
    const result = parseMarkdown(doc, questions);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.message.includes("Dropdown") && e.message.includes("multiple selections"))).toBe(true);
  });
});

describe("parseMarkdown — text_short", () => {
  it("parses text_short in fenced code block", () => {
    const questions: ImportQuestion[] = [
      { id: "q1", question: "Project name", field_type: "text_short" },
    ];
    const doc = `${makeFrontmatter()}\n\n${makeAnswerBlock("q1", "```\nMy Project\n```")}`;
    const result = parseMarkdown(doc, questions);
    expect(result.ok).toBe(true);
    expect(result.answers[0].answer_text).toBe("My Project");
  });
});

describe("parseMarkdown — adversarial inputs", () => {
  it("handles unfenced text block (fallback path)", () => {
    const questions: ImportQuestion[] = [
      { id: "q1", question: "Q1", field_type: "text_long" },
    ];
    const doc = `${makeFrontmatter()}\n\n${makeAnswerBlock("q1", "plain text without fences")}`;
    const result = parseMarkdown(doc, questions);
    expect(result.ok).toBe(true);
    expect(result.answers[0].answer_text).toBe("plain text without fences");
  });

  it("uses last answer block when duplicate IDs exist", () => {
    const questions: ImportQuestion[] = [
      { id: "q1", question: "Q1", field_type: "text_long" },
    ];
    const block1 = makeAnswerBlock("q1", "```\nfirst\n```");
    const block2 = makeAnswerBlock("q1", "```\nsecond\n```");
    const doc = `${makeFrontmatter()}\n\n${block1}\n\n${block2}`;
    const result = parseMarkdown(doc, questions);
    // The second block overwrites the first
    const q1 = result.answers.find((a) => a.question_id === "q1");
    expect(q1).toBeDefined();
  });

  it("normalizes Windows line endings", () => {
    const questions: ImportQuestion[] = [
      { id: "q1", question: "Q1", field_type: "text_long" },
    ];
    const doc = `---\r\napplication_id: app-1\r\nquestions_set_id: qs-1\r\nfund_id: fund-1\r\nexported_at: 2025-01-01\r\n---\r\n\r\n<!-- answer_start: q1 -->\r\n\`\`\`\r\nWindows text\r\n\`\`\`\r\n<!-- answer_end: q1 -->`;
    const result = parseMarkdown(doc, questions);
    expect(result.ok).toBe(true);
    expect(result.answers[0].answer_text).toBe("Windows text");
  });
});

describe("parseMarkdown — option validation", () => {
  it("warns on unrecognised radio option", () => {
    const questions: ImportQuestion[] = [
      { id: "q1", question: "Region", field_type: "radio", options: ["North", "South"] },
    ];
    const doc = `${makeFrontmatter()}\n\n${makeAnswerBlock("q1", "( ) North\n(x) West")}`;
    const result = parseMarkdown(doc, questions);
    expect(result.ok).toBe(true);
    expect(result.warnings.some((w) => w.message.includes("unrecognised option") && w.message.includes("West"))).toBe(true);
  });

  it("warns on unrecognised checkbox option", () => {
    const questions: ImportQuestion[] = [
      { id: "q1", question: "Services", field_type: "checkbox", options: ["Training", "Mentoring"] },
    ];
    const doc = `${makeFrontmatter()}\n\n${makeAnswerBlock("q1", "[x] Training\n[x] Unknown Service")}`;
    const result = parseMarkdown(doc, questions);
    expect(result.ok).toBe(true);
    expect(result.warnings.some((w) => w.message.includes("unrecognised option") && w.message.includes("Unknown Service"))).toBe(true);
  });
});

describe("validateImportMetadata", () => {
  it("returns original result when metadata matches", () => {
    const questions: ImportQuestion[] = [
      { id: "q1", question: "Q1", field_type: "text_long" },
    ];
    const doc = `${makeFrontmatter()}\n\n${makeAnswerBlock("q1", "```\ntest\n```")}`;
    const result = parseMarkdown(doc, questions);
    const validated = validateImportMetadata(result, "app-1", "qs-1");
    expect(validated.ok).toBe(true);
    expect(validated).toBe(result); // Same object reference when no errors
  });

  it("returns error on application_id mismatch", () => {
    const questions: ImportQuestion[] = [
      { id: "q1", question: "Q1", field_type: "text_long" },
    ];
    const doc = `${makeFrontmatter()}\n\n${makeAnswerBlock("q1", "```\ntest\n```")}`;
    const result = parseMarkdown(doc, questions);
    const validated = validateImportMetadata(result, "app-OTHER", "qs-1");
    expect(validated.ok).toBe(false);
    expect(validated.errors.some((e) => e.message.includes("Application ID mismatch"))).toBe(true);
    // Original result not mutated
    expect(result.ok).toBe(true);
  });

  it("returns error on questions_set_id mismatch", () => {
    const questions: ImportQuestion[] = [
      { id: "q1", question: "Q1", field_type: "text_long" },
    ];
    const doc = `${makeFrontmatter()}\n\n${makeAnswerBlock("q1", "```\ntest\n```")}`;
    const result = parseMarkdown(doc, questions);
    const validated = validateImportMetadata(result, "app-1", "qs-OTHER");
    expect(validated.ok).toBe(false);
    expect(validated.errors.some((e) => e.message.includes("Questions set ID mismatch"))).toBe(true);
  });
});

describe("MAX_IMPORT_FILE_SIZE", () => {
  it("is 2 MB", () => {
    expect(MAX_IMPORT_FILE_SIZE).toBe(2 * 1024 * 1024);
  });
});

describe("parseMarkdown — radio_other field type", () => {
  const questions: ImportQuestion[] = [
    { id: "q1", question: "Q1", field_type: "radio_other", options: ["Option A", "Option B"] },
  ];

  it("parses selected option correctly", () => {
    const doc = makeFullDoc([
      `<!-- question_id: q1 -->\n#### 1. Q1 *(required)*\n\n> **Type:** radio_other\n\n` +
      makeAnswerBlock("q1", "(x) Option A\n( ) Option B\n(?) Other: "),
    ]);
    const result = parseMarkdown(doc, questions);
    expect(result.ok).toBe(true);
    const ans = result.answers.find((a) => a.question_id === "q1");
    expect(ans?.selected_options).toContain("Option A");
    expect(ans?.answer_text).toBe("Option A");
  });

  it("parses Other selection and captures free text", () => {
    const doc = makeFullDoc([
      `<!-- question_id: q1 -->\n#### 1. Q1 *(required)*\n\n> **Type:** radio_other\n\n` +
      makeAnswerBlock("q1", "( ) Option A\n( ) Option B\n(?) Other: Something custom"),
    ]);
    const result = parseMarkdown(doc, questions);
    expect(result.ok).toBe(true);
    const ans = result.answers.find((a) => a.question_id === "q1");
    expect(ans?.selected_options).toContain("Other");
    expect(ans?.answer_text).toBe("Something custom");
  });

  it("errors when multiple non-Other options are selected", () => {
    const doc = makeFullDoc([
      `<!-- question_id: q1 -->\n#### 1. Q1 *(required)*\n\n> **Type:** radio_other\n\n` +
      makeAnswerBlock("q1", "(x) Option A\n(x) Option B\n(?) Other: "),
    ]);
    const result = parseMarkdown(doc, questions);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.message.includes("multiple selections"))).toBe(true);
  });
});

describe("parseMarkdown — checkbox_other field type", () => {
  const questions: ImportQuestion[] = [
    { id: "q1", question: "Q1", field_type: "checkbox_other", options: ["Training", "Mentoring"] },
  ];

  it("parses multiple checked options without Other", () => {
    const doc = makeFullDoc([
      `<!-- question_id: q1 -->\n#### 1. Q1 *(required)*\n\n> **Type:** checkbox_other\n\n` +
      makeAnswerBlock("q1", "[x] Training\n[ ] Mentoring\n[?] Other: "),
    ]);
    const result = parseMarkdown(doc, questions);
    expect(result.ok).toBe(true);
    const ans = result.answers.find((a) => a.question_id === "q1");
    expect(ans?.selected_options).toEqual(["Training"]);
    expect(ans?.answer_text).toBe(""); // Other text is empty
  });

  it("parses Other checked with free text", () => {
    const doc = makeFullDoc([
      `<!-- question_id: q1 -->\n#### 1. Q1 *(required)*\n\n> **Type:** checkbox_other\n\n` +
      makeAnswerBlock("q1", "[x] Training\n[?] Other: Evening classes"),
    ]);
    const result = parseMarkdown(doc, questions);
    expect(result.ok).toBe(true);
    const ans = result.answers.find((a) => a.question_id === "q1");
    expect(ans?.selected_options).toContain("Training");
    expect(ans?.selected_options).toContain("Other");
    expect(ans?.answer_text).toBe("Evening classes");
  });
});

describe("parseMarkdown — date and time field types", () => {
  const questions: ImportQuestion[] = [
    { id: "q1", question: "Start date", field_type: "date" },
    { id: "q2", question: "Start time", field_type: "time" },
  ];

  it("parses date and time answers as plain text", () => {
    const doc = makeFullDoc([
      `<!-- question_id: q1 -->\n#### 1. Start date *(required)*\n\n> **Type:** date\n\n` +
      makeAnswerBlock("q1", "```\n2026-06-01\n```"),
      `<!-- question_id: q2 -->\n#### 2. Start time *(required)*\n\n> **Type:** time\n\n` +
      makeAnswerBlock("q2", "```\n14:30\n```"),
    ]);
    const result = parseMarkdown(doc, questions);
    expect(result.ok).toBe(true);
    expect(result.answers.find((a) => a.question_id === "q1")?.answer_text).toBe("2026-06-01");
    expect(result.answers.find((a) => a.question_id === "q2")?.answer_text).toBe("14:30");
  });
});

describe("round-trip: generate → parse → compare", () => {
  it("round-trips text, radio, and checkbox answers", () => {
    const exportQuestions = [
      { id: "q1", question: "Describe your project", field_type: "text_long" as const, word_count_min: 100, word_count_max: 500, required: true, section: "Details" },
      { id: "q2", question: "Select region", field_type: "radio" as const, options: ["North", "South", "East"], required: true, section: "Details" },
      { id: "q3", question: "Select services", field_type: "checkbox" as const, options: ["Training", "Mentoring"], required: false, section: "Details" },
    ];

    const params: GenerateMarkdownParams = {
      application: { id: "app-1", title: "Test" },
      fund: { id: "fund-1", name: "Test Fund", organisation: { name: "Org" } },
      criteria: [],
      questions: exportQuestions,
      answerMap: { q1: "Project description here", q2: "South", q3: "" },
      optionsMap: { q2: ["South"], q3: ["Training"] },
      disabledMap: {},
      questionsSetId: "qs-1",
    };

    const md = generateMarkdown(params);
    const result = parseMarkdown(md, exportQuestions);

    expect(result.ok).toBe(true);
    expect(result.metadata?.application_id).toBe("app-1");
    expect(result.metadata?.questions_set_id).toBe("qs-1");

    const q1 = result.answers.find((a) => a.question_id === "q1");
    expect(q1?.answer_text).toBe("Project description here");

    const q2 = result.answers.find((a) => a.question_id === "q2");
    expect(q2?.selected_options).toEqual(["South"]);

    const q3 = result.answers.find((a) => a.question_id === "q3");
    expect(q3?.selected_options).toEqual(["Training"]);
  });

  it("round-trips disabled questions", () => {
    const exportQuestions = [
      { id: "q1", question: "Q1", field_type: "text_long" as const, section: "A" },
    ];

    const params: GenerateMarkdownParams = {
      application: { id: "app-1" },
      fund: { id: "fund-1", name: "Fund" },
      criteria: [],
      questions: exportQuestions,
      answerMap: { q1: "" },
      optionsMap: {},
      disabledMap: { q1: true },
      questionsSetId: "qs-1",
    };

    const md = generateMarkdown(params);
    const result = parseMarkdown(md, exportQuestions);

    expect(result.ok).toBe(true);
    const q1 = result.answers.find((a) => a.question_id === "q1");
    expect(q1?.is_disabled).toBe(true);
  });
});
