// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { computeNewSentiment, sendFeedback } from "../FeedbackButton";

// ---------------------------------------------------------------------------
// computeNewSentiment — pure toggle logic
// ---------------------------------------------------------------------------

describe("computeNewSentiment", () => {
  it("returns null when clicking the same button (toggle off)", () => {
    expect(computeNewSentiment("up", "up")).toBeNull();
    expect(computeNewSentiment("down", "down")).toBeNull();
  });

  it("switches sentiment when clicking a different button", () => {
    expect(computeNewSentiment("up", "down")).toBe("down");
    expect(computeNewSentiment("down", "up")).toBe("up");
  });

  it("sets sentiment when current is null", () => {
    expect(computeNewSentiment(null, "up")).toBe("up");
    expect(computeNewSentiment(null, "down")).toBe("down");
  });
});

// ---------------------------------------------------------------------------
// sendFeedback — fetch wrapper with error handling
// ---------------------------------------------------------------------------

describe("sendFeedback", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("sends PATCH to the correct URL with correct payload", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });

    await sendFeedback("app-1", "rev-1", "criteria_scores/c1", "criteria_score", "up");

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/applications/app-1/reviews/rev-1/feedback",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          item_path: "criteria_scores/c1",
          item_type: "criteria_score",
          sentiment: "up",
        }),
      }
    );
  });

  it("sends null sentiment for toggle-off", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });

    await sendFeedback("app-1", "rev-1", "criteria_scores/c1", "criteria_score", null);

    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: JSON.stringify({
          item_path: "criteria_scores/c1",
          item_type: "criteria_score",
          sentiment: null,
        }),
      })
    );
  });

  it("returns true on successful response", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });

    const result = await sendFeedback("app-1", "rev-1", "path", "strength", "up");
    expect(result).toBe(true);
  });

  it("returns false on non-ok response (server error)", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, status: 500 });

    const result = await sendFeedback("app-1", "rev-1", "path", "strength", "up");
    expect(result).toBe(false);
  });

  it("returns false on network error (fetch throws)", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new TypeError("Failed to fetch"));

    const result = await sendFeedback("app-1", "rev-1", "path", "strength", "up");
    expect(result).toBe(false);
  });

  it("constructs correct URL for different application/review IDs", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });

    await sendFeedback("app-xyz", "rev-abc", "answer_feedback/q3/inline_comments/2", "inline_comment", "down");

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/applications/app-xyz/reviews/rev-abc/feedback",
      expect.objectContaining({
        body: JSON.stringify({
          item_path: "answer_feedback/q3/inline_comments/2",
          item_type: "inline_comment",
          sentiment: "down",
        }),
      })
    );
  });
});

// ---------------------------------------------------------------------------
// FeedbackButton component rendering & interaction
// ---------------------------------------------------------------------------

describe("FeedbackButton component", () => {
  // Dynamic import to avoid module-level JSX/React issues in test environment
  let React: typeof import("react");
  let render: typeof import("@testing-library/react").render;
  let cleanup: typeof import("@testing-library/react").cleanup;
  let screen: typeof import("@testing-library/react").screen;
  let fireEvent: typeof import("@testing-library/react").fireEvent;
  let waitFor: typeof import("@testing-library/react").waitFor;
  let act: typeof import("react").act;

  beforeEach(async () => {
    React = await import("react");
    const rtl = await import("@testing-library/react");
    render = rtl.render;
    cleanup = rtl.cleanup;
    screen = rtl.screen;
    fireEvent = rtl.fireEvent;
    waitFor = rtl.waitFor;
    act = React.act;
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  const defaultProps = {
    reviewId: "rev-1",
    applicationId: "app-1",
    itemPath: "criteria_scores/c1",
    itemType: "criteria_score" as const,
    currentSentiment: null as "up" | "down" | null,
  };

  async function renderButton(overrides = {}) {
    const { FeedbackButton } = await import("../FeedbackButton");
    return render(React.createElement(FeedbackButton, { ...defaultProps, ...overrides }));
  }

  it("renders both thumbs-up and thumbs-down buttons", async () => {
    await renderButton();
    expect(screen.getByLabelText("Mark as helpful")).toBeDefined();
    expect(screen.getByLabelText("Mark as not helpful")).toBeDefined();
  });

  it("sends feedback on thumbs-up click", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });

    await renderButton();
    await act(async () => {
      fireEvent.click(screen.getByLabelText("Mark as helpful"));
    });

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "/api/applications/app-1/reviews/rev-1/feedback",
        expect.objectContaining({
          method: "PATCH",
          body: expect.stringContaining('"sentiment":"up"'),
        })
      );
    });
  });

  it("disables buttons while saving", async () => {
    let resolvePromise: (v: unknown) => void;
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockReturnValue(
      new Promise((r) => { resolvePromise = r; })
    );

    await renderButton();
    await act(async () => {
      fireEvent.click(screen.getByLabelText("Mark as helpful"));
    });

    // Buttons should be disabled while fetch is pending
    expect(screen.getByLabelText("Mark as helpful")).toHaveProperty("disabled", true);
    expect(screen.getByLabelText("Mark as not helpful")).toHaveProperty("disabled", true);

    // Resolve the fetch
    await act(async () => {
      resolvePromise!({ ok: true });
    });

    // Buttons should be re-enabled
    await waitFor(() => {
      expect(screen.getByLabelText("Mark as helpful")).toHaveProperty("disabled", false);
    });
  });

  it("reverts optimistic update on API failure", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false });

    const onSentimentChange = vi.fn();
    await renderButton({ onSentimentChange });

    await act(async () => {
      fireEvent.click(screen.getByLabelText("Mark as helpful"));
    });

    await waitFor(() => {
      // First call: optimistic "up", second call: revert to null
      expect(onSentimentChange).toHaveBeenCalledTimes(2);
      expect(onSentimentChange).toHaveBeenNthCalledWith(1, "criteria_scores/c1", "up");
      expect(onSentimentChange).toHaveBeenNthCalledWith(2, "criteria_scores/c1", null);
    });
  });

  it("calls onSentimentChange with new sentiment on success", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });

    const onSentimentChange = vi.fn();
    await renderButton({ onSentimentChange });

    await act(async () => {
      fireEvent.click(screen.getByLabelText("Mark as not helpful"));
    });

    await waitFor(() => {
      // Only one call — optimistic update, no revert
      expect(onSentimentChange).toHaveBeenCalledTimes(1);
      expect(onSentimentChange).toHaveBeenCalledWith("criteria_scores/c1", "down");
    });
  });

  it("toggles off when clicking same button", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });

    const onSentimentChange = vi.fn();
    await renderButton({ currentSentiment: "up", onSentimentChange });

    await act(async () => {
      fireEvent.click(screen.getByLabelText("Mark as helpful"));
    });

    await waitFor(() => {
      expect(onSentimentChange).toHaveBeenCalledWith("criteria_scores/c1", null);
    });
  });
});
