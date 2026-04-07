import { z } from "zod";
import { callClaude } from "./anthropic";

const MODEL = "claude-haiku-4-5-20251001";

const ExtractAnswersResponseSchema = z.object({
  answers: z.array(
    z.object({
      question_id: z.string(),
      answer_text: z.string(),
    })
  ),
});

const SYSTEM_PROMPT = `You extract answers to specific questions from a document.

Given a document and a list of questions (each with an id), find the text in the document that best answers each question.

Rules:
- The document may contain section headings (lines starting with #). Use these headings to identify which part of the document corresponds to each question.
- Return the relevant text verbatim from the document — do not paraphrase or summarise
- If a question is not addressed in the document, return an empty string for that question
- Return every question id in the response, even if the answer is empty
- Do not add content that is not in the document
- Preserve paragraph breaks within an answer using newlines`;

export async function extractAnswersFromDocument(
  documentText: string,
  questions: Array<{ id: string; question: string }>
): Promise<Array<{ question_id: string; answer_text: string }>> {
  const questionList = questions
    .map((q, i) => `${i + 1}. [id: ${q.id}] ${q.question}`)
    .join("\n");

  const result = await callClaude({
    systemPrompt: SYSTEM_PROMPT,
    prompt: `Questions:\n${questionList}\n\nDocument:\n${documentText}`,
    schema: ExtractAnswersResponseSchema,
    model: MODEL,
    maxTokens: 4096,
    temperature: 0,
  });

  return result.answers;
}
