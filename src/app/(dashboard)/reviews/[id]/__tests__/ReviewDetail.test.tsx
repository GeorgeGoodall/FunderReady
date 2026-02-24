/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { ReviewDetail } from "../ReviewDetail";

// ---------------------------------------------------------------------------
// Mock next/navigation
// ---------------------------------------------------------------------------

const mockRefresh = vi.fn();
const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh, push: mockPush }),
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

// We also need to mock next/link since ReviewDetail imports it
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const baseReview = {
  id: "rev-1",
  bid_file_name: "Test Bid.docx",
  output_file_path: null,
  error_message: null,
};

const scoringResults = {
  scoring: {
    overall_score: 72,
    overall_descriptor: "Good foundation with gaps to address",
    submission_readiness: "Needs revisions" as const,
    top_strengths: ["Clear objectives", "Strong team"],
    top_improvements: ["Needs more evidence", "Budget unclear"],
    criteria_scores: [
      {
        criterion_id: "c1",
        criterion: "Value for Money",
        score: "Strong" as const,
        bid_evidence: ["Section 3"],
        gaps: [],
        summary: "Well evidenced with clear costings",
      },
      {
        criterion_id: "c2",
        criterion: "Impact",
        score: "Weak" as const,
        bid_evidence: [],
        gaps: ["No metrics"],
        summary: "Lacks measurable outcomes",
      },
    ],
    improvement_appendix: [],
  },
};

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// Failed state
// ---------------------------------------------------------------------------

