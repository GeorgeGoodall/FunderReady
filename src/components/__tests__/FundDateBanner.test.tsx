// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { FundDateBanner } from "../FundDateBanner";

describe("FundDateBanner", () => {
  afterEach(() => cleanup());

  it("renders nothing when no dates provided", () => {
    const { container } = render(<FundDateBanner opensAt={null} closesAt={null} />);
    expect(container.firstChild).toBeNull();
  });

  it("shows deadline warning when closes_at is in the past", () => {
    render(<FundDateBanner opensAt={null} closesAt="2025-01-15T00:00:00Z" />);
    expect(screen.getByText(/deadline was/i)).toBeInTheDocument();
    expect(screen.getByText(/15 January 2025/)).toBeInTheDocument();
  });

  it("does not show deadline warning when closes_at is in the future", () => {
    const future = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
    const { container } = render(<FundDateBanner opensAt={null} closesAt={future} />);
    expect(container.querySelector("[role=alert]")).toBeNull();
  });

  it("shows info when opens_at is in the future", () => {
    const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    render(<FundDateBanner opensAt={future} closesAt={null} />);
    expect(screen.getByText(/opens on/i)).toBeInTheDocument();
  });

  it("does not show info when opens_at is in the past", () => {
    const { container } = render(<FundDateBanner opensAt="2025-01-01T00:00:00Z" closesAt={null} />);
    expect(container.firstChild).toBeNull();
  });

  it("shows both banners when deadline is past and opens is future", () => {
    const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    render(<FundDateBanner opensAt={future} closesAt="2025-01-15T00:00:00Z" />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("status")).toBeInTheDocument();
  });
});
