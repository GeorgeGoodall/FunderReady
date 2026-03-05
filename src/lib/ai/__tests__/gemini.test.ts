import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { GoogleGenAI } from "@google/genai";
import { geminiWithRetry } from "../gemini";

const mockGenerateContent = vi.fn();

const mockClient = {
  models: { generateContent: mockGenerateContent },
} as unknown as GoogleGenAI;

const testParams = {
  model: "gemini-2.5-flash-lite",
  contents: "test prompt",
  config: { maxOutputTokens: 64 },
};

describe("geminiWithRetry", () => {
  beforeEach(() => {
    mockGenerateContent.mockReset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("passes through successful responses", async () => {
    const response = { text: "result", usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 } };
    mockGenerateContent.mockResolvedValue(response);

    const result = await geminiWithRetry(mockClient, testParams);

    expect(result).toBe(response);
    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
  });

  it("retries on 429 RESOURCE_EXHAUSTED errors", async () => {
    mockGenerateContent
      .mockRejectedValueOnce(new Error("429 RESOURCE_EXHAUSTED"))
      .mockResolvedValueOnce({ text: "ok" });

    const promise = geminiWithRetry(mockClient, testParams);
    // Advance past the first retry delay (2000ms)
    await vi.advanceTimersByTimeAsync(2000);
    const result = await promise;

    expect(result).toEqual({ text: "ok" });
    expect(mockGenerateContent).toHaveBeenCalledTimes(2);
  });

  it("retries on 503 UNAVAILABLE errors", async () => {
    mockGenerateContent
      .mockRejectedValueOnce(new Error("503 UNAVAILABLE"))
      .mockResolvedValueOnce({ text: "recovered" });

    const promise = geminiWithRetry(mockClient, testParams);
    await vi.advanceTimersByTimeAsync(2000);
    const result = await promise;

    expect(result).toEqual({ text: "recovered" });
    expect(mockGenerateContent).toHaveBeenCalledTimes(2);
  });

  it("throws immediately on non-retryable errors", async () => {
    mockGenerateContent.mockRejectedValue(new Error("400 Invalid request"));

    await expect(geminiWithRetry(mockClient, testParams)).rejects.toThrow("400 Invalid request");
    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
  });

  it("throws after max retries exceeded", async () => {
    const error = new Error("429 RESOURCE_EXHAUSTED");
    mockGenerateContent.mockRejectedValue(error);

    const promise = geminiWithRetry(mockClient, testParams);

    // Advance through all retry delays: 2000, 4000, 8000
    await vi.advanceTimersByTimeAsync(2000);
    await vi.advanceTimersByTimeAsync(4000);
    await vi.advanceTimersByTimeAsync(8000);

    await expect(promise).rejects.toThrow("429 RESOURCE_EXHAUSTED");
    // 1 initial + 3 retries = 4 attempts
    expect(mockGenerateContent).toHaveBeenCalledTimes(4);
  });

  it("uses exponential backoff between retries", async () => {
    mockGenerateContent
      .mockRejectedValueOnce(new Error("429"))
      .mockRejectedValueOnce(new Error("429"))
      .mockResolvedValueOnce({ text: "ok" });

    const promise = geminiWithRetry(mockClient, testParams);

    // First retry after 2000ms (2000 * 2^0)
    await vi.advanceTimersByTimeAsync(2000);
    expect(mockGenerateContent).toHaveBeenCalledTimes(2);

    // Second retry after 4000ms (2000 * 2^1)
    await vi.advanceTimersByTimeAsync(4000);
    const result = await promise;

    expect(result).toEqual({ text: "ok" });
    expect(mockGenerateContent).toHaveBeenCalledTimes(3);
  });
});
