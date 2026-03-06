/**
 * Docx export for FunderReady applications.
 * Uses the `docx` library to build a Word document, then JSZip to inject custom XML metadata.
 */

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  ShadingType,
  WidthType,
  BookmarkStart,
  BookmarkEnd,
  AlignmentType,
} from "docx";
import JSZip from "jszip";

import type { GenerateMarkdownParams, ExportQuestion } from "@/lib/markdown-export";
import { buildCustomXml, type DocxMetadata } from "@/lib/docx-custom-xml";

/* ------------------------------------------------------------------ */
/*  Filename helper                                                    */
/* ------------------------------------------------------------------ */

export function getDocxExportFilename(
  fundName: string,
  title: string | null | undefined,
  applicationId: string,
): string {
  const sanitise = (s: string) =>
    s.replace(/[<>:"/\\|?*]/g, "-").replace(/\s+/g, " ").trim();

  const fundPart = sanitise(fundName);
  const titlePart = title ? sanitise(title) : applicationId.slice(0, 8);

  return `FunderReady - ${fundPart} - ${titlePart}.docx`;
}

/* ------------------------------------------------------------------ */
/*  Internal helpers                                                   */
/* ------------------------------------------------------------------ */

const GREY_BG = { fill: "D9D9D9", type: ShadingType.SOLID, color: "D9D9D9" } as const;
const BLUE_BG = { fill: "DAEEF3", type: ShadingType.SOLID, color: "DAEEF3" } as const;

function textParagraph(text: string, opts?: { bold?: boolean; size?: number; alignment?: (typeof AlignmentType)[keyof typeof AlignmentType] }): Paragraph {
  return new Paragraph({
    alignment: opts?.alignment,
    children: [
      new TextRun({
        text,
        bold: opts?.bold,
        size: opts?.size,
      }),
    ],
  });
}

function singleCellTable(
  paragraphs: Paragraph[],
  shading: { fill: string; type: (typeof ShadingType)[keyof typeof ShadingType]; color: string },
): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            children: paragraphs.length > 0 ? paragraphs : [new Paragraph("")],
            shading,
            width: { size: 100, type: WidthType.PERCENTAGE },
          }),
        ],
      }),
    ],
  });
}

function buildMetadataTable(q: ExportQuestion): Table {
  const lines: Paragraph[] = [];

  const ft = q.field_type ?? "text_long";
  lines.push(textParagraph(`Type: ${ft}`, { bold: false }));

  if (q.word_count_min || q.word_count_max) {
    let limitText: string;
    if (q.word_count_min && q.word_count_max) {
      limitText = `Word limit: ${q.word_count_min}\u2013${q.word_count_max}`;
    } else if (q.word_count_max) {
      limitText = `Word limit: ${q.word_count_max}`;
    } else {
      limitText = `Word limit: ${q.word_count_min}+`;
    }
    lines.push(textParagraph(limitText));
  }

  if (q.guidance) {
    lines.push(textParagraph(`Guidance: ${q.guidance}`));
  }

  return singleCellTable(lines, GREY_BG);
}

function buildAnswerParagraphs(
  q: ExportQuestion,
  answerText: string,
  selectedOptions: string[] | undefined,
): Paragraph[] {
  const ft = q.field_type ?? "text_long";

  if (ft === "radio" || ft === "dropdown") {
    const options = q.options ?? [];
    return options.map((opt) => {
      const selected = selectedOptions?.includes(opt);
      return textParagraph(selected ? `(x) ${opt}` : `( ) ${opt}`);
    });
  }

  if (ft === "checkbox") {
    const options = q.options ?? [];
    return options.map((opt) => {
      const selected = selectedOptions?.includes(opt);
      return textParagraph(selected ? `[x] ${opt}` : `[ ] ${opt}`);
    });
  }

  // Text-based: split by newlines
  if (!answerText) return [new Paragraph("")];
  return answerText.split("\n").map((line) => textParagraph(line));
}

function buildAnswerTable(
  q: ExportQuestion,
  answerText: string,
  selectedOptions: string[] | undefined,
): Table {
  const paras = buildAnswerParagraphs(q, answerText, selectedOptions);
  return singleCellTable(paras, BLUE_BG);
}

/* ------------------------------------------------------------------ */
/*  Main export builder                                                */
/* ------------------------------------------------------------------ */

let bookmarkIdCounter = 0;

