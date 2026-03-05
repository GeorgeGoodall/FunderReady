import type { GoogleGenAI } from "@google/genai";

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 2000;

/**
 * Wraps `client.models.generateContent` with retry + exponential backoff for 429 (RESOURCE_EXHAUSTED) errors.
 */
export async function geminiWithRetry(
  client: GoogleGenAI,
  params: Parameters<GoogleGenAI["models"]["generateContent"]>[0]
): ReturnType<GoogleGenAI["models"]["generateContent"]> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await client.models.generateContent(params);
    } catch (error: unknown) {
      const isRetryable =
        error instanceof Error &&
        (error.message.includes("429") ||
          error.message.includes("RESOURCE_EXHAUSTED") ||
          error.message.includes("503") ||
          error.message.includes("UNAVAILABLE"));

      if (!isRetryable || attempt === MAX_RETRIES) throw error;

      const delay = BASE_DELAY_MS * 2 ** attempt;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  // Unreachable, but satisfies TypeScript
  throw new Error("geminiWithRetry: exhausted retries");
}
