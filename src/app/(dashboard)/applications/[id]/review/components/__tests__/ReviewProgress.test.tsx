// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("ReviewProgress", () => {
  let React: typeof import("react");
  let render: typeof import("@testing-library/react").render;
  let cleanup: typeof import("@testing-library/react").cleanup;
  let screen: typeof import("@testing-library/react").screen;
  let fireEvent: typeof import("@testing-library/react").fireEvent;

  beforeEach(async () => {
    React = await import("react");
    const rtl = await import("@testing-library/react");
    render = rtl.render;
    cleanup = rtl.cleanup;
    screen = rtl.screen;
    fireEvent = rtl.fireEvent;
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  async function renderProgress(overrides: Record<string, unknown> = {}) {
    const { ReviewProgress } = await import("../ReviewProgress");
    const defaultProps = {
      review: { status: "pending", progress: {} },
      cancellingReview: false,
      showCancelConfirm: false,
      onCancel: vi.fn(),
    };
    return render(
      React.createElement(ReviewProgress, { ...defaultProps, ...overrides })
    );
  }

  it("shows the Queued step as current when status is pending", async () => {
    await renderProgress({ review: { status: "pending", progress: {} } });
    const label = screen.getByText("Queued");
    expect(label.className).toContain("text-blue-600");
  });

  it("shows Queued as done and Analysing answers as current when status is analysing", async () => {
    await renderProgress({ review: { status: "analysing", progress: {} } });
    const queued = screen.getByText("Queued");
    const analysing = screen.getByText("Analysing answers");
    expect(queued.className).toContain("text-zinc-500");
    expect(analysing.className).toContain("text-blue-600");
  });

  it("shows scoring as pending when status is analysing", async () => {
    await renderProgress({ review: { status: "analysing", progress: {} } });
    const scoring = screen.getByText("Scoring");
    expect(scoring.className).toContain("text-zinc-400");
  });

  it("renders an interactive cancel button when status is pending", async () => {
    await renderProgress({ review: { status: "pending", progress: {} } });
    const btn = screen.getByRole("button", { name: "Cancel review" });
    expect((btn as HTMLButtonElement).disabled).toBe(false);
  });

  it("renders a disabled cancel button when status is analysing", async () => {
    await renderProgress({ review: { status: "analysing", progress: {} } });
    const btn = screen.getByRole("button", { name: "Cancel review" });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows Cancelling... when cancellingReview is true", async () => {
    await renderProgress({
      review: { status: "pending", progress: {} },
      cancellingReview: true,
    });
    expect(screen.getByText("Cancelling...")).toBeDefined();
  });

  it("shows confirmation text when showCancelConfirm is true", async () => {
    await renderProgress({
      review: { status: "pending", progress: {} },
      showCancelConfirm: true,
    });
    expect(screen.getByText("Are you sure? Click to confirm")).toBeDefined();
  });

  it("calls onCancel when cancel button is clicked", async () => {
    const onCancel = vi.fn();
    await renderProgress({
      review: { status: "pending", progress: {} },
      onCancel,
    });
    fireEvent.click(screen.getByRole("button", { name: "Cancel review" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
