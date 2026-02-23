import { describe, it, expect } from "vitest";
import { parseBid } from "../parse-bid";
import fs from "fs";
import path from "path";

const EXAMPLE_BIDS_DIR = path.resolve(__dirname, "../../../../..", "ExampleBids");

describe("parseBid", () => {
  it("parses a real .docx bid with heading styles", async () => {
    const filePath = path.join(
      EXAMPLE_BIDS_DIR,
      "Archer Trust Application - Transform Training 1158831.docx"
    );
    if (!fs.existsSync(filePath)) {
      console.log("Skipping: ExampleBids not available");
      return;
    }

    const buffer = fs.readFileSync(filePath);
    const result = await parseBid(Buffer.from(buffer), "Archer Trust Application.docx");

    expect(result.metadata.source_file).toBe("Archer Trust Application.docx");
    expect(result.metadata.total_words).toBeGreaterThan(100);
    expect(result.metadata.total_sections).toBeGreaterThan(0);
    expect(result.metadata.total_paragraphs).toBeGreaterThan(0);
    expect(result.sections.length).toBeGreaterThan(0);
    expect(result.full_text.length).toBeGreaterThan(100);

    // Every section should have an ID and title
    for (const section of result.sections) {
      expect(section.id).toMatch(/^s\d+$/);
      expect(section.title).toBeTruthy();
      expect(section.paragraph_ids.length).toBeGreaterThanOrEqual(0);
    }

    // Every paragraph should have proper structure
    for (const [id, para] of Object.entries(result.paragraphs)) {
      expect(id).toMatch(/^p\d+$/);
      expect(para.id).toBe(id);
      expect(para.section_id).toMatch(/^s\d+$/);
      expect(para.text.length).toBeGreaterThan(0);
      expect(para.word_count).toBeGreaterThan(0);
    }
  });

  it("parses a bid that uses bold-as-heading fallback", async () => {
    const filePath = path.join(
      EXAMPLE_BIDS_DIR,
      "Awards for All - C&C application V1.docx"
    );
    if (!fs.existsSync(filePath)) {
      console.log("Skipping: ExampleBids not available");
      return;
    }

    const buffer = fs.readFileSync(filePath);
    const result = await parseBid(Buffer.from(buffer), "Awards for All.docx");

    expect(result.metadata.total_sections).toBeGreaterThan(0);
    expect(result.metadata.total_paragraphs).toBeGreaterThan(0);
    expect(Object.keys(result.paragraphs).length).toBe(result.metadata.total_paragraphs);
  });

  it("handles minimal content gracefully", async () => {
    // Create a minimal HTML-producing buffer using mammoth
    // We can't easily create a .docx in-memory without docx lib,
    // so test with a real small file if available
    const filePath = path.join(
      EXAMPLE_BIDS_DIR,
      "section_10_value_for_money jobs guarantee.docx"
    );
    if (!fs.existsSync(filePath)) {
      console.log("Skipping: ExampleBids not available");
      return;
    }

    const buffer = fs.readFileSync(filePath);
    const result = await parseBid(Buffer.from(buffer), "small-bid.docx");

    expect(result.sections.length).toBeGreaterThan(0);
    expect(result.metadata.parsed_at).toBeTruthy();
  });
});
