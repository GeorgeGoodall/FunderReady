/**
 * Bid parser — converts .docx buffer into structured document map.
 * Ported from prototypes/end-to-end/parse-bid.js
 */

import mammoth from "mammoth";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Paragraph {
  id: string;
  section_id: string;
  text: string;
  word_count: number;
}

export interface Section {
  id: string;
  title: string;
  level: number;
  word_count: number;
  paragraph_ids: string[];
}

export interface ParsedBid {
  metadata: {
    source_file: string;
    parsed_at: string;
    total_words: number;
    total_sections: number;
    total_paragraphs: number;
    heading_styles_detected: boolean;
  };
  sections: Section[];
  paragraphs: Record<string, Paragraph>;
  full_text: string;
}

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface RawSection {
  title: string;
  level: number;
  htmlContent: string;
}

interface HeadingMatch {
  level: number;
  text: string;
  index: number;
}

// ---------------------------------------------------------------------------
// HTML parsing helpers
// ---------------------------------------------------------------------------

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .trim();
}

function wordCount(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

function looksLikeHeading(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > 150) return false;
  if (trimmed.length < 3) return false;

  const headingPatterns = [
    /^(section|part|question|q)\s*\d/i,
    /^\d+[.)]\s+[A-Z]/,
    /^[A-Z][A-Z\s&:–-]{4,}$/,
    /^(executive\s+summary|introduction|background|need|approach|methodology|budget|evaluation|sustainability|impact|outcomes|delivery|partnerships|governance|management|timeline|risk|appendix)/i,
  ];

  return headingPatterns.some((p) => p.test(trimmed));
}

// ---------------------------------------------------------------------------
// Split strategies
// ---------------------------------------------------------------------------

function splitByHeadings(html: string, headingMatches: HeadingMatch[]): RawSection[] {
  const rawSections: RawSection[] = [];

  // Preamble
  if (headingMatches.length > 0 && headingMatches[0].index > 0) {
    const preambleHtml = html.substring(0, headingMatches[0].index);
    const preambleText = stripHtml(preambleHtml);
    if (preambleText.length > 50) {
      rawSections.push({ title: "Preamble", level: 1, htmlContent: preambleHtml });
    }
  }

  for (let i = 0; i < headingMatches.length; i++) {
    const heading = headingMatches[i];
    const nextIndex = i + 1 < headingMatches.length ? headingMatches[i + 1].index : html.length;
    const headingTagEnd = html.indexOf(`</h${heading.level}>`, heading.index);
    const contentStart = headingTagEnd + `</h${heading.level}>`.length;
    const contentHtml = html.substring(contentStart, nextIndex);

    rawSections.push({ title: heading.text, level: heading.level, htmlContent: contentHtml });
  }

  // Merge empty sections into previous
  const sections: RawSection[] = [];
  for (const s of rawSections) {
    const contentText = stripHtml(s.htmlContent);
    const hasContent = contentText.length > 10;

    if (hasContent || sections.length === 0) {
      sections.push({ ...s });
    } else {
      const prev = sections[sections.length - 1];
      if (prev) {
        prev.htmlContent += `<p>${s.title}</p>${s.htmlContent}`;
      }
    }
  }

  return sections;
}

function splitByFallback(html: string): RawSection[] {
  const sections: RawSection[] = [];

  // Try bold-as-heading
  const boldHeadingRegex = /<p>\s*<strong>(.*?)<\/strong>\s*<\/p>/gi;
  const boldHeadings: Array<{ text: string; index: number; fullMatch: string }> = [];
  let bMatch: RegExpExecArray | null;
  while ((bMatch = boldHeadingRegex.exec(html)) !== null) {
    const text = stripHtml(bMatch[1]);
    if (text.length > 2 && text.length < 150 && wordCount(text) < 15) {
      boldHeadings.push({ text, index: bMatch.index, fullMatch: bMatch[0] });
    }
  }

  if (boldHeadings.length >= 2) {
    if (boldHeadings[0].index > 0) {
      const preambleHtml = html.substring(0, boldHeadings[0].index);
      if (stripHtml(preambleHtml).length > 50) {
        sections.push({ title: "Preamble", level: 1, htmlContent: preambleHtml });
      }
    }

    for (let i = 0; i < boldHeadings.length; i++) {
      const bh = boldHeadings[i];
      const contentStart = bh.index + bh.fullMatch.length;
      const nextIndex = i + 1 < boldHeadings.length ? boldHeadings[i + 1].index : html.length;
      sections.push({ title: bh.text, level: 1, htmlContent: html.substring(contentStart, nextIndex) });
    }

    return sections;
  }

  // Last resort: split by content patterns
  const allParas = html.split(/<p>/).filter((p) => p.trim());

  let currentSection: RawSection = { title: "Document Content", level: 1, htmlContent: "" };
  sections.push(currentSection);

  for (const paraHtml of allParas) {
    const text = stripHtml(paraHtml);
    if (looksLikeHeading(text)) {
      currentSection = { title: text, level: 1, htmlContent: "" };
      sections.push(currentSection);
    } else {
      currentSection.htmlContent += `<p>${paraHtml}`;
    }
  }

  return sections.filter(
    (s) => stripHtml(s.htmlContent).length > 0 || s.title !== "Document Content"
  );
}

