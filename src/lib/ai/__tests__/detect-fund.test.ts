import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock callClaude (detect-fund now routes through callClaude)
// ---------------------------------------------------------------------------

const mockCallClaude = vi.fn();
vi.mock("../anthropic", () => ({
  callClaude: (...args: unknown[]) => mockCallClaude(...args),
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

  it("returns detected fund name on success", async () => {
    mockCallClaude.mockResolvedValue({ name: "Community Ownership Fund" });
    const detectFundName = await importModule();
    const result = await detectFundName("This bid is for the Community Ownership Fund...", "user-1");
    expect(result).toBe("Community Ownership Fund");
  });

  it("returns null when AI returns UNKNOWN", async () => {
    mockCallClaude.mockResolvedValue({ name: "UNKNOWN" });
    const detectFundName = await importModule();
    const result = await detectFundName("Some vague text", "user-1");
    expect(result).toBeNull();
  });

  it("returns null for short results (less than 3 chars)", async () => {
    mockCallClaude.mockResolvedValue({ name: "No" });
    const detectFundName = await importModule();
    const result = await detectFundName("Some text", "user-1");
    expect(result).toBeNull();
  });

  it("truncates input to 2000 chars", async () => {
    mockCallClaude.mockResolvedValue({ name: "National Lottery Fund" });
    const detectFundName = await importModule();
    const longText = "A".repeat(5000);
    await detectFundName(longText, "user-1");

    const callArgs = mockCallClaude.mock.calls[0][0];
    // prompt should contain only first 2000 chars of the input text
    expect(callArgs.prompt).toContain("A".repeat(100));
    expect(callArgs.prompt.length).toBeLessThan(5000);
  });

  it("uses claude-haiku model", async () => {
    mockCallClaude.mockResolvedValue({ name: "Arts Council Fund" });
    const detectFundName = await importModule();
    await detectFundName("Test text", "user-1");

    const callArgs = mockCallClaude.mock.calls[0][0];
    expect(callArgs.model).toBe("claude-haiku-4-5-20251001");
  });

  it("calls logAiUsage via onUsage callback with correct parameters", async () => {
    mockCallClaude.mockImplementation(async (opts: { onUsage?: (usage: unknown) => void }) => {
      if (opts.onUsage) {
        opts.onUsage({ input_tokens: 100, output_tokens: 10, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 });
      }
      return { name: "Heritage Fund" };
    });
    const detectFundName = await importModule();
    await detectFundName("Some bid text", "user-42");

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
