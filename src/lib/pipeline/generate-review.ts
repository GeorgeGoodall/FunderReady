/**
 * Review document generator — produces .docx with scorecard, comments, appendix.
 * Ported from prototypes/end-to-end/generate-review.js
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
  WidthType,
  ShadingType,
  AlignmentType,
  PageBreak,
  CommentRangeStart,
  CommentRangeEnd,
  CommentReference,
} from "docx";
import AdmZip from "adm-zip";
import type { ParsedBid } from "./parse-bid";
import type { SectionAnalysis, Scoring, ImprovementAppendixItem } from "./schemas";

// ---------------------------------------------------------------------------
// Colour definitions
// ---------------------------------------------------------------------------

const COLOURS: Record<string, { fill: string; text: string }> = {
  Strong: { fill: "00B050", text: "FFFFFF" },
  Adequate: { fill: "FFC000", text: "000000" },
  Weak: { fill: "FF0000", text: "FFFFFF" },
  Missing: { fill: "808080", text: "FFFFFF" },
};

// ---------------------------------------------------------------------------
// Helper: create a table cell
// ---------------------------------------------------------------------------

interface CellOptions {
  bold?: boolean;
  shading?: string;
  fontColor?: string;
  width?: { size: number; type: (typeof WidthType)[keyof typeof WidthType] };
  alignment?: (typeof AlignmentType)[keyof typeof AlignmentType];
  fontSize?: number;
}

function createCell(text: string, options: CellOptions = {}): TableCell {
  const {
    bold = false,
    shading,
    fontColor = "000000",
    width,
    alignment = AlignmentType.LEFT,
    fontSize = 20,
  } = options;

  return new TableCell({
    children: [
      new Paragraph({
        children: [new TextRun({ text, bold, size: fontSize, color: fontColor })],
        alignment,
      }),
    ],
    ...(shading ? { shading: { fill: shading, type: ShadingType.CLEAR } } : {}),
    ...(width ? { width } : {}),
  });
}

// ---------------------------------------------------------------------------
// Section 1: Scorecard page
// ---------------------------------------------------------------------------

function buildScorecardPage(scoring: Scoring, bidName: string): Paragraph[] {
  const children: Paragraph[] = [];

  // Title
  children.push(
    new Paragraph({
      children: [
        new TextRun({ text: "FunderReady Summary Scorecard", bold: true, size: 36, color: "1F3864" }),
      ],
      heading: HeadingLevel.HEADING_1,
      alignment: AlignmentType.CENTER,
      spacing: { after: 100 },
    })
  );

  // Subtitle
  children.push(
    new Paragraph({
      children: [new TextRun({ text: bidName, size: 22, color: "666666", italics: true })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 100 },
    })
  );

  // Date
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: `Reviewed: ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}`,
          size: 20,
          color: "999999",
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 300 },
    })
  );

  // Overall score
  const score = scoring.overall_score || 0;
  const scoreColour = score >= 80 ? "00B050" : score >= 60 ? "FFC000" : "FF0000";
  children.push(
    new Paragraph({
      children: [
        new TextRun({ text: "Overall Score: ", bold: true, size: 28 }),
        new TextRun({ text: `${score}/100`, bold: true, size: 36, color: scoreColour }),
        new TextRun({ text: ` — ${scoring.overall_descriptor || ""}`, bold: true, size: 28, color: "333333" }),
      ],
      spacing: { after: 300 },
    })
  );

  // Criteria alignment heading
  children.push(
    new Paragraph({
      children: [new TextRun({ text: "Criteria Alignment", bold: true, size: 24, color: "1F3864" })],
      spacing: { before: 200, after: 120 },
    })
  );

  // Criteria table with explicit column widths (fixes Google Docs rendering)
  if (scoring.criteria_scores && scoring.criteria_scores.length > 0) {
    const headerRow = new TableRow({
      children: [
        createCell("Criterion", {
          bold: true,
          shading: "1F3864",
          fontColor: "FFFFFF",
          width: { size: 25, type: WidthType.PERCENTAGE },
        }),
        createCell("Rating", {
          bold: true,
          shading: "1F3864",
          fontColor: "FFFFFF",
          alignment: AlignmentType.CENTER,
          width: { size: 15, type: WidthType.PERCENTAGE },
        }),
        createCell("Summary", {
          bold: true,
          shading: "1F3864",
          fontColor: "FFFFFF",
          width: { size: 60, type: WidthType.PERCENTAGE },
        }),
      ],
    });

    const dataRows = scoring.criteria_scores.map((cs) => {
      const colour = COLOURS[cs.score] || COLOURS.Missing;
      return new TableRow({
        children: [
          createCell(cs.criterion || cs.criterion_id, { bold: true }),
          createCell(cs.score, {
            bold: true,
            shading: colour.fill,
            fontColor: colour.text,
            alignment: AlignmentType.CENTER,
          }),
          createCell(cs.summary || "", { fontSize: 18 }),
        ],
      });
    });

    children.push(
      new Table({
        rows: [headerRow, ...dataRows],
        width: { size: 100, type: WidthType.PERCENTAGE },
      }) as unknown as Paragraph
    );
  }

  // Strengths
  if (scoring.top_strengths && scoring.top_strengths.length > 0) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: "Top Strengths", bold: true, size: 24, color: "00B050" })],
        spacing: { before: 300, after: 120 },
      })
    );
    for (const s of scoring.top_strengths) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: s, size: 20 })],
          bullet: { level: 0 },
          spacing: { after: 60 },
        })
      );
    }
  }

  // Improvements
  if (scoring.top_improvements && scoring.top_improvements.length > 0) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: "Top Areas for Improvement", bold: true, size: 24, color: "FF0000" }),
        ],
        spacing: { before: 300, after: 120 },
      })
    );
    for (const imp of scoring.top_improvements) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: imp, size: 20 })],
          bullet: { level: 0 },
          spacing: { after: 60 },
        })
      );
    }
  }

  // Submission readiness
  if (scoring.submission_readiness) {
    const readyColour = scoring.submission_readiness === "Ready to submit" ? "00B050" : "FF0000";
    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: "Submission Readiness: ", bold: true, size: 24 }),
          new TextRun({ text: scoring.submission_readiness, bold: true, size: 24, color: readyColour }),
        ],
        spacing: { before: 300, after: 200 },
      })
    );
  }

  // Footer
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: "This scorecard was generated by FunderReady. See inline comments and appendix for detailed feedback.",
          size: 18,
          color: "999999",
          italics: true,
        }),
      ],
      spacing: { before: 200 },
    })
  );

  return children;
}

// ---------------------------------------------------------------------------
// Section 2: Annotated bid text with comments
// ---------------------------------------------------------------------------

interface CommentOption {
  id: number;
  author: string;
  date: Date;
  children: Paragraph[];
}

function buildAnnotatedBid(
  parsedBid: ParsedBid,
  sectionAnalyses: SectionAnalysis[]
): { children: Paragraph[]; commentOptions: CommentOption[] } {
  const children: Paragraph[] = [];
  const commentOptions: CommentOption[] = [];
  let commentId = 0;

  // Build lookup: paragraph_id → comments
  const commentsByParagraph: Record<string, SectionAnalysis["inline_comments"]> = {};
  for (const sa of sectionAnalyses) {
    for (const comment of sa.inline_comments || []) {
      const pid = comment.paragraph_id;
      if (!commentsByParagraph[pid]) commentsByParagraph[pid] = [];
      commentsByParagraph[pid].push(comment);
    }
  }

  // Page break
  children.push(new Paragraph({ children: [new PageBreak()] }));

  // Title
  children.push(
    new Paragraph({
      children: [
        new TextRun({ text: "Annotated Bid Review", bold: true, size: 32, color: "1F3864" }),
      ],
      heading: HeadingLevel.HEADING_1,
      spacing: { after: 200 },
    })
  );

  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: "Your bid text is reproduced below with reviewer comments attached to specific passages. Open the Review pane in Word to see all comments.",
          size: 20,
          color: "666666",
          italics: true,
        }),
      ],
      spacing: { after: 300 },
    })
  );

  // Render each section
  for (const section of parsedBid.sections) {
    children.push(
      new Paragraph({
        text: section.title,
        heading: section.level === 1 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3,
        spacing: { before: 300, after: 120 },
      })
    );

    for (const pid of section.paragraph_ids) {
      const para = parsedBid.paragraphs[pid];
      if (!para) continue;

      const comments = commentsByParagraph[pid] || [];

      if (comments.length === 0) {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: para.text, size: 20 })],
            spacing: { after: 120 },
          })
        );
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const paraChildren: any[] = [];

        for (const comment of comments) {
          const cId = commentId++;
          commentOptions.push({
            id: cId,
            author: "FunderReady AI",
            date: new Date(),
            children: [
              new Paragraph({
                children: [
                  new TextRun({ text: `[${comment.category}] `, bold: true }),
                  new TextRun({ text: comment.issue }),
                ],
              }),
              new Paragraph({
                children: [
                  new TextRun({ text: "Suggestion: ", bold: true, italics: true }),
                  new TextRun({ text: comment.suggestion, italics: true }),
                ],
              }),
            ],
          });

          paraChildren.push(new CommentRangeStart(cId));
        }

        paraChildren.push(new TextRun({ text: para.text, size: 20 }));

        for (let i = comments.length - 1; i >= 0; i--) {
          const cId = commentId - comments.length + i;
          paraChildren.push(new CommentRangeEnd(cId));
          paraChildren.push(new CommentReference(cId));
        }

        children.push(
          new Paragraph({
            children: paraChildren,
            spacing: { after: 120 },
          })
        );
      }
    }
  }

  return { children, commentOptions };
}

// ---------------------------------------------------------------------------
// Section 3: Improvement appendix
// ---------------------------------------------------------------------------

function buildAppendix(appendixItems: ImprovementAppendixItem[] | undefined): Paragraph[] {
  const children: Paragraph[] = [];

  children.push(new Paragraph({ children: [new PageBreak()] }));

  children.push(
    new Paragraph({
      children: [
        new TextRun({ text: "Improvement Appendix", bold: true, size: 32, color: "1F3864" }),
      ],
      heading: HeadingLevel.HEADING_1,
      spacing: { after: 200 },
    })
  );

  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: "Detailed improvement recommendations organised by funder criterion.",
          size: 20,
          color: "666666",
          italics: true,
        }),
      ],
      spacing: { after: 300 },
    })
  );

  if (!appendixItems || appendixItems.length === 0) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: "No appendix items were generated.", size: 20, italics: true })],
      })
    );
    return children;
  }

  for (const item of appendixItems) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: `${item.criterion_id}: ${item.criterion}`,
            bold: true,
            size: 24,
            color: "1F3864",
          }),
        ],
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 300, after: 120 },
      })
    );

    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: "What the funder wants: ", bold: true, size: 20 }),
          new TextRun({ text: item.what_funder_wants, size: 20 }),
        ],
        spacing: { after: 80 },
      })
    );

    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: "How the bid addresses it: ", bold: true, size: 20 }),
          new TextRun({ text: item.how_bid_addresses, size: 20 }),
        ],
        spacing: { after: 80 },
      })
    );

    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: "What's missing: ", bold: true, size: 20, color: "FF0000" }),
          new TextRun({ text: item.whats_missing, size: 20 }),
        ],
        spacing: { after: 80 },
      })
    );

    if (item.example_language) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: "Suggested language: ", bold: true, size: 20, color: "00B050" }),
          ],
          spacing: { after: 40 },
        })
      );
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: `"${item.example_language}"`, size: 20, italics: true }),
          ],
          spacing: { after: 120 },
          indent: { left: 720 },
        })
      );
    }
  }

  return children;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function generateReviewDoc(
  parsedBid: ParsedBid,
  sectionAnalyses: SectionAnalysis[],
  scoring: Scoring,
  bidName: string
): Promise<Buffer> {
  const scorecardChildren = buildScorecardPage(scoring, bidName);
  const { children: annotatedChildren, commentOptions } = buildAnnotatedBid(
    parsedBid,
    sectionAnalyses
  );
  const appendixChildren = buildAppendix(scoring.improvement_appendix);

  const doc = new Document({
    comments: {
      children: commentOptions,
    },
    sections: [
      {
        children: [
          ...scorecardChildren,
          ...(annotatedChildren as Paragraph[]),
          ...appendixChildren,
        ],
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);

  // Post-process to fix Word Online compatibility issues with comments.
  // docx.js generates XML that desktop Word tolerates but Word Online rejects:
  //   1. <w:commentReference> must be wrapped in <w:r> (run) elements
  //   2. Comment dates must not contain milliseconds
  //   3. Comments need w:initials attribute
  if (commentOptions.length > 0) {
    return fixCommentXml(Buffer.from(buffer));
  }

  return Buffer.from(buffer);
}

// ---------------------------------------------------------------------------
// Word Online compatibility fix for comments
// ---------------------------------------------------------------------------

function fixCommentXml(buffer: Buffer): Buffer {
  const zip = new AdmZip(buffer);

  // Fix 1: Wrap bare <w:commentReference> in <w:r> in document.xml
  const docEntry = zip.getEntry("word/document.xml");
  if (docEntry) {
    let docXml = docEntry.getData().toString("utf8");
    docXml = docXml.replace(
      /<w:commentReference\s+w:id="(\d+)"\/>/g,
      '<w:r><w:commentReference w:id="$1"/></w:r>'
    );
    zip.updateFile("word/document.xml", Buffer.from(docXml, "utf8"));
  }

  // Fix 2 & 3: Strip milliseconds from dates, add initials in comments.xml
  const commentsEntry = zip.getEntry("word/comments.xml");
  if (commentsEntry) {
    let commentsXml = commentsEntry.getData().toString("utf8");

    // 2026-02-23T18:15:54.559Z → 2026-02-23T18:15:54Z
    commentsXml = commentsXml.replace(
      /w:date="(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})\.\d+Z"/g,
      'w:date="$1Z"'
    );

    // Add w:initials if missing
    commentsXml = commentsXml.replace(
      /w:author="([^"]+)"(?!\s+w:initials)/g,
      (_match: string, author: string) => {
        const initials = author
          .split(/\s+/)
          .map((w: string) => w[0])
          .join("")
          .toUpperCase();
        return `w:author="${author}" w:initials="${initials}"`;
      }
    );

    zip.updateFile("word/comments.xml", Buffer.from(commentsXml, "utf8"));
  }

  return zip.toBuffer();
}