describe("ReviewDetail — failed state", () => {
  it("shows error message", () => {
    render(
      <ReviewDetail
        review={{ ...baseReview, status: "failed", error_message: "Document is not a bid" }}
        progress={null}
        results={null}
      />
    );
    expect(screen.getByText("Review Failed")).toBeInTheDocument();
    expect(screen.getByText("Document is not a bid")).toBeInTheDocument();
  });

  it("shows default message when error_message is null", () => {
    render(
      <ReviewDetail
        review={{ ...baseReview, status: "failed" }}
        progress={null}
        results={null}
      />
    );
    expect(screen.getByText("An unexpected error occurred.")).toBeInTheDocument();
  });

  it("shows try again link to /new-review", () => {
    render(
      <ReviewDetail
        review={{ ...baseReview, status: "failed" }}
        progress={null}
        results={null}
      />
    );
    const link = screen.getByText("Try again");
    expect(link).toHaveAttribute("href", "/new-review");
  });

  it("does not start polling", () => {
    render(
      <ReviewDetail
        review={{ ...baseReview, status: "failed" }}
        progress={null}
        results={null}
      />
    );
    vi.advanceTimersByTime(10000);
    expect(mockRefresh).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// In-progress state
// ---------------------------------------------------------------------------

describe("ReviewDetail — in-progress state", () => {
  it("shows 'Review in progress' heading", () => {
    render(
      <ReviewDetail
        review={{ ...baseReview, status: "parsing" }}
        progress={{ parse_started: Date.now() }}
        results={null}
      />
    );
    expect(screen.getByText("Review in progress")).toBeInTheDocument();
  });

  it("shows all pipeline step labels", () => {
    render(
      <ReviewDetail
        review={{ ...baseReview, status: "pending" }}
        progress={null}
        results={null}
      />
    );
    expect(screen.getByText("Queued")).toBeInTheDocument();
    expect(screen.getByText("Parsing document")).toBeInTheDocument();
    expect(screen.getByText("Analysing sections")).toBeInTheDocument();
    expect(screen.getByText("Cross-referencing")).toBeInTheDocument();
    expect(screen.getByText("Scoring")).toBeInTheDocument();
    expect(screen.getByText("Generating report")).toBeInTheDocument();
  });

  it("shows section progress during analysing", () => {
    render(
      <ReviewDetail
        review={{ ...baseReview, status: "analysing" }}
        progress={{ sections_completed: 3, sections_total: 8 }}
        results={null}
      />
    );
    expect(screen.getByText(/3\/8 sections/)).toBeInTheDocument();
  });

  it("highlights cross-referencing step when status is cross_referencing", () => {
    render(
      <ReviewDetail
        review={{ ...baseReview, status: "cross_referencing" }}
        progress={{ crossref_started: Date.now() }}
        results={null}
      />
    );
    const label = screen.getByText("Cross-referencing");
    expect(label).toHaveClass("font-medium", "text-blue-600");
  });

  it("shows analysing as completed when cross-referencing is active", () => {
    render(
      <ReviewDetail
        review={{ ...baseReview, status: "cross_referencing" }}
        progress={{ crossref_started: Date.now() }}
        results={null}
      />
    );
    // "Analysing sections" should be styled as done (not current)
    const label = screen.getByText("Analysing sections");
    expect(label).toHaveClass("text-zinc-500");
    expect(label).not.toHaveClass("font-medium");
  });

  it("does not show section count for non-analysing steps", () => {
    render(
      <ReviewDetail
        review={{ ...baseReview, status: "scoring" }}
        progress={{ sections_completed: 8, sections_total: 8 }}
        results={null}
      />
    );
    expect(screen.queryByText(/\d+\/\d+ sections/)).not.toBeInTheDocument();
  });

  it("polls via router.refresh every 3 seconds", () => {
    render(
      <ReviewDetail
        review={{ ...baseReview, status: "parsing" }}
        progress={null}
        results={null}
      />
    );
    expect(mockRefresh).not.toHaveBeenCalled();
    vi.advanceTimersByTime(3000);
    expect(mockRefresh).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(3000);
    expect(mockRefresh).toHaveBeenCalledTimes(2);
  });

  it("shows auto-update message", () => {
    render(
      <ReviewDetail
        review={{ ...baseReview, status: "pending" }}
        progress={null}
        results={null}
      />
    );
    expect(screen.getByText("This page updates automatically.")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Completed state
// ---------------------------------------------------------------------------

describe("ReviewDetail — completed state", () => {
  const completedReview = {
    ...baseReview,
    status: "completed",
    output_file_path: "user-123/rev-1/review-output.docx",
  };

  it("shows overall score", () => {
    render(
      <ReviewDetail review={completedReview} progress={null} results={scoringResults} />
    );
    expect(screen.getByText("72")).toBeInTheDocument();
    expect(screen.getByText("/100")).toBeInTheDocument();
  });

  it("shows submission readiness badge", () => {
    render(
      <ReviewDetail review={completedReview} progress={null} results={scoringResults} />
    );
    expect(screen.getByText("Needs revisions")).toBeInTheDocument();
  });

  it("shows overall descriptor", () => {
    render(
      <ReviewDetail review={completedReview} progress={null} results={scoringResults} />
    );
    expect(screen.getByText("Good foundation with gaps to address")).toBeInTheDocument();
  });

  it("shows top strengths", () => {
    render(
      <ReviewDetail review={completedReview} progress={null} results={scoringResults} />
    );
    expect(screen.getByText("Clear objectives")).toBeInTheDocument();
    expect(screen.getByText("Strong team")).toBeInTheDocument();
  });

  it("shows top improvements", () => {
    render(
      <ReviewDetail review={completedReview} progress={null} results={scoringResults} />
    );
    expect(screen.getByText("Needs more evidence")).toBeInTheDocument();
    expect(screen.getByText("Budget unclear")).toBeInTheDocument();
  });

  it("shows criteria scores with ratings", () => {
    render(
      <ReviewDetail review={completedReview} progress={null} results={scoringResults} />
    );
    expect(screen.getByText("Value for Money")).toBeInTheDocument();
    expect(screen.getByText("Strong")).toBeInTheDocument();
    expect(screen.getByText("Impact")).toBeInTheDocument();
    expect(screen.getByText("Weak")).toBeInTheDocument();
  });

  it("shows criteria summaries", () => {
    render(
      <ReviewDetail review={completedReview} progress={null} results={scoringResults} />
    );
    expect(screen.getByText("Well evidenced with clear costings")).toBeInTheDocument();
    expect(screen.getByText("Lacks measurable outcomes")).toBeInTheDocument();
  });

  it("shows download link with correct href", () => {
    render(
      <ReviewDetail review={completedReview} progress={null} results={scoringResults} />
    );
    const downloadLink = screen.getByText("Download Review (.docx)");
    expect(downloadLink).toHaveAttribute("href", "/api/reviews/rev-1/download");
  });

  it("shows back to dashboard link", () => {
    render(
      <ReviewDetail review={completedReview} progress={null} results={scoringResults} />
    );
    const backLink = screen.getByText(/Back to dashboard/);
    expect(backLink).toHaveAttribute("href", "/dashboard");
  });

  it("does not poll when completed", () => {
    render(
      <ReviewDetail review={completedReview} progress={null} results={scoringResults} />
    );
    vi.advanceTimersByTime(10000);
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it("shows fallback when completed but no scoring results", () => {
    render(
      <ReviewDetail review={completedReview} progress={null} results={{}} />
    );
    expect(
      screen.getByText("Review completed but results are unavailable.")
    ).toBeInTheDocument();
  });
});