export async function generateDocxBuffer(params: GenerateMarkdownParams): Promise<Buffer> {
  const {
    application,
    fund,
    criteria,
    questions,
    answerMap,
    optionsMap,
    disabledMap,
    questionsSetId,
    exportedAt,
  } = params;

  bookmarkIdCounter = 0;
  const children: (Paragraph | Table)[] = [];

  // Title
  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun({ text: "FunderReady Application Export", bold: true })],
    }),
  );

  // Fund name + org
  children.push(textParagraph(`Fund: ${fund.name}`, { bold: true, size: 28 }));
  if (fund.organisation) {
    children.push(textParagraph(`Organisation: ${fund.organisation.name}`, { size: 24 }));
  }
  children.push(new Paragraph(""));

  // Criteria section
  if (criteria.length > 0) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun({ text: "Criteria", bold: true })],
      }),
    );

    for (let i = 0; i < criteria.length; i++) {
      const c = criteria[i];
      const weightStr = c.weight ? ` (Weight: ${c.weight})` : "";
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: `${i + 1}. `, bold: true }),
            new TextRun({ text: c.criterion, bold: true }),
            new TextRun({ text: weightStr }),
          ],
        }),
      );

      if (c.sub_questions) {
        for (const sq of c.sub_questions) {
          const text = typeof sq === "string" ? sq : sq.text;
          children.push(
            new Paragraph({
              indent: { left: 720 },
              children: [new TextRun({ text: `\u2022 ${text}` })],
            }),
          );
        }
      }
    }

    // Horizontal rule
    children.push(new Paragraph({ thematicBreak: true, children: [] }));
  }

  // Questions section
  let currentSection: string | null = null;
  let questionIndex = 0;

  for (const q of questions) {
    const section = q.section ?? null;
    if (section !== currentSection) {
      currentSection = section;
      if (currentSection) {
        children.push(
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            children: [new TextRun({ text: currentSection })],
          }),
        );
      }
    }

    questionIndex++;
    const isDisabled = disabledMap[q.id] ?? false;
    const requiredStr = q.required !== false ? " (required)" : "";
    const disabledStr = isDisabled ? " [DISABLED]" : "";

    // Question heading with bookmark
    const bmId = String(++bookmarkIdCounter);
    const bmName = `funderready_answer_${q.id}`;

    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_3,
        children: [
          new BookmarkStart({ id: bmId, name: bmName }),
          new TextRun({
            text: `${questionIndex}. ${q.question}${requiredStr}${disabledStr}`,
          }),
          new BookmarkEnd({ id: bmId }),
        ],
      }),
    );

    // Metadata table (grey)
    children.push(buildMetadataTable(q));

    // Answer table (blue)
    const answerText = answerMap[q.id] ?? "";
    const selectedOptions = optionsMap[q.id];
    children.push(buildAnswerTable(q, answerText, selectedOptions));

    children.push(new Paragraph(""));
  }

  // Build document
  const doc = new Document({
    sections: [{ children }],
  });

  // Pack to buffer
  const buf = await Packer.toBuffer(doc);

  // Inject custom XML via JSZip
  const exportedDate = exportedAt ?? new Date();
  const meta: DocxMetadata = {
    application_id: application.id,
    questions_set_id: questionsSetId,
    fund_id: fund.id,
    exported_at: exportedDate.toISOString(),
  };

  const customXmlContent = buildCustomXml(meta);
  const zip = await JSZip.loadAsync(buf);

  // Add customXml/item1.xml
  zip.file("customXml/item1.xml", customXmlContent);

  // Add customXml/_rels/item1.xml.rels
  zip.file(
    "customXml/_rels/item1.xml.rels",
    '<?xml version="1.0" encoding="UTF-8"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/customXmlProps" Target="itemProps1.xml"/>' +
      "</Relationships>",
  );

  // Add customXml/itemProps1.xml
  zip.file(
    "customXml/itemProps1.xml",
    '<?xml version="1.0" encoding="UTF-8"?>' +
      '<ds:datastoreItem xmlns:ds="http://schemas.openxmlformats.org/officeDocument/2006/customXml" ds:itemID="{FunderReady-Custom-XML}">' +
      `<ds:schemaRefs><ds:schemaRef ds:uri="https://funderready.com/docx-export/v1"/></ds:schemaRefs>` +
      "</ds:datastoreItem>",
  );

  // Update [Content_Types].xml to include our custom XML
  const contentTypesXml = await zip.file("[Content_Types].xml")!.async("text");
  const override =
    '<Override PartName="/customXml/item1.xml" ContentType="application/xml"/>' +
    '<Override PartName="/customXml/itemProps1.xml" ContentType="application/vnd.openxmlformats-officedocument.customXmlProperties+xml"/>';
  const updatedCT = contentTypesXml.replace("</Types>", override + "</Types>");
  zip.file("[Content_Types].xml", updatedCT);

  // Return the modified buffer
  const result = await zip.generateAsync({ type: "nodebuffer" });
  return result;
}
