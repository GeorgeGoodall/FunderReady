import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock Anthropic SDK
// ---------------------------------------------------------------------------

const mockCreate = vi.fn();

class MockAnthropic {
  messages = { create: mockCreate };
}

vi.mock("@anthropic-ai/sdk", () => ({
  default: MockAnthropic,
}));

// Mock logAiUsage
const mockLogAiUsage = vi.fn();
vi.mock("../log-usage", () => ({
  logAiUsage: (...args: unknown[]) => mockLogAiUsage(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("detectFundName", () => {
  async function importModule() {
    const mod = await import("../detect-fund");
    return mod.detectFundName;
  }

  const makeResponse = (text: string) => ({
    content: [{ type: "text" as const, text }],
    usage: {
      input_tokens: 100,
      output_tokens: 10,
    },
  });

  it("returns detected fund name on success", async () => {
    mockCreate.mockResolvedValue(makeResponse("Community Ownership Fund"));
    const detectFundName = await importModule();
    const result = await detectFundName("This bid is for the Community Ownership Fund...", "user-1");
    expect(result).toBe("Community Ownership Fund");
  });

  it("returns null when AI returns UNKNOWN", async () => {
    mockCreate.mockResolvedValue(makeResponse("UNKNOWN"));
    const detectFundName = await importModule();
    const result = await detectFundName("Some vague text", "user-1");
    expect(result).toBeNull();
  });

  it("returns null for short results (less than 3 chars)", async () => {
    mockCreate.mockResolvedValue(makeResponse("No"));
    const detectFundName = await importModule();
    const result = await detectFundName("Some text", "user-1");
    expect(result).toBeNull();
  });

  it("returns null when no text block in response", async () => {
    mockCreate.mockResolvedValue({
      content: [],
      usage: { input_tokens: 100, output_tokens: 0 },
    });
    const detectFundName = await importModule();
    const result = await detectFundName("Some text", "user-1");
    expect(result).toBeNull();
  });

  it("truncates input to 2000 chars", async () => {
    mockCreate.mockResolvedValue(makeResponse("National Lottery Fund"));
    const detectFundName = await importModule();
    const longText = "A".repeat(5000);
    await detectFundName(longText, "user-1");

    const callArgs = mockCreate.mock.calls[0][0];
    const userContent = callArgs.messages[0].content;
    // The user content includes a prefix, but the text portion is sliced to 2000
    expect(userContent.length).toBeLessThan(5000);
    expect(userContent).toContain("A".repeat(100));
  });

  it("uses claude-haiku model", async () => {
    mockCreate.mockResolvedValue(makeResponse("Arts Council Fund"));
    const detectFundName = await importModule();
    await detectFundName("Test text", "user-1");

    const callArgs = mockCreate.mock.calls[0][0];
    expect(callArgs.model).toBe("claude-haiku-4-5-20251001");
  });

  it("calls logAiUsage with correct parameters", async () => {
    mockCreate.mockResolvedValue(makeResponse("Heritage Fund"));
    const detectFundName = await importModule();
    await detectFundName("Some bid text", "user-42");

    // logAiUsage is called with void (fire-and-forget), check it was called
    expect(mockLogAiUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-42",
        pipelineStep: "detect_fund",
        model: "claude-haiku-4-5-20251001",
        usage: expect.objectContaining({
          input_tokens: 100,
          output_tokens: 10,
        }),
      })
    );
  });
});
