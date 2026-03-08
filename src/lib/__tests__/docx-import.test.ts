import { describe, it, expect } from "vitest";
import { Document, Packer, Paragraph, TextRun } from "docx";
import JSZip from "jszip";
import type { GenerateMarkdownParams } from "@/lib/markdown-export";
import type { ImportQuestion } from "@/lib/markdown-import";
import { validateImportMetadata } from "@/lib/markdown-import";
import { generateDocxBuffer } from "@/lib/docx-export";

const importModule = () => import("@/lib/docx-import");

/* ------------------------------------------------------------------ */
/*  Shared helpers                                                     */
/* ------------------------------------------------------------------ */

function makeParams(overrides: Partial<GenerateMarkdownParams> = {}): GenerateMarkdownParams {
  return {
    application: { id: "app-001", title: "My Application" },
    fund: { id: "fund-001", name: "Test Fund", organisation: { name: "Test Org" } },
    criteria: [],
    questions: [
      {
        id: "q1",
        question: "Describe your project",
        word_count_max: 500,
        field_type: "text_long",
        required: true,
      },
    ],
    answerMap: { q1: "This is my project description." },
    optionsMap: {},
    disabledMap: {},
    questionsSetId: "qs-001",
    exportedAt: new Date("2025-01-01T00:00:00Z"),
    ...overrides,
  };
}

