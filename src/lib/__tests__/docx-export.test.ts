import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import mammoth from "mammoth";
import type { GenerateMarkdownParams } from "@/lib/markdown-export";
import { FUNDERREADY_XML_NAMESPACE, parseCustomXml } from "@/lib/docx-custom-xml";

// Lazy import to allow writing the module after the test file
const importModule = () => import("@/lib/docx-export");

function makeParams(overrides: Partial<GenerateMarkdownParams> = {}): GenerateMarkdownParams {
  const defaults: GenerateMarkdownParams = {
    application: { id: "app-001", title: "My Application" },
    fund: { id: "fund-001", name: "Test Fund", organisation: { name: "Test Org" } },
    criteria: [
      {
        id: "c1",
        criterion: "Value for Money",
        weight: "30%",
        sub_questions: ["How will you ensure cost-efficiency?"],
      },
      {
        id: "c2",
        criterion: "Impact",
      },
    ],
    questions: [
      {
        id: "q1",
        question: "Describe your project",
        word_count_min: 100,
        word_count_max: 500,
        guidance: "Be specific",
        field_type: "text_long",
        required: true,
        section: "Overview",
      },
      {
        id: "q2",
        question: "Select your region",
        field_type: "radio",
        options: ["North", "South", "East"],
        required: true,
        section: "Overview",
      },
      {
        id: "q3",
        question: "Select services",
        field_type: "checkbox",
        options: ["Training", "Mentoring", "Funding"],
        required: false,
        section: "Details",
      },
      {
        id: "q4",
        question: "Choose category",
        field_type: "dropdown",
        options: ["A", "B", "C"],
        section: "Details",
      },
    ],
    answerMap: {
      q1: "This is our project description.\nIt spans multiple lines.",
      q2: "South",
      q3: "Training,Funding",
      q4: "B",
    },
    optionsMap: {
      q2: ["South"],
      q3: ["Training", "Funding"],
      q4: ["B"],
    },
    disabledMap: {
      q4: true,
    },
    questionsSetId: "qs-001",
    exportedAt: new Date("2025-06-15T12:00:00Z"),
  };
  return { ...defaults, ...overrides };
}

describe("generateDocxBuffer", () => {
  it("produces a valid docx buffer that can be unzipped", async () => {
    const { generateDocxBuffer } = await importModule();
    const buf = await generateDocxBuffer(makeParams());
    const zip = await JSZip.loadAsync(buf);
    expect(zip.file("word/document.xml")).toBeTruthy();
  });

  it("embeds custom XML with correct metadata", async () => {
    const { generateDocxBuffer } = await importModule();
    const params = makeParams();
    const buf = await generateDocxBuffer(params);
    const zip = await JSZip.loadAsync(buf);

    // Find custom XML file with our namespace
    let foundXml: string | null = null;
    for (const [path, file] of Object.entries(zip.files)) {
      if (path.startsWith("customXml/") && path.endsWith(".xml") && !path.endsWith(".rels")) {
        const content = await file.async("text");
        if (content.includes(FUNDERREADY_XML_NAMESPACE)) {
          foundXml = content;
          break;
        }
      }
    }

    expect(foundXml).toBeTruthy();
    const meta = parseCustomXml(foundXml!);
    expect(meta).not.toBeNull();
    expect(meta!.application_id).toBe("app-001");
    expect(meta!.questions_set_id).toBe("qs-001");
    expect(meta!.fund_id).toBe("fund-001");
    expect(meta!.exported_at).toBe("2025-06-15T12:00:00.000Z");
  });

  it("extracted text includes fund name and organisation", async () => {
    const { generateDocxBuffer } = await importModule();
    const buf = await generateDocxBuffer(makeParams());
    const result = await mammoth.extractRawText({ buffer: buf });
    expect(result.value).toContain("Test Fund");
    expect(result.value).toContain("Test Org");
  });

  it("extracted text includes criteria text", async () => {
    const { generateDocxBuffer } = await importModule();
    const buf = await generateDocxBuffer(makeParams());
    const result = await mammoth.extractRawText({ buffer: buf });
    expect(result.value).toContain("Value for Money");
    expect(result.value).toContain("Impact");
  });

  it("extracted text includes question text and answer text", async () => {
    const { generateDocxBuffer } = await importModule();
    const buf = await generateDocxBuffer(makeParams());
    const result = await mammoth.extractRawText({ buffer: buf });
    expect(result.value).toContain("Describe your project");
    expect(result.value).toContain("This is our project description.");
  });

  it("radio options rendered with (x) / ( ) markers", async () => {
    const { generateDocxBuffer } = await importModule();
    const buf = await generateDocxBuffer(makeParams());
    const result = await mammoth.extractRawText({ buffer: buf });
    expect(result.value).toContain("(x) South");
    expect(result.value).toContain("( ) North");
    expect(result.value).toContain("( ) East");
  });

  it("checkbox options rendered with [x] / [ ] markers", async () => {
    const { generateDocxBuffer } = await importModule();
    const buf = await generateDocxBuffer(makeParams());
    const result = await mammoth.extractRawText({ buffer: buf });
    expect(result.value).toContain("[x] Training");
    expect(result.value).toContain("[x] Funding");
    expect(result.value).toContain("[ ] Mentoring");
  });

  it("disabled questions show [DISABLED]", async () => {
    const { generateDocxBuffer } = await importModule();
    const buf = await generateDocxBuffer(makeParams());
    const result = await mammoth.extractRawText({ buffer: buf });
    expect(result.value).toContain("[DISABLED]");
  });

  it("handles empty answers without crashing", async () => {
    const { generateDocxBuffer } = await importModule();
    const params = makeParams({
      answerMap: {},
      optionsMap: {},
    });
    const buf = await generateDocxBuffer(params);
    expect(buf.length).toBeGreaterThan(0);
    const result = await mammoth.extractRawText({ buffer: buf });
    expect(result.value).toContain("Describe your project");
  });

  it("handles no criteria (no Criteria heading)", async () => {
    const { generateDocxBuffer } = await importModule();
    const params = makeParams({ criteria: [] });
    const buf = await generateDocxBuffer(params);
    const result = await mammoth.extractRawText({ buffer: buf });
    expect(result.value).not.toContain("Criteria");
    expect(result.value).toContain("Describe your project");
  });

  it("includes section headings", async () => {
    const { generateDocxBuffer } = await importModule();
    const buf = await generateDocxBuffer(makeParams());
    const result = await mammoth.extractRawText({ buffer: buf });
    expect(result.value).toContain("Overview");
    expect(result.value).toContain("Details");
  });
});

describe("getDocxExportFilename", () => {
  it("returns .docx extension", async () => {
    const { getDocxExportFilename } = await importModule();
    const name = getDocxExportFilename("My Fund", "My App", "abc-123");
    expect(name).toBe("FunderReady - My Fund - My App.docx");
  });

  it("sanitises special characters", async () => {
    const { getDocxExportFilename } = await importModule();
    const name = getDocxExportFilename("Fund: <Test>", null, "abcdefgh-1234");
    expect(name).toBe("FunderReady - Fund- -Test- - abcdefgh.docx");
  });
});
