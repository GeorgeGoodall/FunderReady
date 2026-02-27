import Anthropic from "@anthropic-ai/sdk";
import { QuestionsSetSchema, type QuestionsSet } from "@/lib/schemas/criteria";

const SYSTEM_PROMPT = `You are an expert at analysing funder application forms and guidance documents.

Given raw text (copied from a funder's application form, question list, or guidance document), extract structured questions with word count limits and field types.

Return ONLY valid JSON matching this schema:
{
  "questions": [
    {
      "id": "q1",
      "question": "The question text as stated by the funder",
      "word_count_min": 50 (if a minimum is mentioned, otherwise omit),
      "word_count_max": 300 (if a maximum is mentioned, otherwise omit),
      "guidance": "Any help text or guidance notes the funder provides for this question" (omit if none),
      "priority": 3 (1-5, if weighting/priority is mentioned, otherwise omit),
      "field_type": "text_long" (see rules below),
      "options": ["Option A", "Option B"] (only for dropdown, radio, or checkbox — omit otherwise)
    }
  ],
  "overall_word_limit": 5000 (if an overall application word limit is mentioned, otherwise omit)
}

Rules:
- Extract 1-30 questions from the text
- Use sequential IDs: q1, q2, q3, etc.
- Each question should be the actual question/prompt from the funder
- Look for word count limits in formats like: "50 to 300 words", "max 500 words", "up to 1000 words", "(300 words)", "Word limit: 250"
- Extract guidance/help text if the funder provides hints, examples, or "here are some ideas" sections
- Extract priority/weighting if mentioned (map to 1-5 scale)
- If the text mentions an overall word limit for the whole application, include it
- Do NOT invent questions that aren't in the text
- If a section has a heading but no explicit question, use the heading as the question

Field type detection rules:
- "text_long": Default. Use for questions asking for descriptions, explanations, or narratives (typically 50+ words expected). Also use when word limits suggest a substantial answer.
- "text_short": Use for questions expecting brief answers — names, titles, dates, amounts, reference numbers, postcodes, single-line responses. Clues: "Name of organisation", "Project title", "Total amount requested", character/word limits under ~50, or clearly factual short answers.
- "dropdown": Use when the funder presents a single-select list like "Select one:", "Choose from:", or a defined set of mutually exclusive options (e.g. regions, categories, funding bands). Include the options in the "options" array.
- "radio": Use when the funder presents yes/no questions or a small set of mutually exclusive choices (e.g. "Yes / No / Not applicable"). Include the options in the "options" array.
- "checkbox": Use when the funder asks to "select all that apply", "tick all that apply", or presents a multi-select list. Include the options in the "options" array.
- When in doubt, default to "text_long" — it's always safe.`;

export async function parseQuestionsWithAI(rawText: string): Promise<QuestionsSet> {
  const client = new Anthropic();

  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 8192,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Extract structured questions and word count limits from this funder guidance:\n\n${rawText}`,
      },
    ],
  });

  console.log(`[parse-questions] stop_reason=${message.stop_reason}, usage: input=${message.usage.input_tokens} output=${message.usage.output_tokens}`);

  if (message.stop_reason === "max_tokens") {
    console.warn("[parse-questions] Response truncated — output hit max_tokens limit");
  }

  const textBlock = message.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text response from AI");
  }

  // Extract JSON from response (may be wrapped in markdown code block)
  let jsonStr = textBlock.text.trim();
  const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1].trim();
  }

  const parsed = JSON.parse(jsonStr);
  return QuestionsSetSchema.parse(parsed);
}
