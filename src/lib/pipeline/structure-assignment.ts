import { z } from "zod";
import type { Criterion } from "./prompt-templates";

export const AssignedSectionSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  content: z.string(),
});

export const StructureAssignmentSchema = z.object({
  sections: z.array(AssignedSectionSchema).min(1).max(20),
});

export type StructureAssignment = z.infer<typeof StructureAssignmentSchema>;
export type AssignedSection = z.infer<typeof AssignedSectionSchema>;

const STRUCTURE_SYSTEM_PROMPT = `You are an expert at analysing grant application documents and identifying their logical structure.

Given a free-form document submitted as part of a funding application, identify the distinct logical sections.

For each section, provide:
- id: a short unique identifier (s1, s2, s3, ...)
- title: a descriptive heading for the section (e.g. "Organisation Overview", "Project Rationale", "Budget Justification", "Evidence of Need")
- content: the exact text from the document that belongs to this section

Rules:
- Extract 2-10 sections based on the document's natural structure and content shifts
- Include ALL document content — do not omit any text
- Each piece of text belongs to exactly one section
- Derive section titles from the content, do not make them up
- Do not add any content that is not in the original document`;

export function buildStructureAssignmentPrompt(
  documentText: string,
  criteria: Criterion[]
): { systemPrompt: string; userPrompt: string } {
  const criteriaList = criteria
    .map((c) => `- ${c.criterion}`)
    .join("\n");

  const userPrompt = `This document is being reviewed against the following funding criteria:\n${criteriaList}\n\nAnalyse the document and extract its logical sections:\n\n${documentText}`;

  return { systemPrompt: STRUCTURE_SYSTEM_PROMPT, userPrompt };
}