// ---------------------------------------------------------------------------
// Paragraph extraction
// ---------------------------------------------------------------------------

function extractParagraphs(html: string): string[] {
  const paragraphs: string[] = [];

  const paraRegex = /<(?:p|li)[^>]*>([\s\S]*?)<\/(?:p|li)>/gi;
  let pMatch: RegExpExecArray | null;
  while ((pMatch = paraRegex.exec(html)) !== null) {
    const text = stripHtml(pMatch[1]);
    if (text.length > 0) {
      paragraphs.push(text);
    }
  }

  // Table cells
  const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
  while ((pMatch = cellRegex.exec(html)) !== null) {
    const text = stripHtml(pMatch[1]);
    if (text.length > 10) {
      paragraphs.push(text);
    }
  }

  // Fallback: split on newlines
  if (paragraphs.length === 0) {
    const plainText = stripHtml(html);
    if (plainText.length > 0) {
      const lines = plainText.split(/\n+/).filter((l) => l.trim().length > 0);
      paragraphs.push(...lines);
    }
  }

  return paragraphs;
}

// ---------------------------------------------------------------------------
// Main parser
// ---------------------------------------------------------------------------

export async function parseBid(buffer: Buffer, fileName: string): Promise<ParsedBid> {
  const [htmlResult, textResult] = await Promise.all([
    mammoth.convertToHtml({ buffer }),
    mammoth.extractRawText({ buffer }),
  ]);

  const html = htmlResult.value;
  const fullText = textResult.value;
  const totalWords = wordCount(fullText);

  // Detect heading tags
  const headingRegex = /<h(\d)>(.*?)<\/h\1>/gi;
  const headingMatches: HeadingMatch[] = [];
  let match: RegExpExecArray | null;
  while ((match = headingRegex.exec(html)) !== null) {
    headingMatches.push({ level: parseInt(match[1]), text: stripHtml(match[2]), index: match.index });
  }

  const hasHeadingStyles = headingMatches.length > 0;

  // Split into sections
  let rawSections: RawSection[];

  if (hasHeadingStyles) {
    const realHeadings = headingMatches.filter((h) => {
      const text = h.text.trim();
      if (text.length > 120) return false;
      if (/^[•·–—-]\s/.test(text)) return false;
      return true;
    });

    rawSections =
      realHeadings.length > 0 ? splitByHeadings(html, realHeadings) : splitByFallback(html);
  } else {
    rawSections = splitByFallback(html);
  }

  if (rawSections.length === 0) {
    rawSections = [{ title: "Full Document", level: 1, htmlContent: html }];
  }

  // Assign IDs and extract paragraphs
  const structuredSections: Section[] = [];
  const paragraphs: Record<string, Paragraph> = {};
  let sectionCounter = 0;
  let paragraphCounter = 0;

  for (const section of rawSections) {
    sectionCounter++;
    const sectionId = `s${sectionCounter}`;
    const paraTexts = extractParagraphs(section.htmlContent);
    const paragraphIds: string[] = [];

    for (const paraText of paraTexts) {
      if (!paraText.trim()) continue;
      paragraphCounter++;
      const paraId = `p${paragraphCounter}`;
      paragraphIds.push(paraId);
      paragraphs[paraId] = {
        id: paraId,
        section_id: sectionId,
        text: paraText,
        word_count: wordCount(paraText),
      };
    }

    const sectionWordCount = paragraphIds.reduce(
      (sum, pid) => sum + (paragraphs[pid]?.word_count || 0),
      0
    );

    structuredSections.push({
      id: sectionId,
      title: section.title,
      level: section.level,
      word_count: sectionWordCount,
      paragraph_ids: paragraphIds,
    });
  }

  return {
    metadata: {
      source_file: fileName,
      parsed_at: new Date().toISOString(),
      total_words: totalWords,
      total_sections: structuredSections.length,
      total_paragraphs: paragraphCounter,
      heading_styles_detected: hasHeadingStyles,
    },
    sections: structuredSections,
    paragraphs,
    full_text: fullText,
  };
}