function makeImportQuestions(params: GenerateMarkdownParams): ImportQuestion[] {
  return params.questions.map((q) => ({
    id: q.id,
    question: q.question,
    field_type: q.field_type,
    options: q.options,
    word_count_max: q.word_count_max,
  }));
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe("docx-import", () => {
  describe("MAX_DOCX_IMPORT_SIZE", () => {
    it("is 10 MB", async () => {
      const { MAX_DOCX_IMPORT_SIZE } = await importModule();
      expect(MAX_DOCX_IMPORT_SIZE).toBe(10 * 1024 * 1024);
    });
  });

  describe("parseDocx – metadata", () => {
    it("parses metadata correctly from round-tripped docx", async () => {
      const { parseDocx } = await importModule();
      const params = makeParams();
      const buf = await generateDocxBuffer(params);
      const questions = makeImportQuestions(params);

      const result = await parseDocx(buf, questions);

      expect(result.ok).toBe(true);
      expect(result.metadata).toEqual({
        application_id: "app-001",
        questions_set_id: "qs-001",
        fund_id: "fund-001",
      });
    });
  });

  describe("parseDocx – text answers", () => {
    it("extracts text answer", async () => {
      const { parseDocx } = await importModule();
      const params = makeParams({
        answerMap: { q1: "My project is about helping communities." },
      });
      const buf = await generateDocxBuffer(params);
      const questions = makeImportQuestions(params);

      const result = await parseDocx(buf, questions);

      expect(result.ok).toBe(true);
      const answer = result.answers.find((a) => a.question_id === "q1");
      expect(answer).toBeDefined();
      expect(answer!.answer_text).toBe("My project is about helping communities.");
      expect(answer!.is_disabled).toBe(false);
    });

    it("handles empty text answer", async () => {
      const { parseDocx } = await importModule();
      const params = makeParams({
        answerMap: { q1: "" },
      });
      const buf = await generateDocxBuffer(params);
      const questions = makeImportQuestions(params);

      const result = await parseDocx(buf, questions);

      expect(result.ok).toBe(true);
      const answer = result.answers.find((a) => a.question_id === "q1");
      expect(answer).toBeDefined();
      expect(answer!.answer_text).toBe("");
    });
  });

  describe("parseDocx – radio/dropdown", () => {
    it("extracts radio selection", async () => {
      const { parseDocx } = await importModule();
      const params = makeParams({
        questions: [
          {
            id: "q1",
            question: "Choose your sector",
            field_type: "radio",
            options: ["Health", "Education", "Arts"],
            required: true,
          },
        ],
        answerMap: { q1: "Health" },
        optionsMap: { q1: ["Health"] },
      });
      const buf = await generateDocxBuffer(params);
      const questions = makeImportQuestions(params);

      const result = await parseDocx(buf, questions);

      expect(result.ok).toBe(true);
      const answer = result.answers.find((a) => a.question_id === "q1");
      expect(answer).toBeDefined();
      expect(answer!.selected_options).toEqual(["Health"]);
      expect(answer!.answer_text).toBe("Health");
    });
  });

  describe("parseDocx – radio_other", () => {
    it("extracts radio_other when a regular option is selected (no Other)", async () => {
      const { parseDocx } = await importModule();
      const params = makeParams({
        questions: [
          {
            id: "q1",
            question: "Choose your sector",
            field_type: "radio_other",
            options: ["Health", "Education", "Arts"],
            required: true,
          },
        ],
        answerMap: { q1: "" },
        optionsMap: { q1: ["Health"] },
      });
      const buf = await generateDocxBuffer(params);
      const questions = makeImportQuestions(params);

      const result = await parseDocx(buf, questions);

      expect(result.ok).toBe(true);
      const answer = result.answers.find((a) => a.question_id === "q1");
      expect(answer).toBeDefined();
      // "Other" should NOT be in selected_options when Other text is empty
      expect(answer!.selected_options).toEqual(["Health"]);
      expect(answer!.answer_text).toBe("Health");
    });

    it("extracts radio_other when Other is selected with text", async () => {
      const { parseDocx } = await importModule();
      const params = makeParams({
        questions: [
          {
            id: "q1",
            question: "Choose your sector",
            field_type: "radio_other",
            options: ["Health", "Education", "Arts"],
            required: true,
          },
        ],
        answerMap: { q1: "My custom sector" },
        optionsMap: { q1: [] },
      });
      const buf = await generateDocxBuffer(params);
      const questions = makeImportQuestions(params);

      const result = await parseDocx(buf, questions);

      expect(result.ok).toBe(true);
      const answer = result.answers.find((a) => a.question_id === "q1");
      expect(answer).toBeDefined();
      expect(answer!.selected_options).toEqual(["Other"]);
      expect(answer!.answer_text).toBe("My custom sector");
    });

    it("returns error when multiple non-Other options are selected in radio_other", async () => {
      const { parseDocx } = await importModule();
      // We need to craft a scenario where 2 (x) lines appear.
      // generateDocxBuffer won't do this naturally (radio_other respects selectedOptions),
      // but we can set selectedOptions to include two options.
      const params = makeParams({
        questions: [
          {
            id: "q1",
            question: "Choose your sector",
            field_type: "radio_other",
            options: ["Health", "Education", "Arts"],
            required: true,
          },
        ],
        answerMap: { q1: "" },
        optionsMap: { q1: ["Health", "Education"] },
      });
      const buf = await generateDocxBuffer(params);
      const questions = makeImportQuestions(params);

      const result = await parseDocx(buf, questions);

      // Should produce an error (multiple selections not allowed for radio)
      expect(result.ok).toBe(false);
      expect(result.errors.some((e) => e.message.includes("multiple selections"))).toBe(true);
    });
  });

  describe("parseDocx – checkbox_other", () => {
    it("extracts checkbox_other with multiple options and Other with text", async () => {
      const { parseDocx } = await importModule();
      const params = makeParams({
        questions: [
          {
            id: "q1",
            question: "Select skills",
            field_type: "checkbox_other",
            options: ["Writing", "Research", "Design"],
            required: false,
          },
        ],
        answerMap: { q1: "Custom skill" },
        optionsMap: { q1: ["Writing", "Research"] },
      });
      const buf = await generateDocxBuffer(params);
      const questions = makeImportQuestions(params);

      const result = await parseDocx(buf, questions);

      expect(result.ok).toBe(true);
      const answer = result.answers.find((a) => a.question_id === "q1");
      expect(answer).toBeDefined();
      expect(answer!.selected_options).toEqual(["Writing", "Research", "Other"]);
      expect(answer!.answer_text).toBe("Custom skill");
    });

    it("does NOT include Other in selected_options when Other line is empty in checkbox_other", async () => {
      const { parseDocx } = await importModule();
      const params = makeParams({
        questions: [
          {
            id: "q1",
            question: "Select skills",
            field_type: "checkbox_other",
            options: ["Writing", "Research", "Design"],
            required: false,
          },
        ],
        answerMap: { q1: "" },
        optionsMap: { q1: ["Writing"] },
      });
      const buf = await generateDocxBuffer(params);
      const questions = makeImportQuestions(params);

      const result = await parseDocx(buf, questions);

      expect(result.ok).toBe(true);
      const answer = result.answers.find((a) => a.question_id === "q1");
      expect(answer).toBeDefined();
      // "Other" should NOT be in selected_options since otherText is empty
      expect(answer!.selected_options).toEqual(["Writing"]);
      expect(answer!.answer_text).toBe("");
    });
  });

  describe("parseDocx – checkbox", () => {
    it("extracts checkbox selections", async () => {
      const { parseDocx } = await importModule();
      const params = makeParams({
        questions: [
          {
            id: "q1",
            question: "Select skills",
            field_type: "checkbox",
            options: ["Writing", "Research", "Design"],
            required: false,
          },
        ],
        answerMap: { q1: "Writing, Research" },
        optionsMap: { q1: ["Writing", "Research"] },
      });
      const buf = await generateDocxBuffer(params);
      const questions = makeImportQuestions(params);

      const result = await parseDocx(buf, questions);

      expect(result.ok).toBe(true);
      const answer = result.answers.find((a) => a.question_id === "q1");
      expect(answer).toBeDefined();
      expect(answer!.selected_options).toEqual(["Writing", "Research"]);
      expect(answer!.answer_text).toBe("Writing, Research");
    });
  });

  describe("parseDocx – disabled questions", () => {
    it("detects disabled questions", async () => {
      const { parseDocx } = await importModule();
      const params = makeParams({
        answerMap: { q1: "" },
        disabledMap: { q1: true },
      });
      const buf = await generateDocxBuffer(params);
      const questions = makeImportQuestions(params);

      const result = await parseDocx(buf, questions);

      expect(result.ok).toBe(true);
      const answer = result.answers.find((a) => a.question_id === "q1");
      expect(answer).toBeDefined();
      expect(answer!.is_disabled).toBe(true);
    });
  });

  describe("parseDocx – mixed types round-trip", () => {
    it("round-trips multiple questions of mixed types", async () => {
      const { parseDocx } = await importModule();
      const params = makeParams({
        questions: [
          {
            id: "q1",
            question: "Describe your project",
            field_type: "text_long",
            word_count_max: 500,
            required: true,
          },
          {
            id: "q2",
            question: "Choose your sector",
            field_type: "radio",
            options: ["Health", "Education", "Arts"],
            required: true,
          },
          {
            id: "q3",
            question: "Select skills",
            field_type: "checkbox",
            options: ["Writing", "Research", "Design"],
            required: false,
          },
          {
            id: "q4",
            question: "Legacy question",
            field_type: "text_long",
            required: true,
          },
        ],
        answerMap: {
          q1: "My project is about helping communities.",
          q2: "Health",
          q3: "Writing, Research",
          q4: "",
        },
        optionsMap: {
          q2: ["Health"],
          q3: ["Writing", "Research"],
        },
        disabledMap: { q4: true },
      });
      const buf = await generateDocxBuffer(params);
      const questions = makeImportQuestions(params);

      const result = await parseDocx(buf, questions);

      expect(result.ok).toBe(true);
      expect(result.answers).toHaveLength(4);

      const a1 = result.answers.find((a) => a.question_id === "q1")!;
      expect(a1.answer_text).toBe("My project is about helping communities.");
      expect(a1.is_disabled).toBe(false);

      const a2 = result.answers.find((a) => a.question_id === "q2")!;
      expect(a2.selected_options).toEqual(["Health"]);

      const a3 = result.answers.find((a) => a.question_id === "q3")!;
      expect(a3.selected_options).toEqual(["Writing", "Research"]);

      const a4 = result.answers.find((a) => a.question_id === "q4")!;
      expect(a4.answer_text).toBe("");
      expect(a4.is_disabled).toBe(true);
    });
  });

  describe("parseDocx – error cases", () => {
    it("errors on non-FunderReady docx (no custom XML)", async () => {
      const { parseDocx } = await importModule();
      // Create a plain docx without custom XML
      const doc = new Document({
        sections: [
          {
            children: [
              new Paragraph({
                children: [new TextRun("Hello world")],
              }),
            ],
          },
        ],
      });
      const buf = await Packer.toBuffer(doc);
      const questions: ImportQuestion[] = [
        { id: "q1", question: "Test question", field_type: "text_long" },
      ];

      const result = await parseDocx(buf, questions);

      expect(result.ok).toBe(false);
      expect(result.errors.some((e) => e.message.includes("not exported from FunderReady"))).toBe(true);
    });

    it("errors on corrupted buffer", async () => {
      const { parseDocx } = await importModule();
      const buf = Buffer.from("this is not a valid docx file");
      const questions: ImportQuestion[] = [
        { id: "q1", question: "Test question", field_type: "text_long" },
      ];

      const result = await parseDocx(buf, questions);

      expect(result.ok).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe("parseDocx – warnings", () => {
    it("warns on word count exceeding limit", async () => {
      const { parseDocx } = await importModule();
      const longText = Array(20).fill("word").join(" "); // 20 words
      const params = makeParams({
        questions: [
          {
            id: "q1",
            question: "Short answer",
            field_type: "text_long",
            word_count_max: 5,
            required: true,
          },
        ],
        answerMap: { q1: longText },
      });
      const buf = await generateDocxBuffer(params);
      const questions = makeImportQuestions(params);

      const result = await parseDocx(buf, questions);

      expect(result.ok).toBe(true);
      expect(result.warnings.some((w) => w.message.includes("exceeding limit of 5"))).toBe(true);
    });
  });

  describe("validateImportMetadata integration", () => {
    it("works with validateImportMetadata from markdown-import", async () => {
      const { parseDocx } = await importModule();
      const params = makeParams();
      const buf = await generateDocxBuffer(params);
      const questions = makeImportQuestions(params);

      const result = await parseDocx(buf, questions);

      // Matching IDs: should remain ok
      const validated = validateImportMetadata(result, "app-001", "qs-001");
      expect(validated.ok).toBe(true);

      // Mismatched IDs: should fail
      const mismatch = validateImportMetadata(result, "app-999", "qs-999");
      expect(mismatch.ok).toBe(false);
      expect(mismatch.errors.some((e) => e.message.includes("Application ID mismatch"))).toBe(true);
      expect(mismatch.errors.some((e) => e.message.includes("Questions set ID mismatch"))).toBe(true);
    });
  });
});
