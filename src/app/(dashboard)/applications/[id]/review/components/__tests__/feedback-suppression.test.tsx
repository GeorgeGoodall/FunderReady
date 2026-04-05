// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("CommentHighlight — feedback button suppression", () => {
  let React: typeof import("react");
  let render: typeof import("@testing-library/react").render;
  let cleanup: typeof import("@testing-library/react").cleanup;
  let screen: typeof import("@testing-library/react").screen;

  const mockComment = {
    target_text: "our project",
    category: "ALIGNMENT" as const,
    issue: "Weak alignment with fund priorities",
    suggestion: "Add more specific detail about alignment",
  };

  beforeEach(async () => {
    React = await import("react");
    const rtl = await import("@testing-library/react");
    render = rtl.render;
    cleanup = rtl.cleanup;
    screen = rtl.screen;
    globalThis.fetch = vi.fn();
  });

  afterEach(() => cleanup());

  async function renderComment(overrides: Record<string, unknown> = {}) {
    const { CommentHighlight } = await import("../CommentHighlight");
    return render(
      React.createElement(CommentHighlight, {
        text: "our project",
        comment: mockComment,
        isOpen: true,
        onToggle: vi.fn(),
        reviewId: "rev-1",
        applicationId: "app-1",
        itemPath: "answer_feedback/q1/inline_comments/0",
        feedbackSentiment: null,
        ...overrides,
      })
    );
  }

  it("renders feedback buttons when onFeedbackChange is provided", async () => {
    await renderComment({ onFeedbackChange: vi.fn() });
    expect(screen.queryByLabelText("Mark as helpful")).not.toBeNull();
    expect(screen.queryByLabelText("Mark as not helpful")).not.toBeNull();
  });

  it("hides feedback buttons when onFeedbackChange is not provided", async () => {
    await renderComment(); // no onFeedbackChange
    expect(screen.queryByLabelText("Mark as helpful")).toBeNull();
    expect(screen.queryByLabelText("Mark as not helpful")).toBeNull();
  });
});

describe("CrossReferenceFindingCard — feedback button suppression", () => {
  let React: typeof import("react");
  let render: typeof import("@testing-library/react").render;
  let cleanup: typeof import("@testing-library/react").cleanup;
  let screen: typeof import("@testing-library/react").screen;

  const mockFinding = {
    type: "contradiction" as const,
    severity: "medium" as const,
    confidence: "high" as const,
    description: "Answer Q1 contradicts the claim in Q2",
    suggestion: "Align the two answers",
    sections_involved: ["q1", "q2"],
  };

  beforeEach(async () => {
    React = await import("react");
    const rtl = await import("@testing-library/react");
    render = rtl.render;
    cleanup = rtl.cleanup;
    screen = rtl.screen;
    globalThis.fetch = vi.fn();
  });

  afterEach(() => cleanup());

  async function renderCard(overrides: Record<string, unknown> = {}) {
    const { CrossReferenceFindingCard } = await import("../CrossReferenceFindingCard");
    return render(
      React.createElement(CrossReferenceFindingCard, {
        finding: mockFinding,
        findingIndex: 0,
        questionMap: new Map([["q1", "Question 1"], ["q2", "Question 2"]]),
        criteriaMap: new Map(),
        reviewId: "rev-1",
        applicationId: "app-1",
        ...overrides,
      })
    );
  }

  it("renders feedback button when onFeedbackChange is provided", async () => {
    await renderCard({ onFeedbackChange: vi.fn() });
    expect(screen.queryByLabelText("Mark as helpful")).not.toBeNull();
  });

  it("hides feedback button when onFeedbackChange is not provided", async () => {
    await renderCard(); // no onFeedbackChange
    expect(screen.queryByLabelText("Mark as helpful")).toBeNull();
    expect(screen.queryByLabelText("Mark as not helpful")).toBeNull();
  });
});
