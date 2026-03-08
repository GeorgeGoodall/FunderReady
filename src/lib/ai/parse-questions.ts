import { QuestionsSetSchema, type QuestionsSet } from "@/lib/schemas/criteria";
import type { ZodSchema } from "zod";
import { callClaude, type ClaudeUsageData } from "./anthropic";
import { logAiUsage } from "./log-usage";

const SYSTEM_PROMPT = `You are an expert at analysing funder application forms and guidance documents.

Given raw text (copied from a funder's application form, question list, or guidance document), extract structured questions with word count limits, character limits, and field types.

Rules:
- Extract 1-30 questions from the text
- Use sequential IDs: q1, q2, q3, etc.
- Each question should be the actual question/prompt from the funder
- Look for word count limits in formats like: "50 to 300 words", "max 500 words", "up to 1000 words", "(300 words)", "Word limit: 250"
- Look for character limits in formats like: "max 3000 characters", "3000 character limit", "(3000 chars)", "Character limit: 3000", "maximum of 2000 characters"
- When a character limit is found, set char_count_max. A question can have both word limits AND character limits.
- Extract guidance/help text if the funder provides hints, examples, or "here are some ideas" sections
- Extract priority/weighting if mentioned (map to 1-5 scale)
- If the text mentions an overall word limit for the whole application, include it
- Do NOT invent questions that aren't in the text
- If a section has a heading but no explicit question, use the heading as the question

Field type detection rules:
- "email": Use when the question clearly asks for an email address. Clues: "email", "e-mail", "email address", "contact email". Do NOT set word_count_min or word_count_max for this type.
- "url": Use when the question asks for a website or web address. Clues: "website", "URL", "web address", "online presence", "social media link". Do NOT set word_count_min or word_count_max for this type.
- "phone": Use when the question asks for a phone or telephone number. Clues: "phone", "telephone", "mobile", "contact number". Do NOT set word_count_min or word_count_max for this type.
- "number": Use when the question asks for a single numeric value — amounts, counts, percentages, year. Clues: "how many", "total amount", "number of", "year established", "charity number", "registration number", "£", "budget". Do NOT set word_count_min or word_count_max for this type.
- "text_short": Use for questions expecting a brief free-text answer that is NOT one of the factual types above — names, titles, addresses, postcodes, single-sentence responses. Clues: "Name of organisation", "Project title", "Lead contact name", "Postcode", character/word limits under ~30. Do NOT set word_count_min or word_count_max for this type.
- "text_long": Default. Use for questions asking for descriptions, explanations, or narratives (typically 50+ words expected). Also use when word limits suggest a substantial answer.
- "dropdown": Use when the funder presents a single-select list like "Select one:", "Choose from:", or a defined set of mutually exclusive options (e.g. regions, categories, funding bands). Include the options in the "options" array.
- "radio": Use when the funder presents yes/no questions or a small set of mutually exclusive choices (e.g. "Yes / No / Not applicable"). Include the options in the "options" array.
- "checkbox": Use when the funder asks to "select all that apply", "tick all that apply", or presents a multi-select list. Include the options in the "options" array.
- "date": Use when the question asks for a specific date — e.g., "project start date", "when will the project begin", "anticipated completion date". Do NOT set word_count_min or word_count_max for this type.
- "time": Use when the question asks for a specific time of day — e.g., "start time", "event time". Do NOT set word_count_min or word_count_max for this type.
- "radio_other": Use when the funder presents a small set of mutually exclusive choices (like "radio") BUT also explicitly indicates that applicants can provide a free-text "other" answer — e.g., "Select one (or specify other)", "Yes / No / Other (please describe)". Include the defined options in the "options" array. Do NOT include "Other" in the options array — it is appended automatically.
- "checkbox_other": Use when the funder asks to "select all that apply" with a predefined list AND also explicitly allows a free-text "other" answer — e.g., "Tick all that apply (or specify other)". Include the defined options in the "options" array. Do NOT include "Other" in the options array — it is appended automatically.
- When in doubt, default to "text_long" — it's always safe.`;

const MODEL = "claude-haiku-4-5-20251001";

export async function parseQuestionsWithAI(rawText: string, userId?: string): Promise<QuestionsSet> {
  return callClaude({
    prompt: `Extract structured questions, word count limits, character limits, and field types from this funder guidance:\n\n${rawText}`,
    systemPrompt: SYSTEM_PROMPT,
    schema: QuestionsSetSchema as ZodSchema<QuestionsSet>,
    model: MODEL,
    maxTokens: 8192,
    onUsage: (usage: ClaudeUsageData, isRetry: boolean) => {
      if (!isRetry) {
        void logAiUsage({
          userId,
          pipelineStep: "parse_questions",
          model: MODEL,
          usage,
        });
      }
    },
  });
}
